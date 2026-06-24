// src/crawler/extractors/llm-extractor.ts
import Anthropic from '@anthropic-ai/sdk';
import type {
  DealExtractor,
  ExtractContext,
  ExtractionResult,
  RawCandidate,
} from './deal-extractor';

export interface LlmClient {
  complete(prompt: string): Promise<string>;
}

const DEFAULT_MODEL = 'claude-opus-4-8';

function priceToMinor(price: unknown): bigint | null {
  if (price === null || price === undefined) return null;
  const n = Number(String(price).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? BigInt(Math.round(n * 100)) : null;
}

/** Anthropic-backed fallback. Behind LlmClient so tests inject a fake. Used ONLY
 * when StructuredExtractor yields nothing. Strips tags before prompting. */
export class LlmExtractor implements DealExtractor {
  private readonly client?: LlmClient;

  constructor(opts: { apiKey?: string; model?: string; client?: LlmClient }) {
    if (opts.client) {
      this.client = opts.client;
    } else if (opts.apiKey) {
      const sdk = new Anthropic({ apiKey: opts.apiKey });
      const model = opts.model ?? DEFAULT_MODEL;
      this.client = {
        complete: async (prompt: string) => {
          const res = await sdk.messages.create({
            model,
            max_tokens: 1500,
            messages: [{ role: 'user', content: prompt }],
          });
          const block = res.content.find((b) => b.type === 'text');
          return block && block.type === 'text' ? block.text : '';
        },
      };
    }
  }

  async extract(html: string, ctx: ExtractContext): Promise<ExtractionResult> {
    if (!this.client) return { candidates: [] };
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 12_000);
    const prompt =
      `Extract concrete deals/specials from this page as JSON ` +
      `{"deals":[{"title","merchant","categorySlug","address","price","startDate","endDate","isStudentOnly","couponCode"}]}. ` +
      `categorySlug ∈ food|groceries|entertainment. Use null for unknown fields. ` +
      `merchantHint="${ctx.merchantHint ?? ''}". Return ONLY JSON.\n\nPAGE:\n${text}`;

    let raw: string;
    try {
      raw = await this.client.complete(prompt);
    } catch {
      return { candidates: [] };
    }

    let parsed: { deals?: unknown[] } | null;
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = match ? (JSON.parse(match[0]) as { deals?: unknown[] }) : null;
    } catch {
      return { candidates: [] };
    }
    if (!parsed?.deals?.length) return { candidates: [] };

    const candidates: RawCandidate[] = parsed.deals
      .filter((d): d is Record<string, unknown> => !!d && typeof d === 'object' && 'title' in d)
      .map(
        (d): RawCandidate => ({
          title: String(d.title),
          merchant: String(d.merchant ?? ctx.merchantHint ?? ''),
          categorySlug: (['food', 'groceries', 'entertainment'] as string[]).includes(
            String(d.categorySlug),
          )
            ? (d.categorySlug as string)
            : (ctx.defaultCategorySlug ?? 'food'),
          address: String(d.address ?? ''),
          startAt: d.startDate ? new Date(String(d.startDate)) : null,
          expiresAt: d.endDate ? new Date(String(d.endDate)) : null,
          sourceUrl: ctx.url,
          currentPriceMinor: priceToMinor(d.price),
          couponCode: d.couponCode ? String(d.couponCode) : null,
          isStudentOnly: Boolean(d.isStudentOnly),
          extractionPath: 'llm',
        }),
      );
    return { candidates };
  }
}
