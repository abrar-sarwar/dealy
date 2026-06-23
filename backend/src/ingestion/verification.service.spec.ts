import { DealStatus, VerificationStatus } from '@prisma/client';
import {
  resolveVerification,
  VerificationService,
  VERIFICATION_GRACE_MS,
} from './verification.service';

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

describe('resolveVerification — provider-refreshed expiration', () => {
  it('persists a valid future refreshed expiry on confirmation', () => {
    const future = new Date(now.getTime() + 7 * 86_400_000);
    const d = resolveVerification(verifiedNow, { status: 'confirmed', expiresAt: future }, now);
    expect(d.expiresAt).toEqual(future);
  });

  it('persists a shortened (but still future) refreshed expiry', () => {
    const sooner = new Date(now.getTime() + 60_000);
    const d = resolveVerification(verifiedNow, { status: 'confirmed', expiresAt: sooner }, now);
    expect(d.expiresAt).toEqual(sooner);
  });

  it('ignores a missing refreshed expiry (no change)', () => {
    const d = resolveVerification(verifiedNow, { status: 'confirmed' }, now);
    expect(d.expiresAt).toBeUndefined();
  });

  it('ignores a past or invalid refreshed expiry', () => {
    const past = new Date(now.getTime() - 1000);
    expect(
      resolveVerification(verifiedNow, { status: 'confirmed', expiresAt: past }, now).expiresAt,
    ).toBeUndefined();
    const invalid = new Date('not-a-date');
    expect(
      resolveVerification(verifiedNow, { status: 'confirmed', expiresAt: invalid }, now).expiresAt,
    ).toBeUndefined();
  });

  it('never extends expiry on a non-confirmed outcome', () => {
    const future = new Date(now.getTime() + 7 * 86_400_000);
    // unreachable carries no expiry change even if the provider returned one.
    expect(
      resolveVerification(verifiedNow, { status: 'unreachable', expiresAt: future }, now).expiresAt,
    ).toBeUndefined();
  });
});

describe('VerificationService.verifyProvider — run finalization on failure', () => {
  it('marks the run failed (not left running) when the deal query throws', async () => {
    const updateCalls: Array<Record<string, unknown>> = [];
    const fakePrisma = {
      verificationRun: {
        create: async () => ({ id: 'run-1' }),
        update: async (args: { data: Record<string, unknown> }) => {
          updateCalls.push(args.data);
          return {};
        },
      },
      deal: {
        findMany: async () => {
          throw new Error('db unavailable');
        },
      },
    };
    const fakeRegistry = { get: () => undefined };
    const fakeSearch = { removeDeal: async () => {}, upsertDeals: async () => {} };

    const service = new VerificationService(
      fakePrisma as never,
      fakeRegistry as never,
      fakeSearch as never,
    );

    await expect(service.verifyProvider('ticketmaster')).rejects.toThrow(/db unavailable/);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].status).toBe('failed');
    expect(updateCalls[0].error).toMatch(/db unavailable/);
    expect(updateCalls[0].finishedAt).toBeInstanceOf(Date);
  });
});
