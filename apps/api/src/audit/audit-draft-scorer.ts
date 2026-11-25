import { Injectable } from '@nestjs/common';
import type { ListingDraftScore } from '@asobeast/shared';
import { AuditContextLoader } from './audit-context.loader';
import type { AuditContext } from './audit-scoring';
import { computeAudit } from './rubric';

export interface DraftAuditTexts {
  title: string;
  subtitle: string | null;
  summary: string | null;
  description: string;
  keywordField: string | null;
}

export function draftContext(
  context: AuditContext,
  texts: DraftAuditTexts,
  uncovered: ReadonlyMap<string, boolean>,
): AuditContext {
  return {
    ...context,
    ...texts,
    keywords: context.keywords.map((keyword) => {
      const judged = uncovered.get(keyword.id);
      return judged === undefined ? keyword : { ...keyword, uncovered: judged };
    }),
  };
}

@Injectable()
export class AuditDraftScorer {
  constructor(private readonly loader: AuditContextLoader) {}

  async score(
    appId: string,
    texts: DraftAuditTexts,
    uncovered: ReadonlyMap<string, boolean>,
  ): Promise<ListingDraftScore> {
    const context = await this.loader.load(appId);
    const before = computeAudit(context);
    const after = computeAudit(draftContext(context, texts, uncovered));
    return {
      before: before.overall,
      after: after.overall,
      gradeBefore: before.grade ?? null,
      gradeAfter: after.grade ?? null,
    };
  }
}
