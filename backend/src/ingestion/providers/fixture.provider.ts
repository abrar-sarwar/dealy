import { Injectable } from '@nestjs/common';
import type {
  DealProvider,
  NormalizedDeal,
  VerifiableDeal,
  VerificationResult,
} from '../normalized-deal';

/**
 * Deterministic local provider for development + tests. Always available; emits
 * a fixed set of deals around Atlanta so the ingestion pipeline is exercisable
 * without any external credentials.
 */
@Injectable()
export class FixtureProvider implements DealProvider {
  readonly name = 'fixture';

  isAvailable(): boolean {
    return true;
  }

  /** Deterministic re-verification: a fixture deal is confirmed while it exists. */
  async verify(deal: VerifiableDeal): Promise<VerificationResult> {
    const known = (await this.fetch()).some((d) => d.externalId === deal.externalId);
    if (!known) return { status: 'invalid', reason: 'no longer in fixture set' };
    if (deal.expiresAt.getTime() <= Date.now()) return { status: 'expired' };
    return { status: 'confirmed' };
  }

  async fetch(): Promise<NormalizedDeal[]> {
    const inDays = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);
    const specs = [
      {
        id: '1',
        title: 'Half-Price Tacos',
        merchant: 'Taqueria Centro',
        cat: 'food',
        cur: 450n,
        orig: 900n,
        lat: 33.755,
        lng: -84.39,
      },
      {
        id: '2',
        title: 'Student Laptop Bundle',
        merchant: 'TechHub',
        cat: 'tech',
        cur: 49900n,
        orig: 69900n,
        lat: 33.776,
        lng: -84.396,
      },
      {
        id: '3',
        title: 'Gym Day Pass Deal',
        merchant: 'FlexFit',
        cat: 'entertainment',
        cur: 500n,
        orig: 1500n,
        lat: 33.77,
        lng: -84.385,
      },
      {
        id: '4',
        title: 'Coffee Punch Card',
        merchant: 'Bean There',
        cat: 'food',
        cur: 0n,
        orig: 0n,
        lat: 33.758,
        lng: -84.388,
      },
      {
        id: '5',
        title: 'Notebook 3-Pack',
        merchant: 'Campus Store',
        cat: 'studentSupplies',
        cur: 800n,
        orig: 1500n,
        lat: 33.753,
        lng: -84.384,
      },
    ];
    return specs.map((s, i) => ({
      externalId: `fixture-${s.id}`,
      title: s.title,
      merchant: s.merchant,
      categorySlug: s.cat,
      shortDescription: `${s.title} from ${s.merchant}.`,
      detailedDescription: `Fixture-sourced ${s.title.toLowerCase()} near downtown Atlanta.`,
      terms: 'Fixture data for development.',
      currentPriceMinor: s.cur === 0n ? null : s.cur,
      originalPriceMinor: s.orig === 0n ? null : s.orig,
      currency: 'USD',
      isOnline: false,
      isStudentOnly: i % 2 === 0,
      couponCode: null,
      destinationUrl: null,
      latitude: s.lat,
      longitude: s.lng,
      locationTags: ['atlanta'],
      dealScore: 60 + i * 5,
      visualSeed: 200 + i,
      startAt: null,
      expiresAt: inDays(7 + i),
      sourceUrl: `fixture://deal/${s.id}`,
      providerAttribution: 'Dealy fixture data',
    }));
  }
}
