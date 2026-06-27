import { Logger } from '@nestjs/common';

/** Verdict for a single URL against a host's robots.txt. */
export type RobotsVerdict = 'allowed' | 'disallowed' | 'unreachable';

/** Per-user-agent rule set parsed from a robots.txt group. */
interface AgentRules {
  allow: string[];
  disallow: string[];
}

/** Cached robots state per origin. `rules === null` means "no restrictions". */
interface CachedRobots {
  rules: Map<string, AgentRules> | null;
  reachable: boolean;
  expiresMs: number;
}

const ROBOTS_CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const ROBOTS_TIMEOUT_MS = 8_000;

/** Strip comments + trim a robots.txt line. */
function cleanLine(raw: string): string {
  const hash = raw.indexOf('#');
  return (hash >= 0 ? raw.slice(0, hash) : raw).trim();
}

/**
 * Minimal robots.txt parser: groups directives by User-agent. Consecutive
 * User-agent lines share the following rule block (per the spec).
 */
export function parseRobots(text: string): Map<string, AgentRules> {
  const groups = new Map<string, AgentRules>();
  let currentAgents: string[] = [];
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = cleanLine(rawLine);
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === 'user-agent') {
      if (!lastWasAgent) currentAgents = [];
      const agent = value.toLowerCase();
      currentAgents.push(agent);
      if (!groups.has(agent)) groups.set(agent, { allow: [], disallow: [] });
      lastWasAgent = true;
    } else if (field === 'allow' || field === 'disallow') {
      lastWasAgent = false;
      for (const a of currentAgents) {
        const g = groups.get(a);
        if (g) (field === 'allow' ? g.allow : g.disallow).push(value);
      }
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

/** Does a robots path rule match `path`? Supports `*` wildcards and `$` anchor. */
function ruleMatches(rule: string, path: string): boolean {
  if (rule === '') return false; // empty rule = no constraint
  if (!rule.includes('*') && !rule.includes('$')) return path.startsWith(rule);
  const escaped = rule.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*');
  const anchored = escaped.endsWith('$') ? `${escaped.slice(0, -1)}$` : escaped;
  try {
    return new RegExp(`^${anchored}`).test(path);
  } catch {
    return path.startsWith(rule.replace(/[*$]/g, ''));
  }
}

/** Longest matching rule length (specificity), or -1 when none match. */
function longestMatch(rules: string[], path: string): number {
  let best = -1;
  for (const r of rules) {
    if (ruleMatches(r, path)) best = Math.max(best, r.length);
  }
  return best;
}

/**
 * Cached, polite robots.txt gate for the crawler (BH7). Fetches /robots.txt once
 * per origin (TTL-cached), then answers allow/disallow for a path + user agent.
 *
 * Policy:
 * - explicit Disallow for our path/UA → `disallowed` (caller fails CLOSED: skip).
 * - robots.txt missing (404) / empty → `allowed`.
 * - robots.txt unreachable (network error / 5xx / timeout) → `unreachable`
 *   (caller fails OPEN with a warning).
 */
export class RobotsChecker {
  private readonly logger = new Logger(RobotsChecker.name);
  private readonly cache = new Map<string, CachedRobots>();

  constructor(
    private readonly userAgent = 'DealyCrawler',
    private readonly fetchFn: typeof fetch = fetch,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async isAllowed(url: string): Promise<RobotsVerdict> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return 'allowed'; // not our job to validate URLs; let the fetcher fail.
    }

    const cached = await this.rulesForOrigin(parsed.origin);
    if (!cached.reachable) return 'unreachable';
    if (!cached.rules || cached.rules.size === 0) return 'allowed';

    const rules = this.selectRules(cached.rules);
    if (!rules) return 'allowed';

    const path = parsed.pathname || '/';
    const disallowLen = longestMatch(rules.disallow, path);
    if (disallowLen < 0) return 'allowed';
    const allowLen = longestMatch(rules.allow, path);
    // Allow wins ties + more-specific matches (standard longest-match precedence).
    return allowLen >= disallowLen ? 'allowed' : 'disallowed';
  }

  /** Pick the most relevant agent group: our UA token, else the `*` wildcard. */
  private selectRules(groups: Map<string, AgentRules>): AgentRules | null {
    const ua = this.userAgent.toLowerCase();
    let specific: AgentRules | null = null;
    for (const [agent, rules] of groups) {
      if (agent !== '*' && agent.length > 0 && ua.includes(agent)) {
        specific = rules;
        break;
      }
    }
    return specific ?? groups.get('*') ?? null;
  }

  private async rulesForOrigin(origin: string): Promise<CachedRobots> {
    const now = this.now();
    const hit = this.cache.get(origin);
    if (hit && hit.expiresMs > now) return hit;

    const entry = await this.fetchRobots(origin, now);
    this.cache.set(origin, entry);
    return entry;
  }

  private async fetchRobots(origin: string, now: number): Promise<CachedRobots> {
    const expiresMs = now + ROBOTS_CACHE_TTL_MS;
    try {
      const res = await this.fetchFn(`${origin}/robots.txt`, {
        headers: { 'User-Agent': this.userAgent },
        signal: AbortSignal.timeout(ROBOTS_TIMEOUT_MS),
      });
      // Missing robots.txt (or any 4xx) = no restrictions → allowed.
      if (res.status >= 400 && res.status < 500) {
        return { rules: null, reachable: true, expiresMs };
      }
      if (!res.ok) {
        // 5xx → treat as unreachable (fail open with warning).
        this.logger.warn(`robots.txt ${origin} → ${res.status}; failing open`);
        return { rules: null, reachable: false, expiresMs };
      }
      const text = await res.text();
      return { rules: parseRobots(text), reachable: true, expiresMs };
    } catch (err) {
      this.logger.warn(`robots.txt ${origin} unreachable (${(err as Error).message}); failing open`);
      return { rules: null, reachable: false, expiresMs };
    }
  }
}
