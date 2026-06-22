import type { DealCandidate } from '../deal-candidate';

export type RawCandidate = Omit<DealCandidate, 'latitude' | 'longitude' | 'geocodeConfidence'>;
export interface ExtractionResult { candidates: RawCandidate[] }
export interface ExtractContext { url: string; merchantHint?: string; defaultCategorySlug?: string }
export interface DealExtractor { extract(html: string, ctx: ExtractContext): Promise<ExtractionResult> }
