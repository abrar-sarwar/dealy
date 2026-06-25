import { Injectable } from '@nestjs/common';
import type { GeminiConfig } from '../../config/gemini';
import type { GeminiClient } from './gemini.client';
import type {
  GeminiCrawlPlan,
  GeminiDealExtraction,
  GeminiVerificationReasoning,
} from './gemini.types';

const dealExtractionSchema = {
  type: 'object',
  properties: {
    deals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          merchant: { type: 'string' },
          category: { type: 'string' },
          discount: { type: ['string', 'null'] },
          expiration: { type: ['string', 'null'] },
          location: { type: ['string', 'null'] },
          summary: { type: 'string' },
          confidence: { type: 'number' },
          verification_status: {
            type: 'string',
            enum: ['pending', 'verified', 'unreachable', 'invalid', 'expired'],
          },
          verified: { type: 'boolean' },
          image_url: { type: ['string', 'null'] },
          campus_slug: { type: ['string', 'null'] },
          requires_student_id: { type: 'boolean' },
          audience: {
            type: 'string',
            enum: ['students', 'campus_community', 'faculty_staff', 'alumni', 'general'],
          },
          campus_deal_type: {
            type: 'string',
            enum: [
              'student_discount',
              'campus_perk',
              'dining',
              'ticket',
              'transport',
              'restaurant_lead',
              'other',
            ],
          },
        },
        required: [
          'title',
          'merchant',
          'category',
          'discount',
          'expiration',
          'location',
          'summary',
          'confidence',
          'verification_status',
          'verified',
          'image_url',
          'campus_slug',
          'requires_student_id',
          'audience',
          'campus_deal_type',
        ],
      },
    },
  },
  required: ['deals'],
};

const verificationSchema = {
  type: 'object',
  properties: {
    verified: { type: 'boolean' },
    confidence: { type: 'number' },
    reason: { type: 'string' },
  },
  required: ['verified', 'confidence', 'reason'],
};

@Injectable()
export class GeminiService {
  constructor(
    private readonly client: Pick<GeminiClient, 'generateJson'>,
    private readonly config: GeminiConfig,
  ) {}

  async extractDeals(input: {
    content: string;
    merchantHint?: string;
    sourceUrl: string;
    model?: string;
  }): Promise<GeminiDealExtraction> {
    this.assertEnabled();
    return this.client.generateJson<GeminiDealExtraction>({
      model: input.model ?? this.config.model,
      schema: dealExtractionSchema,
      prompt:
        'Extract concrete user-facing deals from the extracted page content. ' +
        'Return only offers with clear discount, promotion, or special value. ' +
        'For each deal set image_url to the single most relevant product / food / ' +
        'merchant image for that specific deal — an absolute https image URL that ' +
        'appears in the page content (e.g. a markdown image). Prefer a real product ' +
        'or food photo over a logo/banner; use null if the page has no suitable image. ' +
        'Set campus_slug to one of gsu, gt, ksu, uga when the deal is clearly tied to ' +
        'that campus, else null. ' +
        "Classify each offer's audience: 'students' only when explicitly for students / " +
        'requires a student ID / college pass / student ticket; ' +
        "'faculty_staff' for employee/faculty/staff perks; " +
        "'alumni' for alumni benefits; " +
        "'campus_community' for campus-card / community offers open beyond students " +
        "(e.g. BuzzCard, PantherID, '<school> community'); else 'general'. " +
        "Set requires_student_id true ONLY when audience is 'students' AND a student ID " +
        'is required — never for faculty/staff/alumni. ' +
        'Set campus_deal_type to the best fit (ticket, dining, transport, campus_perk, ' +
        'student_discount, restaurant_lead, or other). ' +
        `Source URL: ${input.sourceUrl}\nMerchant hint: ${input.merchantHint ?? ''}\n\nCONTENT:\n${input.content.slice(0, 12_000)}`,
    });
  }

  async planCrawl(input: {
    sourceType: string;
    url: string;
    category?: string;
    reliabilityScore: number;
    averageDealsFound: number;
    lastSuccessAt: Date | null;
  }): Promise<GeminiCrawlPlan> {
    this.assertEnabled();
    return this.client.generateJson<GeminiCrawlPlan>({
      model: this.config.model,
      schema: {
        type: 'object',
        properties: {
          crawl: { type: 'boolean' },
          reason: { type: 'string' },
          priority: { type: 'number' },
        },
        required: ['crawl', 'reason', 'priority'],
      },
      prompt:
        'You decide whether crawling this curated source right now is worth a paid Firecrawl fetch. ' +
        'Favour sources likely to hold fresh, concrete user-facing deals; skip ones unlikely to have changed or to yield offers. ' +
        'Return crawl (boolean), reason (short), priority 1-10.\n' +
        `Source type: ${input.sourceType}\nURL: ${input.url}\nCategory: ${input.category ?? ''}\n` +
        `Reliability score (0-100): ${input.reliabilityScore}\nAverage deals found per crawl: ${input.averageDealsFound}\n` +
        `Last successful crawl: ${input.lastSuccessAt?.toISOString() ?? 'never'}`,
    });
  }

  async classifyDeal(input: { content: string; title: string }): Promise<Record<string, unknown>> {
    this.assertEnabled();
    return this.client.generateJson({
      model: this.config.model,
      schema: {
        type: 'object',
        properties: { category: { type: 'string' }, confidence: { type: 'number' } },
        required: ['category', 'confidence'],
      },
      prompt: `Classify this deal.\nTITLE:${input.title}\nCONTENT:${input.content}`,
    });
  }

  async normalizeMerchant(input: {
    merchant: string;
    sourceUrl?: string;
  }): Promise<Record<string, unknown>> {
    this.assertEnabled();
    return this.client.generateJson({
      model: this.config.model,
      schema: {
        type: 'object',
        properties: { merchant: { type: 'string' }, confidence: { type: 'number' } },
        required: ['merchant', 'confidence'],
      },
      prompt: `Normalize this merchant name for display: ${input.merchant}\nSource: ${input.sourceUrl ?? ''}`,
    });
  }

  async detectDuplicate(input: {
    candidate: string;
    existing: string[];
  }): Promise<Record<string, unknown>> {
    this.assertEnabled();
    return this.client.generateJson({
      model: this.config.model,
      schema: {
        type: 'object',
        properties: {
          duplicate: { type: 'boolean' },
          match: { type: ['string', 'null'] },
          confidence: { type: 'number' },
        },
        required: ['duplicate', 'match', 'confidence'],
      },
      prompt: `Determine whether candidate deal duplicates any existing deal.\nCandidate:${input.candidate}\nExisting:${input.existing.join('\n')}`,
    });
  }

  async summarizeForUsers(input: {
    title: string;
    evidence: string;
  }): Promise<Record<string, unknown>> {
    this.assertEnabled();
    return this.client.generateJson({
      model: this.config.model,
      schema: {
        type: 'object',
        properties: { summary: { type: 'string' } },
        required: ['summary'],
      },
      prompt: `Write a short user-facing deal summary.\nTitle:${input.title}\nEvidence:${input.evidence}`,
    });
  }

  async reasonAboutVerification(input: {
    candidateSummary: string;
    extractedEvidence: string;
    conflict?: string;
  }): Promise<GeminiVerificationReasoning> {
    this.assertEnabled();
    return this.client.generateJson<GeminiVerificationReasoning>({
      model: this.config.reasoningModel,
      schema: verificationSchema,
      prompt:
        'Reason about whether this deal is verified from the provided extracted evidence. ' +
        'Use the evidence only; do not infer facts from outside knowledge.\n' +
        `Candidate: ${input.candidateSummary}\nEvidence: ${input.extractedEvidence}\nConflict: ${input.conflict ?? ''}`,
    });
  }

  private assertEnabled(): void {
    if (!this.config.enabled) throw new Error('Gemini AI processing is disabled');
  }
}
