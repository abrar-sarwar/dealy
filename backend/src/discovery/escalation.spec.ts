import { shouldEscalateToPro, shouldConsiderSource } from './escalation';

describe('shouldEscalateToPro', () => {
  const t = { maxConfidence: 60, minReliability: 80 };
  it('escalates only when confidence is low AND reliability is high', () => {
    expect(shouldEscalateToPro({ confidence: 55, reliabilityScore: 85, ...t })).toBe(true);
  });
  it('does not escalate high-confidence extractions', () => {
    expect(shouldEscalateToPro({ confidence: 75, reliabilityScore: 85, ...t })).toBe(false);
  });
  it('does not escalate low-reliability sources', () => {
    expect(shouldEscalateToPro({ confidence: 55, reliabilityScore: 70, ...t })).toBe(false);
  });
});

describe('shouldConsiderSource', () => {
  const now = new Date('2026-06-24T12:00:00Z');
  it('skips disabled sources', () => {
    expect(
      shouldConsiderSource({ enabled: false, lastCrawledAt: null, crawlIntervalHours: 24, now }),
    ).toBe(false);
  });
  it('considers an enabled, never-crawled source', () => {
    expect(
      shouldConsiderSource({ enabled: true, lastCrawledAt: null, crawlIntervalHours: 24, now }),
    ).toBe(true);
  });
  it('skips a source crawled within its interval', () => {
    expect(
      shouldConsiderSource({
        enabled: true,
        lastCrawledAt: new Date('2026-06-24T06:00:00Z'),
        crawlIntervalHours: 24,
        now,
      }),
    ).toBe(false);
  });
  it('considers a source past its interval', () => {
    expect(
      shouldConsiderSource({
        enabled: true,
        lastCrawledAt: new Date('2026-06-22T06:00:00Z'),
        crawlIntervalHours: 24,
        now,
      }),
    ).toBe(true);
  });
});
