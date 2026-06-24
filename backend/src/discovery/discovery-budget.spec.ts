import { evaluateFirecrawlBudget } from './discovery-budget';

const limits = { maxPagesPerDay: 100, maxPagesPerSourcePerDay: 10, maxRecrawlsPerDay: 2 };
const fresh = { pagesToday: 0, pagesForSourceToday: 0, recrawlsForSourceToday: 0 };

describe('evaluateFirecrawlBudget', () => {
  it('allows when under all caps', () => {
    const d = evaluateFirecrawlBudget(fresh, limits, { sourceMayBeUnchanged: false });
    expect(d.allowed).toBe(true);
    expect(d.remainingPages).toBe(10);
  });

  it('blocks on daily page cap', () => {
    expect(evaluateFirecrawlBudget({ ...fresh, pagesToday: 100 }, limits, { sourceMayBeUnchanged: false }))
      .toEqual({ allowed: false, reason: 'daily_page_cap', remainingPages: 0 });
  });

  it('blocks on per-source page cap', () => {
    expect(evaluateFirecrawlBudget({ ...fresh, pagesForSourceToday: 10 }, limits, { sourceMayBeUnchanged: false }))
      .toEqual({ allowed: false, reason: 'source_page_cap', remainingPages: 0 });
  });

  it('blocks recrawls once a maybe-unchanged source hit the recrawl cap', () => {
    expect(evaluateFirecrawlBudget({ ...fresh, recrawlsForSourceToday: 2 }, limits, { sourceMayBeUnchanged: true }))
      .toEqual({ allowed: false, reason: 'recrawl_cap', remainingPages: 0 });
  });

  it('ignores the recrawl cap for sources we have no prior hash for', () => {
    expect(evaluateFirecrawlBudget({ ...fresh, recrawlsForSourceToday: 2 }, limits, { sourceMayBeUnchanged: false }).allowed).toBe(true);
  });
});
