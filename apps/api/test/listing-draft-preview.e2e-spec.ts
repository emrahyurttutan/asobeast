import { execSync } from 'child_process';
import { join } from 'path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, Store } from '@prisma/client';
import type {
  AppAuditResult,
  DraftKeywordImpact,
  ListingDraftPreview,
} from '@asobeast/shared';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { DEFAULT_WORKSPACE_ID } from '../src/common/tenancy/default-workspace';
import { seedApiToken } from './helpers/api-tokens';
import { ownerAgent, useCookies } from './helpers/session';
import { testDb } from './helpers/test-db';
import { obliterateQueues, settleBootRegistration } from './obliterate-queues';

const D0 = new Date('2026-07-01T00:00:00.000Z');

interface SeedKeyword {
  text: string;
  position: number | null;
  source?: 'MANUAL' | 'KEYWORD_FIELD';
  country?: string;
}

const APP_STORE_KEYWORDS: SeedKeyword[] = [
  { text: 'habit tracker', position: 3 },
  { text: 'streak counter', position: 7 },
  { text: 'water reminder', position: 15, source: 'KEYWORD_FIELD' },
  { text: 'sleep timer', position: null },
];

describe('Listing draft preview (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let api: Awaited<ReturnType<typeof ownerAgent>>;

  beforeAll(async () => {
    execSync('pnpm prisma migrate deploy', {
      cwd: join(__dirname, '..'),
      env: process.env,
      stdio: 'ignore',
    });
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    useCookies(app);
    await app.init();
    await settleBootRegistration(app);
    prisma = testDb();
    await prisma.workspace.upsert({
      where: { id: DEFAULT_WORKSPACE_ID },
      update: {},
      create: { id: DEFAULT_WORKSPACE_ID, name: 'Default' },
    });
    api = await ownerAgent(app);
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "App", "Keyword" RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await obliterateQueues(app);
    await app.close();
  });

  const trackAll = async (
    appId: string,
    store: Store,
    keywords: SeedKeyword[],
  ): Promise<void> => {
    for (const row of keywords) {
      const keyword = await prisma.keyword.create({
        data: { text: row.text, store, country: row.country ?? 'us' },
      });
      await prisma.trackedKeyword.create({
        data: {
          appId,
          keywordId: keyword.id,
          source: row.source ?? 'MANUAL',
          active: true,
        },
      });
      await prisma.keywordMetric.create({
        data: { keywordId: keyword.id, date: D0, traffic: 6, difficulty: 3 },
      });
      await prisma.keywordRanking.create({
        data: {
          appId,
          workspaceId: DEFAULT_WORKSPACE_ID,
          keywordId: keyword.id,
          date: D0,
          position: row.position,
        },
      });
    }
  };

  const seedAppStore = async (): Promise<string> => {
    const created = await prisma.app.create({
      data: {
        workspaceId: DEFAULT_WORKSPACE_ID,
        store: Store.APP_STORE,
        storeAppId: '1234567890',
        country: 'us',
        name: 'Habit Tracker',
      },
    });
    await prisma.appSnapshot.create({
      data: {
        appId: created.id,
        title: 'Habit Tracker',
        subtitle: 'Daily Streak Counter',
        description: 'Build better habits.',
        raw: {},
        capturedAt: D0,
      },
    });
    await trackAll(created.id, Store.APP_STORE, APP_STORE_KEYWORDS);
    await prisma.keywordField.create({
      data: {
        appId: created.id,
        workspaceId: DEFAULT_WORKSPACE_ID,
        localization: 'en-US',
        phrases: ['water reminder'],
      },
    });
    return created.id;
  };

  const seedPlay = async (): Promise<string> => {
    const created = await prisma.app.create({
      data: {
        workspaceId: DEFAULT_WORKSPACE_ID,
        store: Store.GOOGLE_PLAY,
        storeAppId: 'com.example.habits',
        country: 'us',
        name: 'Habit Tracker',
      },
    });
    await prisma.appSnapshot.create({
      data: {
        appId: created.id,
        title: 'Habit Tracker',
        summary: 'Daily goals and a sleep timer',
        description: 'Build better habits.',
        raw: {},
        capturedAt: D0,
      },
    });
    await trackAll(created.id, Store.GOOGLE_PLAY, [
      { text: 'sleep timer', position: 4 },
    ]);
    return created.id;
  };

  const preview = async (
    appId: string,
    body: Record<string, unknown>,
  ): Promise<ListingDraftPreview> => {
    const res = await api
      .post(`/apps/${appId}/metadata/preview`)
      .send(body)
      .expect(200);
    return res.body as ListingDraftPreview;
  };

  const impactOf = (
    result: ListingDraftPreview,
    text: string,
  ): DraftKeywordImpact | undefined =>
    result.keywords.find((keyword) => keyword.text === text);

  it('flags a top 10 keyword the draft title drops', async () => {
    const appId = await seedAppStore();

    const result = await preview(appId, { title: 'Habit Coach' });

    expect(impactOf(result, 'habit tracker')).toMatchObject({
      change: 'lost',
      position: 3,
      atRisk: true,
      coveredBefore: ['title'],
      coveredAfter: [],
    });
    expect(result.keywords[0].text).toBe('habit tracker');
    expect(result.atRisk).toBe(1);
  });

  it('reports a keyword the draft subtitle gains', async () => {
    const appId = await seedAppStore();

    const result = await preview(appId, {
      subtitle: 'Streak Counter & Sleep Timer',
    });

    expect(impactOf(result, 'sleep timer')).toMatchObject({
      change: 'gained',
      atRisk: false,
      coveredAfter: ['subtitle'],
    });
    expect(impactOf(result, 'streak counter')?.change).toBe('kept');
  });

  it('judges the draft keyword field and keeps a lost keyword outside the top 10 off the risk count', async () => {
    const appId = await seedAppStore();

    const result = await preview(appId, { keywordField: 'sleep timer' });

    expect(impactOf(result, 'water reminder')).toMatchObject({
      change: 'lost',
      position: 15,
      atRisk: false,
    });
    expect(impactOf(result, 'sleep timer')?.change).toBe('gained');
    expect(result.atRisk).toBe(0);
  });

  it('lints the draft instead of the stored listing', async () => {
    const appId = await seedAppStore();
    const title = 'Habit Tracker for Every Single Day';

    const result = await preview(appId, { title });

    expect(
      result.fields.find((field) => field.field === 'title'),
    ).toMatchObject({ value: title, chars: 34, limit: 30 });
    expect(
      result.fields.find((field) => field.field === 'subtitle')?.value,
    ).toBe('Daily Streak Counter');
  });

  it('scores the home listing before and after the draft', async () => {
    const appId = await seedAppStore();
    const audit = (await api.get(`/apps/${appId}/audit`).expect(200))
      .body as AppAuditResult;

    const unchanged = await preview(appId, {});

    expect(unchanged.score?.before).toBe(audit.overall);
    expect(unchanged.score?.after).toBe(audit.overall);
    expect(
      unchanged.keywords.every((keyword) => keyword.change !== 'lost'),
    ).toBe(true);
  });

  it('writes nothing', async () => {
    const appId = await seedAppStore();

    await preview(appId, { title: 'Habit Coach', keywordField: 'sleep timer' });

    const snapshots = await prisma.appSnapshot.findMany({ where: { appId } });
    expect(snapshots.map((snapshot) => snapshot.title)).toEqual([
      'Habit Tracker',
    ]);
    const field = await prisma.keywordField.findFirst({ where: { appId } });
    expect(field?.phrases).toEqual(['water reminder']);
    expect(await prisma.trackedKeyword.count({ where: { appId } })).toBe(4);
  });

  it('answers a read scoped token', async () => {
    const appId = await seedAppStore();
    const token = await seedApiToken(prisma, {
      seed: 'draftpreviewread',
      email: 'reader@example.com',
      role: 'member',
      workspaceId: DEFAULT_WORKSPACE_ID,
      scope: 'read',
    });

    await request(app.getHttpServer())
      .post(`/apps/${appId}/metadata/preview`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Habit Coach' })
      .expect(200);
  });

  it('judges a named localization of another storefront without a score', async () => {
    const appId = await seedAppStore();
    await prisma.appSnapshot.create({
      data: {
        appId,
        country: 'pl',
        title: 'Nawyki',
        description: 'Opis',
        raw: {},
        capturedAt: D0,
      },
    });
    await prisma.appSnapshot.create({
      data: {
        appId,
        country: 'pl',
        localization: 'pl',
        title: 'Nawyki Tracker',
        subtitle: 'Codzienne cele',
        description: 'Opis',
        raw: {},
        capturedAt: D0,
      },
    });
    await trackAll(appId, Store.APP_STORE, [
      { text: 'nawyki tracker', position: 2, country: 'pl' },
    ]);

    const result = await preview(appId, {
      country: 'pl',
      localization: 'pl',
      title: 'Nawyki',
    });

    expect(result).toMatchObject({
      country: 'pl',
      localization: 'pl',
      score: null,
    });
    expect(result.fields.find((field) => field.field === 'title')?.value).toBe(
      'Nawyki',
    );
    expect(impactOf(result, 'nawyki tracker')).toMatchObject({
      change: 'lost',
      atRisk: true,
    });
  });

  it('judges a Play short description and refuses an App Store only field', async () => {
    const appId = await seedPlay();

    const result = await preview(appId, { shortDescription: 'Daily goals' });
    expect(impactOf(result, 'sleep timer')).toMatchObject({
      change: 'lost',
      atRisk: true,
    });

    await api
      .post(`/apps/${appId}/metadata/preview`)
      .send({ subtitle: 'Sleep Timer' })
      .expect(400);
    await api
      .post(`/apps/${appId}/metadata/preview`)
      .send({ localization: 'es-MX', title: 'Sleep Timer' })
      .expect(400);
  });

  it('answers 404 for an unknown app', async () => {
    await api
      .post('/apps/app_missing/metadata/preview')
      .send({ title: 'Habit Coach' })
      .expect(404);
  });
});
