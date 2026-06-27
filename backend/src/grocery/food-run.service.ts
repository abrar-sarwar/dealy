import { Injectable } from '@nestjs/common';
import type { Deal } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { PlaceFeedService } from '../discovery/place-feed.service';
import type { FoodRunDto } from './grocery.dto';

const EARTH_RADIUS_MILES = 3958.7613;
const DEFAULT_RADIUS_MILES = 15;
const RECENT_VERIFY_DAYS = 7;

export type FoodRunIntent =
  | 'under_10'
  | 'high_protein'
  | 'quick_lunch'
  | 'late_night'
  | 'study_spot'
  | 'date_friends'
  | 'closest_cheap';

/** The stored Place fields the ranking reads (no live AI, no photo fetch). */
export interface FoodRunPlace {
  id: string;
  name: string;
  categorySlug: string;
  latitude: number;
  longitude: number;
  rating: number | null;
  priceBucket: string | null;
  affordabilityScore: number | null;
  cheapEatsScore: number | null;
  studentValueScore: number | null;
  hiddenGemScore: number | null;
  bestFor: string | null;
  vibeTags: string[];
  categoryTags: string[];
  whyRecommended: string | null;
  budgetTip: string | null;
  primaryPhotoUrl: string | null;
}

export interface FoodRunInput {
  latitude: number;
  longitude: number;
  region?: string | null;
  intent: FoodRunIntent;
  budgetMinor?: number | null;
}

interface ScoredPlace {
  place: FoodRunPlace;
  score: number;
}

function haversineMiles(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

function ratingTerm(rating: number | null): number {
  if (rating == null) return 0;
  return Math.max(0, Math.min(1, rating / 5));
}

function distanceTerm(miles: number): number {
  return Math.max(0, 1 - miles / DEFAULT_RADIUS_MILES);
}

function hasTag(tags: string[], needles: string[]): boolean {
  const lc = tags.map((t) => t.toLowerCase());
  return needles.some((n) => lc.some((t) => t.includes(n)));
}

function priceBucketCost(bucket: string | null): number {
  switch (bucket) {
    case '$':
      return 8;
    case '$$':
      return 15;
    case '$$$':
      return 30;
    case '$$$$':
      return 50;
    default:
      return 12;
  }
}

/**
 * Cheap Food Run: pick the single best place for an intent from stored Places.
 * Read-only, deterministic, NO live AI. `rankPlaces` is pure and unit-tested.
 */
@Injectable()
export class FoodRunService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly placeFeed: PlaceFeedService,
  ) {}

  /** Pure intent ranking over a places array. Highest score first. */
  rankPlaces(
    places: FoodRunPlace[],
    intent: FoodRunIntent,
    center: { latitude: number; longitude: number },
  ): ScoredPlace[] {
    return places
      .map((place) => ({ place, score: this.scorePlace(place, intent, center) }))
      .sort((a, b) => b.score - a.score || ratingTerm(b.place.rating) - ratingTerm(a.place.rating));
  }

  private scorePlace(
    p: FoodRunPlace,
    intent: FoodRunIntent,
    center: { latitude: number; longitude: number },
  ): number {
    const miles = haversineMiles(center, p);
    const dist = distanceTerm(miles);
    const rate = ratingTerm(p.rating);
    const afford = p.affordabilityScore ?? 0;
    const cheap = p.cheapEatsScore ?? 0;
    const student = p.studentValueScore ?? 0;
    const cheapBucket = p.priceBucket === '$' ? 1 : p.priceBucket === '$$' ? 0.5 : 0;
    const tags = [...p.vibeTags, ...p.categoryTags, p.bestFor ?? ''];

    switch (intent) {
      case 'under_10':
        return 0.45 * cheap + 0.25 * afford + 0.2 * cheapBucket + 0.1 * rate;
      case 'closest_cheap':
        return 0.5 * dist + 0.3 * afford + 0.2 * cheapBucket;
      case 'high_protein':
        return (
          0.4 * (hasTag(tags, ['protein', 'grill', 'bowl', 'meat', 'chicken']) ? 1 : 0) +
          0.3 * student +
          0.3 * rate
        );
      case 'quick_lunch':
        return (
          0.35 * cheap +
          0.3 * dist +
          0.25 * rate +
          0.1 * (hasTag(tags, ['fast', 'quick', 'lunch', 'counter']) ? 1 : 0)
        );
      case 'late_night':
        return (
          0.5 * (hasTag(tags, ['late', 'night', 'open_late', '24']) ? 1 : 0) +
          0.3 * rate +
          0.2 * dist
        );
      case 'study_spot':
        return (
          0.4 * (hasTag(tags, ['study', 'wifi', 'quiet', 'cafe', 'coffee']) ? 1 : 0) +
          0.25 * (p.categorySlug === 'cafe' || p.categorySlug === 'coffee' ? 1 : 0) +
          0.2 * rate +
          0.15 * dist
        );
      case 'date_friends':
        return (
          0.45 * (hasTag(tags, ['date', 'cozy', 'group', 'vibe', 'romantic', 'cocktail']) ? 1 : 0) +
          0.35 * rate +
          0.2 * student
        );
      default:
        return 0.5 * rate + 0.5 * dist;
    }
  }

  /** Resolve region, rank Places, attach a nearby food deal, and shape the DTO. */
  async bestPlace(input: FoodRunInput): Promise<FoodRunDto> {
    const center = { latitude: input.latitude, longitude: input.longitude };
    const regionSlug = input.region ?? (await this.placeFeed.resolveRegion(center)) ?? null;

    const places = await this.loadPlaces(regionSlug);
    if (places.length === 0) {
      return {
        place: null,
        estimated_cost: input.budgetMinor != null ? input.budgetMinor / 100 : 0,
        reason: 'No places found nearby yet — try requesting your zone.',
        matched_deal: null,
        confidence: 'low',
        source_status: 'estimated',
      };
    }

    const ranked = this.rankPlaces(places, input.intent, center);
    const top = ranked[0].place;
    const miles = haversineMiles(center, top);
    const inRegion = regionSlug != null;

    const deal = await this.nearbyFoodDeal(top);
    const sourceStatus =
      deal && deal.sourceTrust === 'authoritative' && deal.verificationStatus === 'verified'
        ? 'source_backed'
        : 'estimated';
    const confidence = inRegion && miles <= DEFAULT_RADIUS_MILES ? 'medium' : 'low';

    return {
      place: {
        id: top.id,
        name: top.name,
        category: top.categorySlug,
        price_bucket: top.priceBucket,
        rating: top.rating,
        latitude: top.latitude,
        longitude: top.longitude,
        why_recommended: top.whyRecommended,
        budget_tip: top.budgetTip,
        primary_photo_url: top.primaryPhotoUrl,
      },
      estimated_cost: priceBucketCost(top.priceBucket),
      reason: this.reason(input.intent, top, miles),
      matched_deal: deal ? this.mapDeal(deal) : null,
      confidence,
      source_status: sourceStatus,
    };
  }

  private async loadPlaces(regionSlug: string | null): Promise<FoodRunPlace[]> {
    const rows = await this.prisma.place.findMany({
      where: {
        enrichedAt: { not: null },
        ...(regionSlug ? { regionSlug } : {}),
      },
      take: 200,
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      categorySlug: r.categorySlug,
      latitude: r.latitude,
      longitude: r.longitude,
      rating: r.rating,
      priceBucket: r.priceBucket,
      affordabilityScore: r.affordabilityScore,
      cheapEatsScore: r.cheapEatsScore,
      studentValueScore: r.studentValueScore,
      hiddenGemScore: r.hiddenGemScore,
      bestFor: r.bestFor,
      vibeTags: r.vibeTags,
      categoryTags: r.categoryTags,
      whyRecommended: r.whyRecommended,
      budgetTip: r.budgetTip,
      primaryPhotoUrl: r.primaryPhotoUrl,
    }));
  }

  private async nearbyFoodDeal(place: FoodRunPlace): Promise<Deal | null> {
    const byPlace = await this.prisma.deal.findFirst({
      where: {
        placeId: place.id,
        status: 'published',
        expiresAt: { gt: new Date() },
      },
      orderBy: { dealScore: 'desc' },
    });
    if (byPlace) return byPlace;
    return this.prisma.deal.findFirst({
      where: {
        merchant: { equals: place.name, mode: 'insensitive' },
        status: 'published',
        category: { slug: 'food' },
        expiresAt: { gt: new Date() },
      },
      orderBy: { dealScore: 'desc' },
    });
  }

  private reason(intent: FoodRunIntent, _place: FoodRunPlace, miles: number): string {
    const dist = `~${miles.toFixed(1)} mi away`;
    switch (intent) {
      case 'under_10':
        return `Cheap eats under budget, ${dist}.`;
      case 'closest_cheap':
        return `Closest affordable option, ${dist}.`;
      case 'high_protein':
        return `Solid protein-forward pick, ${dist}.`;
      case 'quick_lunch':
        return `Fast, well-rated lunch, ${dist}.`;
      case 'late_night':
        return `Good late-night option, ${dist}.`;
      case 'study_spot':
        return `Comfortable spot to study, ${dist}.`;
      case 'date_friends':
        return `Nice spot for friends, ${dist}.`;
      default:
        return `Recommended nearby, ${dist}.`;
    }
  }

  private mapDeal(deal: Deal): FoodRunDto['matched_deal'] {
    const verified = deal.sourceTrust === 'authoritative' && deal.verificationStatus === 'verified';
    const recent =
      deal.lastVerifiedAt != null &&
      Date.now() - deal.lastVerifiedAt.getTime() <= RECENT_VERIFY_DAYS * 24 * 60 * 60 * 1000;
    return {
      merchant: deal.merchant,
      title: deal.title,
      discount:
        deal.originalPriceMinor != null &&
        deal.currentPriceMinor != null &&
        deal.originalPriceMinor > 0n
          ? `${Math.round((1 - Number(deal.currentPriceMinor) / Number(deal.originalPriceMinor)) * 100)}% off`
          : (deal.couponCode ?? null),
      price: deal.currentPriceMinor != null ? Number(deal.currentPriceMinor) / 100 : 0,
      valid_until: deal.expiresAt.toISOString(),
      source: deal.source,
      last_verified_at: deal.lastVerifiedAt ? deal.lastVerifiedAt.toISOString() : null,
      confidence: verified ? (recent ? 'high' : 'medium') : 'low',
      source_url: deal.sourceUrl,
    };
  }
}
