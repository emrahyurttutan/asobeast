import { Injectable, NotFoundException } from '@nestjs/common';
import { Store } from '@prisma/client';
import {
  AppStoreLocalization,
  assertStorefront,
  countChars,
  KEYWORD_FIELD_CHAR_LIMIT,
  KeywordCoverageRow,
  lintDescription,
  lintKeywordField,
  lintShortDescription,
  lintSubtitle,
  lintTitle,
  LintContext,
  MetadataAuditResult,
  MetadataField,
  MetadataFieldAudit,
  keywordFieldLocalizations,
  ScreenshotItem,
  STORE_FIELD_LIMITS,
  tokenize,
  TrackedKeywordItem,
} from '@asobeast/shared';
import { storedKeywordFields } from '../keywords/keyword-field-index';
import { KeywordsService } from '../keywords/keywords.service';
import { PrismaService } from '../prisma/prisma.service';
import { suggestKeywordField } from './keyword-field-suggestion';
import { judgeKeywordCoverage } from './keyword-coverage-judge';
import { FieldPhrases, fieldPhrases, keywordFieldOf } from './listing-surfaces';
import {
  latestListingTexts,
  latestLocalizedTexts,
  ListingTexts,
  LocalizedTexts,
} from '../apps/listing-texts';
import { missingListing } from '../apps/missing-listing';
import { ScreenshotsService } from '../screenshots/screenshots.service';
import {
  screenshotTextCoverage,
  screenshotTextState,
} from './screenshot-coverage';

export type JudgedCoverageRow = KeywordCoverageRow & { listingCountry: string };

export interface AuditListings {
  listings: Map<string, ListingTexts>;
  localized: Map<string, LocalizedTexts[]>;
  view: ListingTexts | undefined;
}

export interface AuditedApp {
  id: string;
  store: Store;
  name: string | null;
  country: string;
}

export interface MetadataSources {
  app: AuditedApp;
  market: string;
  localization: AppStoreLocalization | null;
  viewLocalization: AppStoreLocalization | undefined;
  active: TrackedKeywordItem[];
  competitorNames: string[];
  read: AuditListings;
  keywordFields: FieldPhrases;
}

@Injectable()
export class MetadataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly keywords: KeywordsService,
    private readonly screenshots: ScreenshotsService,
  ) {}

  async audit(
    appId: string,
    country?: string,
    localization: AppStoreLocalization | null = null,
  ): Promise<MetadataAuditResult> {
    const sources = await this.sources(appId, country, localization);
    const { app, market, active, read, viewLocalization } = sources;
    const fields = this.fieldsOf(sources);
    const coverage = this.coverageOf(sources);
    const shots = await this.screenshotsOf(app.store, read.listings, [
      market,
      ...coverage.map((row) => row.listingCountry),
    ]);
    const reading = this.screenshots.reading(app.store);
    const textOf = (listing: string) =>
      screenshotTextState(shots(listing), reading);
    const screenshotText = textOf(market);

    return {
      appId,
      store: app.store,
      fields,
      coverage: coverage.map((row) =>
        textOf(row.listingCountry)?.status === 'ready'
          ? {
              ...row,
              screenshotText: screenshotTextCoverage(
                shots(row.listingCountry),
                row.text,
              ),
            }
          : row,
      ),
      keywordFieldSuggestion:
        app.store === Store.APP_STORE
          ? suggestKeywordField(
              active.filter((item) => item.country === market),
              coverage.filter((row) => row.country === market),
              viewLocalization,
            )
          : null,
      ...(screenshotText ? { screenshotText } : {}),
      country: market,
      ...(localization === null ? {} : { localization }),
    };
  }

  async sources(
    appId: string,
    country: string | undefined,
    localization: AppStoreLocalization | null,
  ): Promise<MetadataSources> {
    const app = await this.ensureApp(appId);
    const market = country ?? app.country;
    if (market !== app.country) {
      assertStorefront(app.store, market);
    }
    const [tracked, competitors, stored] = await Promise.all([
      this.keywords.listTracked(appId, undefined, country, {
        brandFacts: app.store === Store.APP_STORE,
      }),
      this.prisma.app.findMany({
        where: { primaryAppId: appId },
        select: { name: true },
      }),
      storedKeywordFields(this.prisma, appId),
    ]);
    const active = tracked.filter((item) => item.active);
    return {
      app,
      market,
      localization,
      viewLocalization: localization ?? keywordFieldLocalizations(market)[0],
      active,
      competitorNames: competitors
        .map((competitor) => competitor.name)
        .filter((name): name is string => Boolean(name)),
      read: await this.readListings(app, market, localization, active),
      keywordFields: fieldPhrases(stored),
    };
  }

  fieldsOf(sources: MetadataSources): MetadataFieldAudit[] {
    const { app, active, read, keywordFields, viewLocalization } = sources;
    const view = read.view;
    const context: LintContext = {
      titleWords: tokenize(view?.title ?? ''),
      subtitleWords: tokenize(view?.subtitle ?? ''),
      brandTokens: tokenize(app.name ?? ''),
      competitorNames: sources.competitorNames,
      trackedKeywords: active.map((item) => item.text),
    };
    if (app.store === Store.GOOGLE_PLAY) {
      return this.playFields(view, context);
    }
    return this.appStoreFields(
      view,
      context,
      keywordFieldOf(keywordFields, viewLocalization),
    );
  }

  coverageOf(sources: MetadataSources): JudgedCoverageRow[] {
    return this.judgeCoverage(
      sources.app,
      sources.active,
      sources.read,
      sources.keywordFields,
    );
  }

  private async readListings(
    app: { id: string; store: Store; country: string },
    market: string,
    localization: AppStoreLocalization | null,
    active: TrackedKeywordItem[],
  ): Promise<AuditListings> {
    const listings = await latestListingTexts(
      this.prisma,
      app.id,
      app.country,
      [app.country, market, ...active.map((item) => item.country)],
    );
    const localized =
      app.store === Store.APP_STORE
        ? await latestLocalizedTexts(this.prisma, app.id, app.country, [
            ...listings.keys(),
          ])
        : new Map<string, LocalizedTexts[]>();
    const view =
      localization === null
        ? listings.get(market)
        : localized
            .get(market)
            ?.find((entry) => entry.localization === localization)?.texts;
    if (localization !== null && !view) {
      throw missingListing(market, localization);
    }
    if (market !== app.country && !view) {
      throw missingListing(market);
    }
    return { listings, localized, view };
  }

  private async screenshotsOf(
    store: Store,
    listings: Map<string, ListingTexts>,
    markets: readonly string[],
  ): Promise<(market: string) => ScreenshotItem[]> {
    const snapshotIds = new Map(
      markets.flatMap((market) => {
        const listing = listings.get(market);
        return listing ? [[market, listing.id] as const] : [];
      }),
    );
    const screenshots = await this.screenshots.ofSnapshots(store, [
      ...new Set(snapshotIds.values()),
    ]);
    return (market) => {
      const snapshotId = snapshotIds.get(market);
      return snapshotId === undefined
        ? []
        : (screenshots.get(snapshotId) ?? []);
    };
  }

  private playFields(
    view: ListingTexts | undefined,
    context: LintContext,
  ): MetadataFieldAudit[] {
    const store = Store.GOOGLE_PLAY;
    const title = view?.title ?? '';
    const summary = view?.summary ?? '';
    const description = view?.description ?? '';
    return [
      this.field(store, 'title', title, lintTitle(title, 30, store)),
      this.field(
        store,
        'shortDescription',
        summary,
        lintShortDescription(summary, context, 80),
      ),
      this.field(
        store,
        'description',
        description,
        lintDescription(
          description,
          STORE_FIELD_LIMITS.GOOGLE_PLAY.description!.limit,
        ),
      ),
    ];
  }

  private appStoreFields(
    view: ListingTexts | undefined,
    context: LintContext,
    keywordFieldValue: string,
  ): MetadataFieldAudit[] {
    const store = Store.APP_STORE;
    const title = view?.title ?? '';
    const subtitle = view?.subtitle ?? '';
    const description = view?.description ?? '';
    const keywordField =
      keywordFieldValue.length > 0
        ? [
            this.field(
              store,
              'keywordField',
              keywordFieldValue,
              lintKeywordField(
                keywordFieldValue,
                context,
                KEYWORD_FIELD_CHAR_LIMIT,
              ),
            ),
          ]
        : [];
    return [
      this.field(store, 'title', title, lintTitle(title, 30, store)),
      this.field(
        store,
        'subtitle',
        subtitle,
        lintSubtitle(subtitle, context, 30),
      ),
      ...keywordField,
      this.field(
        store,
        'description',
        description,
        lintDescription(
          description,
          STORE_FIELD_LIMITS.APP_STORE.description!.limit,
        ),
      ),
    ];
  }

  private judgeCoverage(
    app: { store: Store; country: string },
    active: TrackedKeywordItem[],
    { listings, localized }: AuditListings,
    keywordFields: FieldPhrases,
  ): JudgedCoverageRow[] {
    return active.map((item) => {
      const { fields, listingCountry, uncovered, wordsSplit } =
        judgeKeywordCoverage(app, item, { listings, localized, keywordFields });
      return {
        keywordId: item.keywordId,
        text: item.text,
        bucket: item.bucket,
        fields,
        uncovered,
        ...(wordsSplit ? { wordsSplit } : {}),
        country: item.country,
        listingCountry,
      };
    });
  }

  private field(
    store: Store,
    field: MetadataField,
    value: string,
    issues: MetadataFieldAudit['issues'],
  ): MetadataFieldAudit {
    const limit = STORE_FIELD_LIMITS[store][field]!;
    return {
      field,
      value,
      chars: countChars(value),
      limit: limit.limit,
      indexed: limit.indexed,
      issues,
    };
  }

  async ensureApp(appId: string): Promise<AuditedApp> {
    const app = await this.prisma.app.findFirst({
      where: { id: appId },
      select: { id: true, store: true, name: true, country: true },
    });
    if (!app) {
      throw new NotFoundException(`App ${appId} not found`);
    }
    return app;
  }
}
