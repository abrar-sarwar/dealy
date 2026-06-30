import { sha256 } from './discovery-cost';

/** Fixed vocabulary for feedSectionCandidates. Gemini output is filtered to this
 *  set so a hallucinated section name never leaks into the data engine. */
export const FEED_SECTION_VOCAB = [
  'cheap_eats',
  'hidden_gem',
  'highly_rated',
  'student_friendly',
  'worth_checking_deals',
  'trending',
] as const;

export type FeedSectionCandidate = (typeof FEED_SECTION_VOCAB)[number];

const FEED_SECTION_SET = new Set<string>(FEED_SECTION_VOCAB);

/** Bump when the enrichment prompt/schema/fields change so cached values from an
 *  older shape are not reused. v2 adds `budget_tip` — forces every already-enriched
 *  place to regenerate WITH a budget tip on the next run. */
export const ENRICHMENT_SCHEMA_VERSION = 'v2';

/** Core inputs whose change should trigger a re-enrichment (staleness). Only
 *  these fields participate in the hash, so a re-run skips a place whose
 *  meaningful signals are unchanged even across recreates. */
export interface PlaceCoreInputs {
  name: string;
  categorySlug: string;
  priceLevel: number | null;
  rating: number | null;
  userRatingsTotal: number | null;
  address: string | null;
}

/** Stable hash of the core inputs. Identical inputs → identical hash (drives the
 *  cache skip); any change → different hash (drives staleness re-enrich). */
export function currentHash(p: PlaceCoreInputs): string {
  return sha256(
    [
      p.name,
      p.categorySlug,
      p.priceLevel ?? '',
      p.rating ?? '',
      p.userRatingsTotal ?? '',
      p.address ?? '',
    ].join('|'),
  );
}

/** Raw per-place enrichment as returned by Gemini (before normalisation). */
export interface RawPlaceEnrichment {
  price_bucket?: string | null;
  student_value_score?: number | null;
  affordability_score?: number | null;
  best_for?: string | null;
  vibe_tags?: string[] | null;
  category_tags?: string[] | null;
  why_recommended?: string | null;
  confidence_label?: string | null;
  deal_likelihood_score?: number | null;
  hidden_gem_score?: number | null;
  cheap_eats_score?: number | null;
  feed_section_candidates?: string[] | null;
  budget_tip?: string | null;
}

/** Normalised enrichment ready to persist onto a Place row. */
export interface PlaceEnrichmentFields {
  priceBucket: string | null;
  studentValueScore: number | null;
  affordabilityScore: number | null;
  bestFor: string | null;
  vibeTags: string[];
  categoryTags: string[];
  whyRecommended: string | null;
  confidenceLabel: string | null;
  dealLikelihoodScore: number | null;
  hiddenGemScore: number | null;
  cheapEatsScore: number | null;
  feedSectionCandidates: string[];
  /** Short, specific money-saving tip ("what to order / how to stretch a tight
   *  budget here"). Null when Gemini gave nothing usable. */
  budgetTip: string | null;
}

const VALID_PRICE_BUCKETS = new Set(['$', '$$', '$$$', '$$$$']);
const VALID_CONFIDENCE = new Set(['low', 'medium', 'high']);

function clamp01(v: number | null | undefined): number | null {
  if (v == null || Number.isNaN(v)) return null;
  return Math.max(0, Math.min(1, v));
}

function cleanStrings(arr: string[] | null | undefined, max = 12): string[] {
  if (!Array.isArray(arr)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of arr) {
    if (typeof raw !== 'string') continue;
    const v = raw.trim();
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

/** Map a single raw Gemini enrichment → persistable fields, enforcing the
 *  vocabulary on feedSectionCandidates and clamping scores to [0,1]. */
export function mapEnrichment(raw: RawPlaceEnrichment): PlaceEnrichmentFields {
  const priceBucket =
    typeof raw.price_bucket === 'string' && VALID_PRICE_BUCKETS.has(raw.price_bucket)
      ? raw.price_bucket
      : null;
  const confidenceLabel =
    typeof raw.confidence_label === 'string' && VALID_CONFIDENCE.has(raw.confidence_label)
      ? raw.confidence_label
      : null;

  const feedSectionCandidates = cleanStrings(raw.feed_section_candidates).filter((s) =>
    FEED_SECTION_SET.has(s),
  );

  return {
    priceBucket,
    studentValueScore: clamp01(raw.student_value_score),
    affordabilityScore: clamp01(raw.affordability_score),
    bestFor: typeof raw.best_for === 'string' && raw.best_for.trim() ? raw.best_for.trim() : null,
    vibeTags: cleanStrings(raw.vibe_tags),
    categoryTags: cleanStrings(raw.category_tags),
    whyRecommended:
      typeof raw.why_recommended === 'string' && raw.why_recommended.trim()
        ? raw.why_recommended.trim()
        : null,
    confidenceLabel,
    dealLikelihoodScore: clamp01(raw.deal_likelihood_score),
    hiddenGemScore: clamp01(raw.hidden_gem_score),
    cheapEatsScore: clamp01(raw.cheap_eats_score),
    feedSectionCandidates,
    budgetTip:
      typeof raw.budget_tip === 'string' && raw.budget_tip.trim() ? raw.budget_tip.trim() : null,
  };
}

/** Structured-output schema for one batch: a JSON array of enrichments. We key
 *  each element back to its place via `google_place_id` echoed from the prompt,
 *  so ordering drift never mis-assigns fields. */
export const ENRICHMENT_BATCH_SCHEMA = {
  type: 'object',
  properties: {
    enrichments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          place_key: { type: 'string' },
          price_bucket: { type: ['string', 'null'], enum: ['$', '$$', '$$$', '$$$$', null] },
          student_value_score: { type: 'number' },
          affordability_score: { type: 'number' },
          best_for: { type: ['string', 'null'] },
          vibe_tags: { type: 'array', items: { type: 'string' } },
          category_tags: { type: 'array', items: { type: 'string' } },
          why_recommended: { type: ['string', 'null'] },
          confidence_label: { type: 'string', enum: ['low', 'medium', 'high'] },
          deal_likelihood_score: { type: 'number' },
          hidden_gem_score: { type: 'number' },
          cheap_eats_score: { type: 'number' },
          feed_section_candidates: {
            type: 'array',
            items: { type: 'string', enum: [...FEED_SECTION_VOCAB] },
          },
          budget_tip: { type: ['string', 'null'] },
        },
        required: [
          'place_key',
          'price_bucket',
          'student_value_score',
          'affordability_score',
          'best_for',
          'vibe_tags',
          'category_tags',
          'why_recommended',
          'confidence_label',
          'deal_likelihood_score',
          'hidden_gem_score',
          'cheap_eats_score',
          'feed_section_candidates',
          'budget_tip',
        ],
      },
    },
  },
  required: ['enrichments'],
} as const;
