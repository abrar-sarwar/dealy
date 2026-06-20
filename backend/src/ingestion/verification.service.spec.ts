import { DealStatus, VerificationStatus } from '@prisma/client';
import { resolveVerification, VERIFICATION_GRACE_MS } from './verification.service';

const now = new Date('2026-06-20T12:00:00Z');
const verifiedNow = { verificationStatus: VerificationStatus.verified, lastVerifiedAt: now };

describe('resolveVerification (daily grace policy)', () => {
  it('keeps a source-confirmed deal verified and refreshes lastVerifiedAt', () => {
    const d = resolveVerification(verifiedNow, { status: 'confirmed' }, now);
    expect(d.verificationStatus).toBe(VerificationStatus.verified);
    expect(d.dealStatus).toBe(DealStatus.published);
    expect(d.lastVerifiedAt).toBe(now);
    expect(d.shown).toBe(true);
  });

  it('removes an invalid deal from active feeds immediately', () => {
    const d = resolveVerification(verifiedNow, { status: 'invalid' }, now);
    expect(d.verificationStatus).toBe(VerificationStatus.invalid);
    expect(d.dealStatus).toBe(DealStatus.archived);
    expect(d.shown).toBe(false);
  });

  it('expires a source-expired deal immediately', () => {
    const d = resolveVerification(verifiedNow, { status: 'expired' }, now);
    expect(d.verificationStatus).toBe(VerificationStatus.expired);
    expect(d.dealStatus).toBe(DealStatus.expired);
    expect(d.shown).toBe(false);
  });

  it('keeps showing a transiently-unreachable deal within the grace window', () => {
    const lastVerifiedAt = new Date(now.getTime() - (VERIFICATION_GRACE_MS - 60_000));
    const d = resolveVerification(
      { verificationStatus: VerificationStatus.verified, lastVerifiedAt },
      { status: 'unreachable' },
      now,
    );
    expect(d.verificationStatus).toBe(VerificationStatus.verified);
    expect(d.shown).toBe(true);
    // Does not change deal.status while in grace.
    expect(d.dealStatus).toBeUndefined();
  });

  it('drops an unreachable deal once the grace window is exhausted', () => {
    const lastVerifiedAt = new Date(now.getTime() - (VERIFICATION_GRACE_MS + 60_000));
    const d = resolveVerification(
      { verificationStatus: VerificationStatus.verified, lastVerifiedAt },
      { status: 'unreachable' },
      now,
    );
    expect(d.verificationStatus).toBe(VerificationStatus.unreachable);
    expect(d.shown).toBe(false);
  });

  it('treats a deal that has never been confirmed as out of grace', () => {
    const d = resolveVerification(
      { verificationStatus: VerificationStatus.pending, lastVerifiedAt: null },
      { status: 'unreachable' },
      now,
    );
    expect(d.verificationStatus).toBe(VerificationStatus.unreachable);
    expect(d.shown).toBe(false);
  });

  it('never lets a transient failure override a source-confirmed removal', () => {
    // Even a freshly verified deal is dropped the moment the source says invalid.
    const fresh = { verificationStatus: VerificationStatus.verified, lastVerifiedAt: now };
    expect(resolveVerification(fresh, { status: 'invalid' }, now).shown).toBe(false);
    expect(resolveVerification(fresh, { status: 'expired' }, now).shown).toBe(false);
  });
});
