import './helpers/enable-auth';
import {
  BOOTSTRAP_EMAIL,
  BOOTSTRAP_PASSWORD,
  BOOTSTRAP_TOKEN,
  clearBootstrapEnv,
} from './helpers/enable-bootstrap';
import { execSync } from 'child_process';
import { join } from 'path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import type { ApiTokenItem, AuthUser } from '@asobeast/shared';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import {
  BOOTSTRAP_TOKEN_NAME,
  HeadlessBootstrap,
} from '../src/auth/headless-bootstrap';
import { DEFAULT_WORKSPACE_ID } from '../src/common/tenancy/default-workspace';
import { restoreAuthEnv } from './helpers/auth-env';
import { testDb } from './helpers/test-db';
import {
  clearRateLimitCounters,
  obliterateQueues,
  pauseQueues,
} from './obliterate-queues';

const OWNER = {
  email: BOOTSTRAP_EMAIL,
  password: BOOTSTRAP_PASSWORD,
  apiToken: BOOTSTRAP_TOKEN,
};

const truncateUsers = (prisma: PrismaClient) =>
  prisma.$executeRawUnsafe('TRUNCATE TABLE "User" RESTART IDENTITY CASCADE');

describe('Headless bootstrap', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let bootstrap: HeadlessBootstrap;

  beforeAll(async () => {
    execSync('pnpm prisma migrate deploy', {
      cwd: join(__dirname, '..'),
      env: process.env,
      stdio: 'ignore',
    });
    prisma = testDb();
    await truncateUsers(prisma);
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication<App>();
    app.use(cookieParser());
    await app.init();
    await pauseQueues(app);
    bootstrap = app.get(HeadlessBootstrap);
    await bootstrap.completed();
  });

  beforeEach(() => clearRateLimitCounters(app));

  afterAll(async () => {
    await truncateUsers(prisma);
    await obliterateQueues(app);
    await app.close();
    clearBootstrapEnv();
    restoreAuthEnv();
    await prisma.$disconnect();
  });

  const signIn = async (): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: BOOTSTRAP_EMAIL, password: BOOTSTRAP_PASSWORD })
      .expect(200);
    const raw = res.headers['set-cookie'] as unknown as string[];
    return raw.find((entry) => entry.startsWith('asobeast_session=')) ?? '';
  };

  it('creates the owner in the bootstrap workspace at boot', async () => {
    const users = await prisma.user.findMany();
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      email: 'engine@example.com',
      role: 'owner',
      workspaceId: DEFAULT_WORKSPACE_ID,
    });
  });

  it('accepts the configured token as the owner', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${BOOTSTRAP_TOKEN}`)
      .expect(200);
    const me = res.body as AuthUser;
    expect(me.email).toBe('engine@example.com');
    expect(me.role).toBe('owner');
  });

  it('stores the token write scoped, hashed and named', async () => {
    const cookie = await signIn();
    const res = await request(app.getHttpServer())
      .get('/auth/tokens')
      .set('Cookie', cookie)
      .expect(200);
    const tokens = res.body as ApiTokenItem[];
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({
      name: BOOTSTRAP_TOKEN_NAME,
      scope: 'write',
      expiresAt: null,
      prefix: BOOTSTRAP_TOKEN.slice(0, 12),
    });
    const stored = await prisma.apiToken.findMany({
      select: { tokenHash: true },
    });
    expect(stored[0].tokenHash).not.toBe(BOOTSTRAP_TOKEN);
  });

  it('changes nothing when it runs again', async () => {
    await expect(bootstrap.provision(OWNER)).resolves.toBe('unchanged');
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.apiToken.count()).toBe(1);
  });

  it('keeps registration closed once the owner exists', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'stranger@example.com', password: 'strangersecret1' })
      .expect(403);
  });

  it('restores a revoked token on the next run', async () => {
    await prisma.apiToken.deleteMany();

    await expect(bootstrap.provision(OWNER)).resolves.toBe('token');

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${BOOTSTRAP_TOKEN}`)
      .expect(200);
  });

  it('creates nothing for an address that is not the existing owner', async () => {
    await expect(
      bootstrap.provision({ ...OWNER, email: 'someone@example.com' }),
    ).resolves.toBe('owner-missing');
    expect(await prisma.user.count()).toBe(1);
  });
});
