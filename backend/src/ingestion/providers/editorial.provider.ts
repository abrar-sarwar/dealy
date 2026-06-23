import { Injectable } from '@nestjs/common';
import type {
  DealProvider,
  NormalizedDeal,
  VerifiableDeal,
  VerificationResult,
} from '../normalized-deal';
import { EDITORIAL_DEALS, type EditorialDeal } from './editorial-deals';

/**
 * Curated editorial provider for the Atlanta pilot's no-API categories
 * (Food, Groceries). Food/grocery deals have no public deal API, so inventory is
 * hand-curated (docs/data-sources.md) — never scraped.
 *
 * TRUST: `editorial` — NON-authoritative. Its deals ingest as `pending`, are
 * NEVER assigned a verified status, never show a Verified badge, never count
 * toward coverage, and never appear in production feeds. It exists for local
 * development/demos and tests, and is only registered when fixtures are enabled
 * (off in production). `verify()` checks the checked-in list only to model
 * removal/expiry in dev — it is NOT authoritative source confirmation. The `.test`
 * URLs are intentional fixture placeholders. Replace with a real authoritative
 * grocery/affiliate provider to put these categories into the live pilot.
 */
@Injectable()
export class EditorialProvider implements DealProvider {
  readonly name = 'editorial';
  readonly trust = 'editorial' as const;

  isAvailable(): boolean {
    return true;
  }

  async fetch(): Promise<NormalizedDeal[]> {
    return EDITORIAL_DEALS.filter((d) => !d.removed).map((d) => this.toNormalized(d));
  }

  async verify(deal: VerifiableDeal): Promise<VerificationResult> {
    const id = deal.externalId.replace(/^editorial-/, '');
    const record = EDITORIAL_DEALS.find((d) => d.id === id);
    if (!record || record.removed) {
      return { status: 'invalid', reason: 'source no longer lists this offer' };
    }
    if (deal.expiresAt.getTime() <= Date.now()) return { status: 'expired' };
    return { status: 'confirmed' };
  }

  private toNormalized(d: EditorialDeal): NormalizedDeal {
    const expiresAt = new Date(Date.now() + d.expiresInDays * 24 * 60 * 60 * 1000);
    return {
      externalId: `editorial-${d.id}`,
      title: d.title,
      merchant: d.merchant,
      categorySlug: d.category,
      shortDescription: `${d.title} at ${d.merchant}.`,
      detailedDescription: `${d.title} — curated Atlanta ${d.category} offer at ${d.merchant}.`,
      terms: 'Verify offer details at the merchant before redeeming.',
      currentPriceMinor: d.currentPriceMinor === null ? null : BigInt(d.currentPriceMinor),
      originalPriceMinor: d.originalPriceMinor === null ? null : BigInt(d.originalPriceMinor),
      currency: 'USD',
      isOnline: false,
      isStudentOnly: false,
      couponCode: null,
      destinationUrl: d.sourceUrl,
      redemptionBrand: null,
      latitude: d.lat,
      longitude: d.lng,
      locationTags: ['atlanta'],
      dealScore: 70,
      visualSeed: Math.abs(this.hash(d.id)) % 1000,
      startAt: null,
      expiresAt,
      sourceUrl: d.sourceUrl,
      providerAttribution: 'Curated by Dealy editorial',
    };
  }

  private hash(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return h;
  }
}
