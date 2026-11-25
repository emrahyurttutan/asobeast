import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import type { Prisma } from '@prisma/client';
import { CrossTenantAccess } from '../common/tenancy/cross-tenant-access';
import { DEFAULT_WORKSPACE_ID } from '../common/tenancy/default-workspace';
import {
  bootstrapOwnerOf,
  type BootstrapOwner,
} from '../config/bootstrap-config';
import type { Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeEmail } from './normalize-email';
import { sha256 } from './password-hash';
import { lockRegistration } from './registration-lock';

export const BOOTSTRAP_TOKEN_NAME = 'bootstrap';

const JUSTIFICATION =
  'the bootstrap owner is created before any workspace holds an account';

export type BootstrapOutcome =
  | 'owner-and-token'
  | 'owner'
  | 'token'
  | 'unchanged'
  | 'owner-missing'
  | 'owner-mismatch';

type OwnerLookup =
  | { kind: 'owner'; id: string; created: boolean }
  | { kind: 'owner-missing' }
  | { kind: 'owner-mismatch' };

const SKIPPED_WARNINGS: Record<'owner-missing' | 'owner-mismatch', string> = {
  'owner-missing':
    'BOOTSTRAP_OWNER_EMAIL names no account and this instance already has one, so no bootstrap owner or token was created',
  'owner-mismatch':
    'BOOTSTRAP_OWNER_PASSWORD does not match the account BOOTSTRAP_OWNER_EMAIL names, so no bootstrap token was stored. Set the password the account uses now',
};

@Injectable()
export class HeadlessBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(HeadlessBootstrap.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crossTenant: CrossTenantAccess,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const owner = bootstrapOwnerOf({
      BOOTSTRAP_OWNER_EMAIL: this.config.get('BOOTSTRAP_OWNER_EMAIL', {
        infer: true,
      }),
      BOOTSTRAP_OWNER_PASSWORD: this.config.get('BOOTSTRAP_OWNER_PASSWORD', {
        infer: true,
      }),
      BOOTSTRAP_API_TOKEN: this.config.get('BOOTSTRAP_API_TOKEN', {
        infer: true,
      }),
    });
    if (!owner) return;
    this.report(await this.provision(owner));
  }

  provision(owner: BootstrapOwner): Promise<BootstrapOutcome> {
    const email = normalizeEmail(owner.email);
    return this.crossTenant.becauseThisWorkIsNotOwnedByOneWorkspace(
      JUSTIFICATION,
      () =>
        this.prisma.withTransaction(async (tx) => {
          await lockRegistration(tx);
          const lookup = await this.ownerOf(tx, email, owner.password);
          if (lookup.kind !== 'owner') return lookup.kind;
          const tokenCreated =
            owner.apiToken !== null &&
            (await this.ensureToken(tx, lookup.id, owner.apiToken));
          return outcomeOf(lookup.created, tokenCreated);
        }),
    );
  }

  private report(outcome: BootstrapOutcome): void {
    if (outcome === 'owner-missing' || outcome === 'owner-mismatch') {
      this.logger.warn(SKIPPED_WARNINGS[outcome]);
      return;
    }
    if (outcome !== 'unchanged') {
      this.logger.log(`bootstrap provisioned: ${outcome}`);
    }
  }

  private async ownerOf(
    tx: Prisma.TransactionClient,
    email: string,
    password: string,
  ): Promise<OwnerLookup> {
    const existing = await tx.user.findUnique({
      where: { email },
      select: { id: true, passwordHash: true },
    });
    if (existing) {
      return (await argon2.verify(existing.passwordHash, password))
        ? { kind: 'owner', id: existing.id, created: false }
        : { kind: 'owner-mismatch' };
    }
    if ((await tx.user.count()) > 0) return { kind: 'owner-missing' };
    await tx.workspace.upsert({
      where: { id: DEFAULT_WORKSPACE_ID },
      create: { id: DEFAULT_WORKSPACE_ID, name: 'Default' },
      update: {},
    });
    const user = await tx.user.create({
      data: {
        workspaceId: DEFAULT_WORKSPACE_ID,
        email,
        passwordHash: await argon2.hash(password),
        role: 'owner',
      },
      select: { id: true },
    });
    return { kind: 'owner', id: user.id, created: true };
  }

  private async ensureToken(
    tx: Prisma.TransactionClient,
    userId: string,
    token: string,
  ): Promise<boolean> {
    const tokenHash = sha256(token);
    const existing = await tx.apiToken.findUnique({
      where: { tokenHash },
      select: { id: true },
    });
    if (existing) return false;
    await tx.apiToken.create({
      data: {
        userId,
        name: BOOTSTRAP_TOKEN_NAME,
        tokenHash,
        prefix: token.slice(0, 12),
        scope: 'write',
      },
    });
    return true;
  }
}

function outcomeOf(
  ownerCreated: boolean,
  tokenCreated: boolean,
): BootstrapOutcome {
  if (ownerCreated && tokenCreated) return 'owner-and-token';
  if (ownerCreated) return 'owner';
  if (tokenCreated) return 'token';
  return 'unchanged';
}
