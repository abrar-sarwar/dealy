import type { DealExtractor, ExtractContext, ExtractionResult, RawCandidate } from './deal-extractor';

function priceToMinor(price?: string | number | null): bigint | null {
  if (price == null) return null;
  const n = typeof price === 'number' ? price : Number(String(price).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? BigInt(Math.round(n * 100)) : null;
}

/** Deterministic extractor: JSON-LD Offers first, then a happy-hour/price regex. */
export class StructuredExtractor implements DealExtractor {
  async extract(html: string, ctx: ExtractContext): Promise<ExtractionResult> {
    const candidates = [...this.fromJsonLd(html, ctx), ...this.fromRegex(html, ctx)];
    return { candidates };
  }

  private fromJsonLd(html: string, ctx: ExtractContext): RawCandidate[] {
    const out: RawCandidate[] = [];
    const blocks = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
    for (const [, json] of blocks) {
      let data: any;
      try { data = JSON.parse(json.trim()); } catch { continue; }
      for (const node of Array.isArray(data) ? data : [data]) {
        const merchant = node.name ?? ctx.merchantHint ?? '';
        const address = typeof node.address === 'string'
          ? node.address
          : [node.address?.streetAddress, node.address?.addressLocality, node.address?.addressRegion]
              .filter(Boolean).join(', ');
        const offers = node.makesOffer ?? node.offers;
        for (const offer of (Array.isArray(offers) ? offers : offers ? [offers] : [])) {
          if (!offer?.name) continue;
          out.push({
            title: String(offer.name),
            merchant,
            categorySlug: ctx.defaultCategorySlug ?? 'food',
            address,
            startAt: offer.validFrom ? new Date(offer.validFrom) : null,
            expiresAt: offer.validThrough ? new Date(offer.validThrough) : null,
            sourceUrl: ctx.url,
            currentPriceMinor: priceToMinor(offer.price),
            couponCode: null,
            isStudentOnly: false,
            extractionPath: 'structured',
          });
        }
      }
    }
    return out;
  }

  private fromRegex(html: string, ctx: ExtractContext): RawCandidate[] {
    // Only fire when the page literally advertises a happy hour AND a price, to
    // keep precision high. Free-form pages with neither fall through to the LLM.
    const text = html.replace(/<[^>]+>/g, ' ');
    if (!/happy hour/i.test(text)) return [];
    const price = text.match(/\$\s?(\d+(?:\.\d{2})?)/);
    if (!price) return [];
    return [{
      title: 'Happy Hour',
      merchant: ctx.merchantHint ?? '',
      categorySlug: ctx.defaultCategorySlug ?? 'food',
      address: '',
      startAt: null,
      expiresAt: null,
      sourceUrl: ctx.url,
      currentPriceMinor: priceToMinor(price[1]),
      couponCode: null,
      isStudentOnly: false,
      extractionPath: 'structured',
    }];
  }
}
