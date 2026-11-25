import { Store } from '@prisma/client';
import {
  type DraftCoverageChange,
  type DraftKeywordImpact,
  LISTING_DRAFT_RISK_POSITION,
  type ListingDraftTexts,
  type MetadataField,
  parseKeywordField,
  type TrackedKeywordItem,
} from '@asobeast/shared';
import type { ListingTexts } from '../apps/listing-texts';
import type {
  AuditListings,
  JudgedCoverageRow,
  MetadataSources,
} from './metadata.service';

const EMPTY_TEXTS: ListingTexts = {
  id: 'draft',
  title: '',
  subtitle: null,
  summary: null,
  description: '',
};

const CHANGE_ORDER: Record<DraftCoverageChange, number> = {
  lost: 0,
  gained: 1,
  kept: 2,
  none: 3,
};

export function draftTexts(
  base: ListingTexts | undefined,
  draft: ListingDraftTexts,
): ListingTexts {
  const texts = base ?? EMPTY_TEXTS;
  return {
    ...texts,
    title: draft.title ?? texts.title,
    subtitle: draft.subtitle ?? texts.subtitle,
    summary: draft.shortDescription ?? texts.summary,
    description: draft.description ?? texts.description,
  };
}

function draftListings(
  read: AuditListings,
  market: string,
  localization: string | null,
  view: ListingTexts,
): AuditListings {
  if (localization === null) {
    return { ...read, listings: new Map(read.listings).set(market, view) };
  }
  const entries = (read.localized.get(market) ?? []).map((entry) =>
    entry.localization === localization ? { ...entry, texts: view } : entry,
  );
  return { ...read, localized: new Map(read.localized).set(market, entries) };
}

export function draftKeywordPhrases(
  draft: ListingDraftTexts,
): string[] | undefined {
  return draft.keywordField === undefined
    ? undefined
    : parseKeywordField(draft.keywordField).phrases;
}

export function applyDraft(
  sources: MetadataSources,
  draft: ListingDraftTexts,
): MetadataSources {
  const view = draftTexts(sources.read.view, draft);
  const read = {
    ...draftListings(sources.read, sources.market, sources.localization, view),
    view,
  };
  const phrases = draftKeywordPhrases(draft);
  const keywordFields =
    phrases === undefined ||
    sources.app.store !== Store.APP_STORE ||
    sources.viewLocalization === undefined
      ? sources.keywordFields
      : new Map(sources.keywordFields).set(sources.viewLocalization, phrases);
  return { ...sources, read, keywordFields };
}

const coveringFields = (row: JudgedCoverageRow): MetadataField[] => [
  ...new Set(
    row.fields.filter((field) => field.covered).map((field) => field.field),
  ),
];

const isCovered = (row: JudgedCoverageRow): boolean => !row.uncovered;

function changeOf(before: boolean, after: boolean): DraftCoverageChange {
  if (before && after) return 'kept';
  if (before) return 'lost';
  return after ? 'gained' : 'none';
}

const sameFields = (a: readonly MetadataField[], b: readonly MetadataField[]) =>
  a.length === b.length && a.every((field, index) => field === b[index]);

const touchedByDraft = (
  row: JudgedCoverageRow,
  next: JudgedCoverageRow,
  market: string,
): boolean =>
  row.listingCountry === market ||
  isCovered(row) !== isCovered(next) ||
  !sameFields(coveringFields(row), coveringFields(next));

const byImpact = (a: DraftKeywordImpact, b: DraftKeywordImpact): number =>
  CHANGE_ORDER[a.change] - CHANGE_ORDER[b.change] ||
  (a.position ?? Infinity) - (b.position ?? Infinity) ||
  a.text.localeCompare(b.text);

export function draftImpacts(
  active: readonly TrackedKeywordItem[],
  before: readonly JudgedCoverageRow[],
  after: readonly JudgedCoverageRow[],
  market: string,
): DraftKeywordImpact[] {
  const judged = new Map(after.map((row) => [row.keywordId, row]));
  const items = new Map(active.map((item) => [item.keywordId, item]));
  return before
    .flatMap((row) => {
      const next = judged.get(row.keywordId);
      const item = items.get(row.keywordId);
      if (!next || !item || !touchedByDraft(row, next, market)) return [];
      const change = changeOf(isCovered(row), isCovered(next));
      const position = item.latestPosition;
      return [
        {
          keywordId: row.keywordId,
          text: row.text,
          country: item.country,
          position,
          traffic: item.traffic,
          opportunity: item.opportunity,
          coveredBefore: coveringFields(row),
          coveredAfter: coveringFields(next),
          change,
          atRisk:
            change === 'lost' &&
            position !== null &&
            position <= LISTING_DRAFT_RISK_POSITION,
        },
      ];
    })
    .sort(byImpact);
}
