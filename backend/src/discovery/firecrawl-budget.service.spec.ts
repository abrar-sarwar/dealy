import { FirecrawlBudgetService } from './firecrawl-budget.service';

const limits = { maxPagesPerDay: 100, maxPagesPerSourcePerDay: 10, maxRecrawlsPerDay: 2 };

function fakePrisma(o: { totalPages: number; sourcePages: number; recrawls: number }) {
  return {
    crawlRun: {
      aggregate: jest.fn(async ({ where }: { where?: { source?: unknown } }) =>
        where?.source
          ? { _sum: { firecrawlPages: o.sourcePages } }
          : { _sum: { firecrawlPages: o.totalPages } },
      ),
      count: jest.fn(async () => o.recrawls),
    },
  };
}

describe('FirecrawlBudgetService', () => {
  it('allows when usage is under caps', async () => {
    const svc = new FirecrawlBudgetService(
      fakePrisma({ totalPages: 10, sourcePages: 2, recrawls: 0 }) as never,
      limits,
    );
    expect((await svc.check('s1', { sourceMayBeUnchanged: false })).allowed).toBe(true);
  });

  it('blocks once the daily page cap is hit', async () => {
    const svc = new FirecrawlBudgetService(
      fakePrisma({ totalPages: 100, sourcePages: 2, recrawls: 0 }) as never,
      limits,
    );
    expect(await svc.check('s1', { sourceMayBeUnchanged: false })).toEqual({
      allowed: false,
      reason: 'daily_page_cap',
      remainingPages: 0,
    });
  });

  it('blocks a maybe-unchanged source that hit the recrawl cap', async () => {
    const svc = new FirecrawlBudgetService(
      fakePrisma({ totalPages: 10, sourcePages: 2, recrawls: 2 }) as never,
      limits,
    );
    expect(await svc.check('s1', { sourceMayBeUnchanged: true })).toEqual({
      allowed: false,
      reason: 'recrawl_cap',
      remainingPages: 0,
    });
  });
});
