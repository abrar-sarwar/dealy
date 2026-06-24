import { GeminiClient, toGeminiSchema } from './gemini.client';

// Captured verbatim from a live gemini-2.5-flash :generateContent structured-JSON
// response — the shape the old client failed to parse (it expected `output_text`).
const LIVE_RESPONSE = {
  candidates: [
    {
      content: {
        parts: [{ text: '{"crawl": true, "reason": "fresh weekly ad", "priority": 90}' }],
        role: 'model',
      },
      finishReason: 'STOP',
      index: 0,
    },
  ],
  usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 20, totalTokenCount: 32 },
  modelVersion: 'gemini-2.5-flash',
  responseId: 'abc123',
};

function fakeFetch(body: unknown, ok = true, status = 200) {
  return jest.fn(async () => ({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })) as unknown as typeof fetch;
}

describe('GeminiClient.generateJson', () => {
  it('parses candidates[0].content.parts[0].text from a live generateContent response', async () => {
    const fetchFn = fakeFetch(LIVE_RESPONSE);
    const client = new GeminiClient({ apiKey: 'k', fetchFn });
    const out = await client.generateJson<{ crawl: boolean; reason: string; priority: number }>({
      model: 'gemini-2.5-flash',
      prompt: 'plan',
      schema: { type: 'object', properties: { crawl: { type: 'boolean' } }, required: ['crawl'] },
    });
    expect(out).toEqual({ crawl: true, reason: 'fresh weekly ad', priority: 90 });
  });

  it('calls the :generateContent endpoint for the requested model with the api key', async () => {
    const fetchFn = fakeFetch(LIVE_RESPONSE);
    await new GeminiClient({ apiKey: 'secret', fetchFn }).generateJson({
      model: 'gemini-2.5-pro',
      prompt: 'p',
      schema: { type: 'object' },
    });
    const [url, init] = (fetchFn as jest.Mock).mock.calls[0];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent',
    );
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('secret');
    const sent = JSON.parse(init.body as string);
    expect(sent.contents[0].parts[0].text).toBe('p');
    expect(sent.generationConfig.responseMimeType).toBe('application/json');
  });

  it('sends a Gemini-dialect responseSchema (nullable unions converted to nullable:true)', async () => {
    const fetchFn = fakeFetch(LIVE_RESPONSE);
    await new GeminiClient({ apiKey: 'k', fetchFn }).generateJson({
      model: 'gemini-2.5-flash',
      prompt: 'p',
      schema: {
        type: 'object',
        properties: { discount: { type: ['string', 'null'] } },
        required: ['discount'],
      },
    });
    const sent = JSON.parse((fetchFn as jest.Mock).mock.calls[0][1].body as string);
    expect(sent.generationConfig.responseSchema.properties.discount).toEqual({
      type: 'string',
      nullable: true,
    });
  });

  it('throws with status + body on a non-ok response', async () => {
    const fetchFn = fakeFetch({ error: { message: 'bad' } }, false, 400);
    await expect(
      new GeminiClient({ apiKey: 'k', fetchFn }).generateJson({
        model: 'm',
        prompt: 'p',
        schema: {},
      }),
    ).rejects.toThrow('Gemini request failed: 400');
  });

  it('throws a clear error when no candidate text is present', async () => {
    const fetchFn = fakeFetch({ candidates: [] });
    await expect(
      new GeminiClient({ apiKey: 'k', fetchFn }).generateJson({
        model: 'm',
        prompt: 'p',
        schema: {},
      }),
    ).rejects.toThrow('Gemini response missing candidate text');
  });
});

describe('toGeminiSchema', () => {
  it('converts a nullable union to nullable:true and recurses properties + items', () => {
    expect(
      toGeminiSchema({
        type: 'object',
        properties: {
          deals: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                expiration: { type: ['string', 'null'] },
                status: { type: 'string', enum: ['a', 'b'] },
              },
              required: ['expiration', 'status'],
            },
          },
        },
        required: ['deals'],
      }),
    ).toEqual({
      type: 'object',
      properties: {
        deals: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              expiration: { type: 'string', nullable: true },
              status: { type: 'string', enum: ['a', 'b'] },
            },
            required: ['expiration', 'status'],
          },
        },
      },
      required: ['deals'],
    });
  });
});
