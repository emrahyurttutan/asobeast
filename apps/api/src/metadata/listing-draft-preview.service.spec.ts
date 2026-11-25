import { BadRequestException } from '@nestjs/common';
import { Store } from '@prisma/client';
import type { AuditDraftScorer } from '../audit/audit-draft-scorer';
import {
  assertDraftFits,
  draftOf,
  ListingDraftPreviewService,
} from './listing-draft-preview.service';
import type { MetadataService, MetadataSources } from './metadata.service';

const sourcesFor = (
  overrides: Partial<MetadataSources> = {},
): MetadataSources => ({
  app: { id: 'app_1', store: Store.APP_STORE, name: 'Habit', country: 'us' },
  market: 'us',
  localization: null,
  viewLocalization: 'en-US',
  active: [],
  competitorNames: [],
  read: { listings: new Map(), localized: new Map(), view: undefined },
  keywordFields: new Map(),
  ...overrides,
});

describe('draftOf', () => {
  it('keeps only the texts the request carries', () => {
    expect(
      draftOf({ country: 'us', title: 'Habit Coach', subtitle: '' }),
    ).toEqual({ title: 'Habit Coach', subtitle: '' });
  });
});

describe('assertDraftFits', () => {
  it.each([
    [Store.APP_STORE, { shortDescription: 'x' }, 'shortDescription is'],
    [
      Store.GOOGLE_PLAY,
      { subtitle: 'x', keywordField: 'y' },
      'subtitle, keywordField are',
    ],
  ])('refuses a field %s does not have', (store, draft, message) => {
    expect(() => assertDraftFits(store, draft)).toThrow(BadRequestException);
    expect(() => assertDraftFits(store, draft)).toThrow(message);
  });

  it('refuses a localization on Google Play', () => {
    expect(() =>
      assertDraftFits(Store.GOOGLE_PLAY, { title: 'x' }, 'es-MX'),
    ).toThrow(BadRequestException);
  });

  it('accepts the fields of the store', () => {
    expect(() =>
      assertDraftFits(Store.GOOGLE_PLAY, { title: 'x', shortDescription: 'y' }),
    ).not.toThrow();
  });
});

describe('ListingDraftPreviewService', () => {
  const score = jest.fn();
  const build = (sources: MetadataSources) =>
    new ListingDraftPreviewService(
      {
        ensureApp: jest.fn().mockResolvedValue(sources.app),
        sources: jest.fn().mockResolvedValue(sources),
        coverageOf: jest.fn().mockReturnValue([]),
        fieldsOf: jest.fn().mockReturnValue([]),
      } as unknown as MetadataService,
      { score } as unknown as AuditDraftScorer,
    );

  beforeEach(() => {
    score.mockReset().mockResolvedValue({
      before: 70,
      after: 74,
      gradeBefore: 'B',
      gradeAfter: 'B',
    });
  });

  it('scores the home default listing with the draft texts', async () => {
    const result = await build(sourcesFor()).preview('app_1', {
      title: 'Habit Coach',
      keywordField: 'sleep, water',
    });

    expect(result.score).toEqual({
      before: 70,
      after: 74,
      gradeBefore: 'B',
      gradeAfter: 'B',
    });
    expect(score).toHaveBeenCalledWith(
      'app_1',
      expect.objectContaining({
        title: 'Habit Coach',
        keywordField: 'sleep,water',
      }),
      new Map(),
    );
  });

  it.each([
    ['another storefront', { market: 'de' }],
    ['a named localization', { localization: 'es-MX' as const }],
  ])('answers no score for %s', async (_case, overrides) => {
    const result = await build(sourcesFor(overrides)).preview('app_1', {
      title: 'Habit Coach',
    });

    expect(result.score).toBeNull();
    expect(score).not.toHaveBeenCalled();
  });

  it('refuses a field of the other store before judging anything', async () => {
    await expect(
      build(sourcesFor()).preview('app_1', { shortDescription: 'x' }),
    ).rejects.toThrow(BadRequestException);
    expect(score).not.toHaveBeenCalled();
  });
});
