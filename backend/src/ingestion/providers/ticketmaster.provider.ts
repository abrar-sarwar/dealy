import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import type {
  DealProvider,
  NormalizedDeal,
  VerifiableDeal,
  VerificationResult,
} from '../normalized-deal';

/**
 * Ticketmaster Discovery API (https://developer.ticketmaster.com) — a documented
 * PUBLIC API. This is the first REAL provider. It maps events to entertainment
 * "deals". Gated behind `TICKETMASTER_API_KEY`: without it, `isAvailable()` is
 * false and ingestion records the run as awaiting credentials.
 *
 * Status: implemented; not yet exercised against the live API (no key). Respect
 * Ticketmaster attribution + rate limits when enabling.
 */
interface TmPriceRange {
  min?: number;
  max?: number;
  currency?: string;
}
interface TmVenue {
  name?: string;
  location?: { latitude?: string; longitude?: string };
  city?: { name?: string };
}
interface TmEvent {
  id: string;
  name: string;
  url?: string;
  info?: string;
  dates?: { start?: { dateTime?: string; localDate?: string } };
  priceRanges?: TmPriceRange[];
  _embedded?: { venues?: TmVenue[] };
}
interface TmResponse {
  _embedded?: { events?: TmEvent[] };
}

@Injectable()
export class TicketmasterProvider implements DealProvider {
  readonly name = 'ticketmaster';
  private readonly apiKey?: string;

  constructor(config: ConfigService<Env, true>) {
    this.apiKey = config.get('TICKETMASTER_API_KEY', { infer: true });
  }

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  async fetch(): Promise<NormalizedDeal[]> {
    if (!this.apiKey) return [];
    const url = new URL('https://app.ticketmaster.com/discovery/v2/events.json');
    url.searchParams.set('apikey', this.apiKey);
    url.searchParams.set('city', 'Atlanta');
    url.searchParams.set('size', '40');
    url.searchParams.set('sort', 'date,asc');

    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) {
      throw new Error(`Ticketmaster API ${res.status}`);
    }
    const data = (await res.json()) as TmResponse;
    const events = data._embedded?.events ?? [];
    const now = Date.now();

    return events
      .map((e) => this.toNormalized(e))
      .filter((d): d is NormalizedDeal => d !== null && d.expiresAt.getTime() > now);
  }

  /**
   * Re-check one event against the Discovery API. Distinguishes a source-confirmed
   * removal (404 → `invalid`) and a past event (`expired`) from a transient
   * provider failure (network/5xx/timeout → `unreachable`), so the daily job can
   * apply a grace policy without dropping deals on provider downtime.
   */
  async verify(deal: VerifiableDeal): Promise<VerificationResult> {
    if (!this.apiKey) return { status: 'unreachable', reason: 'missing credentials' };
    const eventId = deal.externalId.replace(/^tm-/, '');
    const url = new URL(`https://app.ticketmaster.com/discovery/v2/events/${eventId}.json`);
    url.searchParams.set('apikey', this.apiKey);

    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    } catch (err) {
      return { status: 'unreachable', reason: (err as Error).message };
    }
    if (res.status === 404 || res.status === 410) {
      return { status: 'invalid', reason: `event gone (${res.status})` };
    }
    if (!res.ok) return { status: 'unreachable', reason: `Ticketmaster API ${res.status}` };

    const event = (await res.json()) as TmEvent;
    const startStr = event.dates?.start?.dateTime ?? event.dates?.start?.localDate;
    const start = startStr ? new Date(startStr) : null;
    if (!start || Number.isNaN(start.getTime())) {
      return { status: 'invalid', reason: 'event missing start date' };
    }
    if (start.getTime() <= Date.now()) return { status: 'expired' };
    return { status: 'confirmed', expiresAt: start };
  }

  private toNormalized(e: TmEvent): NormalizedDeal | null {
    const startStr = e.dates?.start?.dateTime ?? e.dates?.start?.localDate;
    if (!startStr) return null;
    const start = new Date(startStr);
    if (Number.isNaN(start.getTime())) return null;

    const venue = e._embedded?.venues?.[0];
    const lat = venue?.location?.latitude ? Number(venue.location.latitude) : null;
    const lng = venue?.location?.longitude ? Number(venue.location.longitude) : null;
    const price = e.priceRanges?.[0];
    const toMinor = (v?: number) => (v === undefined ? null : BigInt(Math.round(v * 100)));

    return {
      externalId: `tm-${e.id}`,
      title: e.name,
      merchant: venue?.name ?? 'Ticketmaster',
      categorySlug: 'entertainment',
      shortDescription: e.info?.slice(0, 140) ?? e.name,
      detailedDescription: e.info ?? e.name,
      terms: 'Tickets via Ticketmaster. Subject to availability.',
      currentPriceMinor: toMinor(price?.min),
      originalPriceMinor: toMinor(price?.max),
      currency: price?.currency ?? 'USD',
      isOnline: lat === null || lng === null,
      isStudentOnly: false,
      couponCode: null,
      destinationUrl: e.url ?? null,
      latitude: lat,
      longitude: lng,
      locationTags: venue?.city?.name ? [venue.city.name.toLowerCase()] : ['atlanta'],
      dealScore: 65,
      visualSeed: Math.abs(this.hash(e.id)) % 1000,
      startAt: start,
      // Event "deals" expire when the event starts.
      expiresAt: start,
      sourceUrl: e.url ?? `https://www.ticketmaster.com/event/${e.id}`,
      providerAttribution: 'Powered by Ticketmaster',
    };
  }

  private hash(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return h;
  }
}
