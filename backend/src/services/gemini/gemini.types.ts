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
