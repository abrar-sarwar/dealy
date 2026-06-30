import { dealTrust, type DealTrustLike } from './grocery.types';

function deal(over: Partial<DealTrustLike>): DealTrustLike {
  return {
    sourceTrust: 'editorial',
    verificationStatus: 'pending',
    lastVerifiedAt: null,
    confidenceScore: null,
    ...over,
  };
}

describe('dealTrust (BH6 taxonomy)', () => {
  it('authoritative + verified + recent → verified / high', () => {
    const t = dealTrust(
      deal({
        sourceTrust: 'authoritative',
        verificationStatus: 'verified',
        lastVerifiedAt: new Date(),
      }),
    );
    expect(t.label).toBe('verified');
    expect(t.band).toBe('high');
  });

  it('authoritative + verified but stale → still verified / high', () => {
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const t = dealTrust(
      deal({ sourceTrust: 'authoritative', verificationStatus: 'verified', lastVerifiedAt: old }),
    );
    expect(t.label).toBe('verified');
  });

  it('authoritative unverified → source_backed', () => {
    const t = dealTrust(deal({ sourceTrust: 'authoritative', verificationStatus: 'pending' }));
    expect(t.label).toBe('source_backed');
  });

  it('editorial verified → source_backed', () => {
    const t = dealTrust(deal({ sourceTrust: 'editorial', verificationStatus: 'verified' }));
    expect(t.label).toBe('source_backed');
  });

  it('editorial pending extracted deal → needs_verification', () => {
    const t = dealTrust(deal({ sourceTrust: 'editorial', verificationStatus: 'pending' }));
    expect(t.label).toBe('needs_verification');
    expect(t.band).toBe('low');
  });

  it('editorial invalid or low score → low_confidence', () => {
    expect(dealTrust(deal({ verificationStatus: 'invalid' })).label).toBe('low_confidence');
    expect(dealTrust(deal({ verificationStatus: 'pending', confidenceScore: 10 })).label).toBe(
      'low_confidence',
    );
  });

  it('fixture → mock', () => {
    expect(dealTrust(deal({ sourceTrust: 'fixture' })).label).toBe('mock');
  });
});
