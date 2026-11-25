import { BadRequestException, Injectable } from '@nestjs/common';
import { Store } from '@prisma/client';
import type {
  ListingDraftField,
  ListingDraftPreview,
  ListingDraftRequest,
  ListingDraftScore,
  ListingDraftTexts,
} from '@asobeast/shared';
import { AuditDraftScorer } from '../audit/audit-draft-scorer';
import { keywordFieldOf } from './listing-surfaces';
import { applyDraft, draftImpacts } from './listing-draft';
import {
  JudgedCoverageRow,
  MetadataService,
  MetadataSources,
} from './metadata.service';

const STORE_ONLY_FIELDS: Record<Store, readonly ListingDraftField[]> = {
  [Store.APP_STORE]: ['shortDescription'],
  [Store.GOOGLE_PLAY]: ['subtitle', 'keywordField'],
};

export function draftOf(request: ListingDraftRequest): ListingDraftTexts {
  const { title, subtitle, keywordField, shortDescription, description } =
    request;
  return Object.fromEntries(
    Object.entries({
      title,
      subtitle,
      keywordField,
      shortDescription,
      description,
    }).filter(([, value]) => value !== undefined),
  );
}

export function assertDraftFits(
  store: Store,
  draft: ListingDraftTexts,
  localization: string | null = null,
): void {
  if (store === Store.GOOGLE_PLAY && localization !== null) {
    throw new BadRequestException(
      'localization names an App Store localization and Google Play has none',
    );
  }
  const refused = STORE_ONLY_FIELDS[store].filter(
    (field) => draft[field] !== undefined,
  );
  if (refused.length > 0) {
    throw new BadRequestException(
      `${refused.join(', ')} ${refused.length === 1 ? 'is' : 'are'} not a field of this store`,
    );
  }
}

@Injectable()
export class ListingDraftPreviewService {
  constructor(
    private readonly metadata: MetadataService,
    private readonly scorer: AuditDraftScorer,
  ) {}

  async preview(
    appId: string,
    request: ListingDraftRequest,
  ): Promise<ListingDraftPreview> {
    const localization = request.localization ?? null;
    const draft = draftOf(request);
    const { store } = await this.metadata.ensureApp(appId);
    assertDraftFits(store, draft, localization);
    const sources = await this.metadata.sources(
      appId,
      request.country,
      localization,
    );
    const drafted = applyDraft(sources, draft);
    const after = this.metadata.coverageOf(drafted);
    const keywords = draftImpacts(
      sources.active,
      this.metadata.coverageOf(sources),
      after,
      sources.market,
    );
    return {
      appId,
      store: sources.app.store,
      country: sources.market,
      ...(localization === null ? {} : { localization }),
      fields: this.metadata.fieldsOf(drafted),
      keywords,
      atRisk: keywords.filter((keyword) => keyword.atRisk).length,
      score: await this.scoreOf(drafted, after),
    };
  }

  private scoreOf(
    drafted: MetadataSources,
    after: readonly JudgedCoverageRow[],
  ): Promise<ListingDraftScore> | null {
    const { app, market, localization, read, keywordFields } = drafted;
    if (market !== app.country || localization !== null) return null;
    const view = read.view;
    const keywordField =
      app.store === Store.APP_STORE
        ? keywordFieldOf(keywordFields, drafted.viewLocalization) || null
        : null;
    return this.scorer.score(
      app.id,
      {
        title: view?.title ?? '',
        subtitle: view?.subtitle ?? null,
        summary: view?.summary ?? null,
        description: view?.description ?? '',
        keywordField,
      },
      new Map(
        after
          .filter((row) => row.country === app.country)
          .map((row) => [row.keywordId, row.uncovered]),
      ),
    );
  }
}
