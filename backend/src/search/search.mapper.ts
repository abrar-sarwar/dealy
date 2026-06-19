import type { Deal, Category } from '@prisma/client';
import type { DealDto } from '../deals/deal.dto';

/** Flattened, denormalized deal document stored in Meilisearch. */
export interface SearchDoc {
  id: string;
  title: string;
  merchant: string;
  category: string;
  shortDescription: string;
  detailedDescription: string;
  terms: string;
  currentPrice: number;
  originalPrice: number;
  currency: string;
  savingsAmount: number;
  savingsPercentage: number;
  dealScore: number;
  isOnline: boolean;
  isStudentOnly: boolean;
  couponCode: string | null;
  destinationUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  locationTags: string[];
  visualSeed: number;
  status: string;
  startAtTs: number | null;
  createdAtTs: number;
  expiresAtTs: number;
}

function minorToDollars(minor: bigint | null): number {
  return minor === null ? 0 : Number(minor) / 100;
}

export function dealToSearchDoc(deal: Deal & { category: Category }): SearchDoc {
  const currentPrice = minorToDollars(deal.currentPriceMinor);
  const originalPrice = minorToDollars(deal.originalPriceMinor);
  const savingsAmount = Math.max(originalPrice - currentPrice, 0);
  const savingsPercentage =
    originalPrice > 0 ? Math.round((savingsAmount / originalPrice) * 100) : 0;
  return {
    id: deal.id,
    title: deal.title,
    merchant: deal.merchant,
    category: deal.category.slug,
    shortDescription: deal.shortDescription,
    detailedDescription: deal.detailedDescription,
    terms: deal.terms,
    currentPrice,
    originalPrice,
    currency: deal.currency,
    savingsAmount,
    savingsPercentage,
    dealScore: deal.dealScore,
    isOnline: deal.isOnline,
    isStudentOnly: deal.isStudentOnly,
    couponCode: deal.couponCode,
    destinationUrl: deal.destinationUrl,
    latitude: deal.latitude,
    longitude: deal.longitude,
    locationTags: deal.locationTags,
    visualSeed: deal.visualSeed,
    status: deal.status,
    startAtTs: deal.startAt ? Math.floor(deal.startAt.getTime() / 1000) : null,
    createdAtTs: Math.floor(deal.createdAt.getTime() / 1000),
    expiresAtTs: Math.floor(deal.expiresAt.getTime() / 1000),
  };
}

export function searchDocToDealDto(doc: SearchDoc): DealDto {
  return {
    id: doc.id,
    title: doc.title,
    merchant: doc.merchant,
    category: doc.category,
    currentPrice: doc.currentPrice,
    originalPrice: doc.originalPrice,
    currency: doc.currency,
    savingsAmount: doc.savingsAmount,
    savingsPercentage: doc.savingsPercentage,
    distanceMiles: null,
    dealScore: doc.dealScore,
    isOnline: doc.isOnline,
    isStudentOnly: doc.isStudentOnly,
    shortDescription: doc.shortDescription,
    detailedDescription: doc.detailedDescription,
    terms: doc.terms,
    couponCode: doc.couponCode,
    destinationUrl: doc.destinationUrl,
    latitude: doc.latitude,
    longitude: doc.longitude,
    locationTags: doc.locationTags,
    visualSeed: doc.visualSeed,
    publishedAt: new Date(doc.createdAtTs * 1000).toISOString(),
    startAt: doc.startAtTs ? new Date(doc.startAtTs * 1000).toISOString() : null,
    expiresAt: new Date(doc.expiresAtTs * 1000).toISOString(),
  };
}
