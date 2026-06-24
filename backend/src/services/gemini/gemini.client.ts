import type { GeminiGenerateJsonRequest } from './gemini.types';

export interface GeminiClientOptions {
  apiKey?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
  /** Override for tests / alternate hosts. Defaults to the public v1beta endpoint. */
  baseUrl?: string;
  /** Retries for transient failures (429 / 5xx incl. the common 503 overload). */
  maxRetries?: number;
  retryDelayMs?: number;
}

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Translate a JSON-Schema subset into Gemini's `responseSchema` dialect. Gemini
 * rejects nullable unions (`type: ['string', 'null']` → "Proto field is not
 * repeating"); it expects a single `type` plus `nullable: true`. Lowercase type
 * names, `enum`, `required`, `properties`, and `items` are accepted as-is, so we
 * only rewrite union types and recurse through nested schemas.
 */
export function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!schema || typeof schema !== 'object') return schema;

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (key === 'type' && Array.isArray(value)) {
      const types = (value as string[]).filter((t) => t !== 'null');
      out.type = types[0];
      if ((value as string[]).includes('null')) out.nullable = true;
    } else if (key === 'properties' && value && typeof value === 'object') {
      const props: Record<string, unknown> = {};
      for (const [propKey, propValue] of Object.entries(value as Record<string, unknown>)) {
        props[propKey] = toGeminiSchema(propValue);
      }
      out.properties = props;
    } else if (key === 'items') {
      out.items = toGeminiSchema(value);
    } else {
      // enum / required / description / scalar type pass through unchanged.
      out[key] = value;
    }
  }
  return out;
}

export class GeminiClient {
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(private readonly opts: GeminiClientOptions) {
    this.fetchFn = opts.fetchFn ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.maxRetries = opts.maxRetries ?? 4;
    this.retryDelayMs = opts.retryDelayMs ?? 800;
  }

  async generateJson<T>(request: GeminiGenerateJsonRequest): Promise<T> {
    if (!this.opts.apiKey) throw new Error('GOOGLE_GEMINI_API_KEY is not configured');
    const url = `${this.baseUrl}/models/${request.model}:generateContent`;
    const body = JSON.stringify({
      contents: [{ parts: [{ text: request.prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: toGeminiSchema(request.schema),
      },
    });

    let last: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      let res: Awaited<ReturnType<typeof fetch>>;
      try {
        res = await this.fetchFn(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.opts.apiKey },
          body,
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (err) {
        // Network/timeout — retryable.
        last = err;
        if (attempt >= this.maxRetries) break;
        await this.backoff(attempt);
        continue;
      }

      if (res.ok) {
        const json = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('Gemini response missing candidate text');
        return JSON.parse(text) as T;
      }

      const message = await res.text().catch(() => '');
      last = new Error(`Gemini request failed: ${res.status} ${message}`.trim());
      // 429 (rate limit) and 5xx (incl. 503 "model overloaded") are transient.
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= this.maxRetries) throw last;
      await this.backoff(attempt);
    }
    throw last instanceof Error ? last : new Error('Gemini request failed');
  }

  private async backoff(attempt: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs * 2 ** attempt));
  }
}
