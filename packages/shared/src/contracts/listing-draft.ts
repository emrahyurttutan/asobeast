import type { Store } from '../index';
import type { MetadataField } from '../aso/limits';
import type { AppStoreLocalization } from '../storefronts/app-store-localizations';
import type { AuditGrade } from './audit';
import type { MetadataFieldAudit } from './metadata';

export const LISTING_DRAFT_RISK_POSITION = 10;

export const LISTING_DRAFT_TEXT_MAX = 8000;

export const LISTING_DRAFT_FIELDS = [
  'title',
  'subtitle',
  'keywordField',
  'shortDescription',
  'description',
] as const satisfies readonly MetadataField[];

export type ListingDraftField = (typeof LISTING_DRAFT_FIELDS)[number];

export type ListingDraftTexts = Partial<Record<ListingDraftField, string>>;

export interface ListingDraftRequest extends ListingDraftTexts {
  country?: string;
  localization?: AppStoreLocalization;
}

export const DRAFT_COVERAGE_CHANGES = [
  'gained',
  'lost',
  'kept',
  'none',
] as const;

export type DraftCoverageChange = (typeof DRAFT_COVERAGE_CHANGES)[number];

export interface DraftKeywordImpact {
  keywordId: string;
  text: string;
  country: string;
  position: number | null;
  traffic: number | null;
  opportunity: number | null;
  coveredBefore: MetadataField[];
  coveredAfter: MetadataField[];
  change: DraftCoverageChange;
  atRisk: boolean;
}

export interface ListingDraftScore {
  before: number | null;
  after: number | null;
  gradeBefore: AuditGrade | null;
  gradeAfter: AuditGrade | null;
}

export interface ListingDraftPreview {
  appId: string;
  store: Store;
  country: string;
  localization?: AppStoreLocalization;
  fields: MetadataFieldAudit[];
  keywords: DraftKeywordImpact[];
  atRisk: number;
  score: ListingDraftScore | null;
}
