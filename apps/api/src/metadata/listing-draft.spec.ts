import { Store } from '@prisma/client';
import type { TrackedKeywordItem } from '@asobeast/shared';
import type { ListingTexts } from '../apps/listing-texts';
import { applyDraft, draftImpacts, draftTexts } from './listing-draft';
import type { JudgedCoverageRow, MetadataSources } from './metadata.service';

const stored: ListingTexts = {
  id: 'snap_1',
  title: 'Habit Tracker',
  subtitle: 'Daily Streak Counter',
  summary: null,
  description: 'Build better habits.',
};

const sources = (
  overrides: Partial<MetadataSources> = {},
): MetadataSources => ({
  app: { id: 'app_1', store: Store.APP_STORE, name: 'Habit', country: 'us' },
  market: 'us',
  localization: null,
  viewLocalization: 'en-US',
  active: [],
  competitorNames: [],
  read: {
    listings: new Map([['us', stored]]),
    localized: new Map([
      [
        'us',
        [{ localization: 'es-MX', texts: { ...stored, title: 'Hábitos' } }],
      ],
    ]),
    view: stored,
  },
  keywordFields: new Map([['en-US', ['water reminder']]]),
  ...overrides,
});

const item = (
  keywordId: string,
  latestPosition: number | null,
): TrackedKeywordItem =>
  ({
    keywordId,
    text: keywordId,
    country: 'us',
    latestPosition,
    traffic: 6,
    opportunity: 40,
  }) as TrackedKeywordItem;

const row = (
  keywordId: string,
  covered: JudgedCoverageRow['fields'][number]['field'][],
  listingCountry = 'us',
): JudgedCoverageRow => ({
  keywordId,
  text: keywordId,
  bucket: null,
  fields: covered.map((field) => ({ field, covered: true })),
  uncovered: covered.length === 0,
  country: 'us',
  listingCountry,
});

describe('draftTexts', () => {
  it('keeps every stored text the draft leaves out', () => {
    expect(draftTexts(stored, { title: 'Habit Coach' })).toEqual({
      ...stored,
      title: 'Habit Coach',
    });
  });

  it('maps the short description onto the summary', () => {
    expect(
      draftTexts(stored, { shortDescription: 'Daily goals' }).summary,
    ).toBe('Daily goals');
  });

  it('starts from empty texts when nothing was captured', () => {
    expect(draftTexts(undefined, { subtitle: 'Sleep Timer' })).toMatchObject({
      title: '',
      subtitle: 'Sleep Timer',
      description: '',
    });
  });

  it('keeps an empty string as a cleared field', () => {
    expect(draftTexts(stored, { subtitle: '' }).subtitle).toBe('');
  });
});

describe('applyDraft', () => {
  it('replaces the market listing and leaves the stored maps untouched', () => {
    const original = sources();
    const drafted = applyDraft(original, { title: 'Habit Coach' });

    expect(drafted.read.listings.get('us')?.title).toBe('Habit Coach');
    expect(drafted.read.view?.title).toBe('Habit Coach');
    expect(original.read.listings.get('us')?.title).toBe('Habit Tracker');
  });

  it('replaces only the localization read when one is named', () => {
    const drafted = applyDraft(
      sources({ localization: 'es-MX', viewLocalization: 'es-MX' }),
      { title: 'Rutinas' },
    );

    expect(drafted.read.localized.get('us')?.[0].texts.title).toBe('Rutinas');
    expect(drafted.read.listings.get('us')?.title).toBe('Habit Tracker');
  });

  it('parses the draft keyword field into normalized phrases', () => {
    const drafted = applyDraft(sources(), {
      keywordField: 'Sleep Timer, water ,sleep timer',
    });

    expect(drafted.keywordFields.get('en-US')).toEqual([
      'sleep timer',
      'water',
    ]);
  });

  it('ignores a keyword field on Google Play', () => {
    const play = sources({
      app: {
        id: 'app_1',
        store: Store.GOOGLE_PLAY,
        name: 'Habit',
        country: 'us',
      },
    });

    expect(applyDraft(play, { keywordField: 'sleep' }).keywordFields).toBe(
      play.keywordFields,
    );
  });
});

describe('draftImpacts', () => {
  const active = [
    item('kept', 2),
    item('lost', 4),
    item('far', 40),
    item('new', null),
  ];

  it('classifies every change and marks a lost top 10 position as at risk', () => {
    const impacts = draftImpacts(
      active,
      [
        row('kept', ['title']),
        row('lost', ['subtitle']),
        row('far', ['title']),
        row('new', []),
      ],
      [
        row('kept', ['title']),
        row('lost', []),
        row('far', []),
        row('new', ['subtitle']),
      ],
      'us',
    );

    expect(
      impacts.map(({ keywordId, change, atRisk }) => [
        keywordId,
        change,
        atRisk,
      ]),
    ).toEqual([
      ['lost', 'lost', true],
      ['far', 'lost', false],
      ['new', 'gained', false],
      ['kept', 'kept', false],
    ]);
  });

  it('lists a field once even when two localizations cover the keyword', () => {
    const twice: JudgedCoverageRow = {
      ...row('kept', ['title']),
      fields: [
        { field: 'title', covered: true },
        { field: 'title', covered: true, localization: 'es-MX' },
      ],
    };

    expect(
      draftImpacts(active, [twice], [twice], 'us')[0].coveredBefore,
    ).toEqual(['title']);
  });

  it('keeps a keyword of another listing whose coverage the draft changes', () => {
    expect(
      draftImpacts(
        active,
        [row('lost', ['keywordField'], 'ca')],
        [row('lost', [], 'ca')],
        'us',
      ).map((impact) => [impact.keywordId, impact.change, impact.atRisk]),
    ).toEqual([['lost', 'lost', true]]);
  });

  it('leaves out an unchanged keyword judged on another listing', () => {
    expect(
      draftImpacts(
        active,
        [row('kept', ['title'], 'de')],
        [row('kept', ['title'], 'de')],
        'us',
      ),
    ).toEqual([]);
  });
});
