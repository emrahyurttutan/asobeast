import { appStoreContext, keyword } from './audit-context.fixture';
import { draftContext } from './audit-draft-scorer';
import { computeAudit } from './rubric';

const texts = {
  title: 'Habit Coach',
  subtitle: 'Sleep Timer',
  summary: null,
  description: 'Build better habits.',
  keywordField: 'water,reminder',
};

describe('draftContext', () => {
  const context = appStoreContext({
    keywords: [
      keyword('habit tracker', 'core', 60, { uncovered: false }),
      keyword('sleep timer', 'core', 50, { uncovered: true }),
    ],
  });

  it('replaces the texts and the judged coverage, nothing else', () => {
    const drafted = draftContext(
      context,
      texts,
      new Map([['sleep timer', false]]),
    );

    expect(drafted).toMatchObject(texts);
    expect(drafted.keywords.map((item) => item.uncovered)).toEqual([
      false,
      false,
    ]);
    expect(drafted.reviews).toBe(context.reviews);
    expect(context.keywords[1].uncovered).toBe(true);
  });

  it('scores the same as the stored listing when the draft repeats it', () => {
    const same = draftContext(
      context,
      {
        title: context.title,
        subtitle: context.subtitle,
        summary: context.summary,
        description: context.description,
        keywordField: context.keywordField,
      },
      new Map(),
    );

    expect(computeAudit(same).overall).toBe(computeAudit(context).overall);
  });
});
