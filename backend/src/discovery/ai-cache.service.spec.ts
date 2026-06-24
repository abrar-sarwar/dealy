import { AiCacheService } from './ai-cache.service';

type CacheRow = {
  cacheKey: string;
  hitCount: number;
  lastHitAt: Date | null;
  expiresAt?: Date;
  output?: unknown;
  [key: string]: unknown;
};

function fakePrisma() {
  const rows = new Map<string, CacheRow>();
  return {
    rows,
    aiCache: {
      findUnique: jest.fn(
        async ({ where }: { where: { cacheKey: string } }) => rows.get(where.cacheKey) ?? null,
      ),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { cacheKey: string };
          data: { hitCount: { increment: number }; lastHitAt: Date };
        }) => {
          const r = rows.get(where.cacheKey)!;
          r.hitCount += data.hitCount.increment;
          r.lastHitAt = data.lastHitAt;
          return r;
        },
      ),
      upsert: jest.fn(
        async ({
          where,
          create,
        }: {
          where: { cacheKey: string };
          create: Omit<CacheRow, 'hitCount' | 'lastHitAt'>;
        }) => {
          rows.set(where.cacheKey, { hitCount: 0, lastHitAt: null, ...create } as CacheRow);
          return rows.get(where.cacheKey);
        },
      ),
    },
  };
}

describe('AiCacheService', () => {
  const params = {
    task: 'deal_extraction',
    model: 'gemini-2.5-flash',
    schemaVersion: 'v1',
    prompt: 'extract X',
  };

  it('calls the generator on a miss and stores the result', async () => {
    const prisma = fakePrisma();
    const svc = new AiCacheService(prisma as never, 24);
    const generate = jest.fn().mockResolvedValue({ deals: [1] });
    expect(await svc.getOrGenerate(params, generate)).toEqual({
      value: { deals: [1] },
      cacheHit: false,
    });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(prisma.aiCache.upsert).toHaveBeenCalledTimes(1);
  });

  it('returns the cached value without calling the generator on a fresh hit', async () => {
    const prisma = fakePrisma();
    const svc = new AiCacheService(prisma as never, 24);
    await svc.getOrGenerate(params, jest.fn().mockResolvedValue({ deals: [1] }));
    const generate = jest.fn();
    const out = await svc.getOrGenerate(params, generate);
    expect(out).toEqual({ value: { deals: [1] }, cacheHit: true });
    expect(generate).not.toHaveBeenCalled();
  });

  it('regenerates when the cached row is expired', async () => {
    const prisma = fakePrisma();
    const svc = new AiCacheService(prisma as never, 24);
    await svc.getOrGenerate(params, jest.fn().mockResolvedValue({ v: 'old' }));
    for (const r of prisma.rows.values()) r.expiresAt = new Date(Date.now() - 1000);
    const generate = jest.fn().mockResolvedValue({ v: 'new' });
    const out = await svc.getOrGenerate(params, generate);
    expect(out).toEqual({ value: { v: 'new' }, cacheHit: false });
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
