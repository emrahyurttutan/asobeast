import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
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
import { registerInBackground } from '../jobs/schedule-registration';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeEmail } from './normalize-email';
import { sha256 } from './password-hash';
import { lockRegistration } from './registration-lock';

export const BOOTSTRAP_TOKEN_NAME = 'bootstrap';

const JUSTIFICATION =
  'the bootstrap owner is created before any workspace holds an account';

export type BootstrapOutcome =
  'owner-and-token' | 'owner' | 'token' | 'unchanged' | 'owner-missing';

interface OwnerRow {
  id: string;
  created: boolean;
}

@Injectable()
export class HeadlessBootstrap
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(HeadlessBootstrap.name);
  private readonly lifecycle: { closing: Promise<void> | undefined } = {
    closing: undefined,
  };
  private provisioning: Promise<void> = Promise.resolve();

  constructor(
    private readonly prisma: PrismaService,
    private readonly crossTenant: CrossTenantAccess,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onApplicationBootstrap(): void {
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
    this.provisioning = registerInBackground(
      this.lifecycle,
      () => this.provisionAndReport(owner),
      (error) =>
        this.logger.error(
          `could not provision the bootstrap owner, trying again: ${error.message}`,
        ),
    );
  }

  onModuleDestroy(): void {
    this.lifecycle.closing = Promise.resolve();
  }

  completed(): Promise<void> {
    return this.provisioning;
  }

  async provision(owner: BootstrapOwner): Promise<BootstrapOutcome> {
    const email = normalizeEmail(owner.email);
    const passwordHash = await argon2.hash(owner.password);
    return this.crossTenant.becauseThisWorkIsNotOwnedByOneWorkspace(
      JUSTIFICATION,
      () =>
        this.prisma.withTransaction(async (tx) => {
          await lockRegistration(tx);
          const row = await this.ownerOf(tx, email, passwordHash);
          if (!row) return 'owner-missing';
          const tokenCreated =
            owner.apiToken !== null &&
            (await this.ensureToken(tx, row.id, owner.apiToken));
          return outcomeOf(row.created, tokenCreated);
        }),
    );
  }

  private async provisionAndReport(owner: BootstrapOwner): Promise<void> {
    const outcome = await this.provision(owner);
    if (outcome === 'owner-missing') {
      this.logger.warn(
        'BOOTSTRAP_OWNER_EMAIL names no account and this instance already has one, so no bootstrap owner or token was created',
      );
      return;
    }
    if (outcome !== 'unchanged') {
      this.logger.log(`bootstrap provisioned: ${outcome}`);
    }
  }

  private async ownerOf(
    tx: Prisma.TransactionClient,
    email: string,
    passwordHash: string,
  ): Promise<OwnerRow | null> {
    const existing = await tx.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) return { id: existing.id, created: false };
    if ((await tx.user.count()) > 0) return null;
    await tx.workspace.upsert({
      where: { id: DEFAULT_WORKSPACE_ID },
      create: { id: DEFAULT_WORKSPACE_ID, name: 'Default' },
      update: {},
    });
    const user = await tx.user.create({
      data: {
        workspaceId: DEFAULT_WORKSPACE_ID,
        email,
        passwordHash,
        role: 'owner',
      },
      select: { id: true },
    });
    return { id: user.id, created: true };
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
