import type { GeminiGenerateJsonRequest } from './gemini.types';

export interface GeminiClientOptions {
  apiKey?: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

export class GeminiClient {
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly opts: GeminiClientOptions) {
    this.fetchFn = opts.fetchFn ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  async generateJson<T>(request: GeminiGenerateJsonRequest): Promise<T> {
    if (!this.opts.apiKey) throw new Error('GOOGLE_GEMINI_API_KEY is not configured');
    const res = await this.fetchFn(
      'https://generativelanguage.googleapis.com/v1beta/interactions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.opts.apiKey,
        },
        body: JSON.stringify({
          model: request.model,
          input: request.prompt,
          response_format: {
            type: 'text',
            mime_type: 'application/json',
            schema: request.schema,
          },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      },
    );
    if (!res.ok) throw new Error(`Gemini request failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { output_text?: string };
    if (!json.output_text) throw new Error('Gemini response missing output_text');
    return JSON.parse(json.output_text) as T;
  }
}
