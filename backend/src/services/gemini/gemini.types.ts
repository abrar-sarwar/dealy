export type DealAiTask =
  | 'deal_extraction'
  | 'deal_classification'
  | 'merchant_normalization'
  | 'duplicate_detection'
  | 'user_summary'
  | 'confidence_scoring'
  | 'verification_reasoning';

export interface GeminiGenerateJsonRequest {
  model: string;
  prompt: string;
  schema: Record<string, unknown>;
}

export interface GeminiDeal {
  title: string;
  merchant: string;
  category: string;
  discount: string | null;
  expiration: string | null;
  location: string | null;
  summary: string;
  confidence: number;
  verification_status: 'pending' | 'verified' | 'unreachable' | 'invalid' | 'expired';
  verified: boolean;
  image_url: string | null;
  campus_slug: string | null;
  requires_student_id: boolean;
  audience: 'students' | 'campus_community' | 'faculty_staff' | 'alumni' | 'general';
  campus_deal_type:
    | 'student_discount'
    | 'campus_perk'
    | 'dining'
    | 'ticket'
    | 'transport'
    | 'restaurant_lead'
    | 'other';
  /** 0..1 — how relevant this offer is to the target area/category goal. */
  area_relevance: number;
  /** 0..1 — 1 = a specific discount ("20% off"); 0 = vague/no concrete terms. */
  concrete_offer_score: number;
  /** true for "Special Offer"/"Purchase a Gift Card"/no concrete benefit. */
  is_vague: boolean;
}

export interface GeminiDealExtraction {
  deals: GeminiDeal[];
}

export interface GeminiVerificationReasoning {
  verified: boolean;
  confidence: number;
  reason: string;
}

export interface GeminiCrawlPlan {
  crawl: boolean;
  reason: string;
  priority: number;
}
