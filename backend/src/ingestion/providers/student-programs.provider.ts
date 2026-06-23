import { Injectable } from '@nestjs/common';
import type {
  DealProvider,
  NormalizedDeal,
  VerifiableDeal,
  VerificationResult,
} from '../normalized-deal';
import { STUDENT_PROGRAMS, type StudentProgram } from './student-programs';

/** ~1 year out; curated programs are evergreen and re-checked by link liveness. */
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Curated provider for major national student-discount programs (Apple Education,
 * Spotify Student, GitHub Student Pack, …). TRUST: `editorial` → these derive to
 * the `curated` feed tier and NEVER wear the Verified badge. Unlike the dev-only
 * EditorialProvider, this is registered in production (real programs, official
 * URLs). `verify()` checks the curated list; link liveness is handled by the
 * verification sweep's `checkCuratedLinks`.
 */
@Injectable()
export class StudentProgramsProvider implements DealProvider {
  readonly name = 'student-programs';
  readonly trust = 'editorial' as const;

  isAvailable(): boolean {
    return true;
  }

  async fetch(): Promise<NormalizedDeal[]> {
    return STUDENT_PROGRAMS.map((p) => this.toNormalized(p));
  }

  async verify(deal: VerifiableDeal): Promise<VerificationResult> {
    const slug = deal.externalId.replace(/^student-/, '');
    const found = STUDENT_PROGRAMS.some((p) => p.slug === slug);
    return found
      ? { status: 'confirmed' }
      : { status: 'invalid', reason: 'program no longer curated' };
  }

  private toNormalized(p: StudentProgram): NormalizedDeal {
    return {
      externalId: `student-${p.slug}`,
      title: p.title,
      merchant: p.merchant,
      categorySlug: p.category,
      shortDescription: p.shortDescription,
      detailedDescription: p.detailedDescription,
      terms: p.terms,
      currentPriceMinor: null,
      originalPriceMinor: null,
      currency: 'USD',
      isOnline: true,
      isStudentOnly: true,
      couponCode: null,
      destinationUrl: p.url,
      redemptionBrand: p.redemptionBrand,
      latitude: null,
      longitude: null,
      locationTags: ['online', 'nationwide'],
      dealScore: 80,
      visualSeed: Math.abs(this.hash(p.slug)) % 1000,
      startAt: null,
      expiresAt: new Date(Date.now() + ONE_YEAR_MS),
      sourceUrl: p.url,
      providerAttribution: 'Curated by Dealy',
    };
  }

  private hash(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return h;
  }
}
