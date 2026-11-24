import {
  API_TOKEN_PREFIX,
  isPasswordAllowed,
  PASSWORD_RULE,
} from '@asobeast/shared';
import type { Env } from './env';

export const BOOTSTRAP_TOKEN_MIN_SECRET = 32;

const BOOTSTRAP_TOKEN_SECRET = /^[A-Za-z0-9]+$/;

const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type BootstrapVariables = Pick<
  Env,
  'BOOTSTRAP_OWNER_EMAIL' | 'BOOTSTRAP_OWNER_PASSWORD' | 'BOOTSTRAP_API_TOKEN'
>;

type BootstrapKeys = BootstrapVariables & Pick<Env, 'BILLING_ENABLED'>;

export interface BootstrapOwner {
  email: string;
  password: string;
  apiToken: string | null;
}

export function bootstrapOwnerOf(
  env: BootstrapVariables,
): BootstrapOwner | null {
  if (!env.BOOTSTRAP_OWNER_EMAIL || !env.BOOTSTRAP_OWNER_PASSWORD) return null;
  return {
    email: env.BOOTSTRAP_OWNER_EMAIL,
    password: env.BOOTSTRAP_OWNER_PASSWORD,
    apiToken: env.BOOTSTRAP_API_TOKEN ?? null,
  };
}

export function isBootstrapToken(value: string): boolean {
  if (!value.startsWith(API_TOKEN_PREFIX)) return false;
  const secret = value.slice(API_TOKEN_PREFIX.length);
  return (
    secret.length >= BOOTSTRAP_TOKEN_MIN_SECRET &&
    BOOTSTRAP_TOKEN_SECRET.test(secret)
  );
}

export function assertBootstrapConfiguration(env: BootstrapKeys): void {
  const email = env.BOOTSTRAP_OWNER_EMAIL;
  const password = env.BOOTSTRAP_OWNER_PASSWORD;
  const token = env.BOOTSTRAP_API_TOKEN;
  if (!email && !password && !token) return;
  if (env.BILLING_ENABLED) {
    throw new Error(
      'BOOTSTRAP_ variables are for a self hosted instance and cannot be used with BILLING_ENABLED=true. Remove every BOOTSTRAP_ variable, or turn billing off.',
    );
  }
  if (!email || !password) {
    throw new Error(
      'BOOTSTRAP_OWNER_EMAIL and BOOTSTRAP_OWNER_PASSWORD are set together. Set both, or remove every BOOTSTRAP_ variable.',
    );
  }
  if (!ADDRESS.test(email)) {
    throw new Error('BOOTSTRAP_OWNER_EMAIL is not an email address.');
  }
  if (!isPasswordAllowed(password)) {
    throw new Error(
      `BOOTSTRAP_OWNER_PASSWORD does not meet the registration rule. ${PASSWORD_RULE}`,
    );
  }
  if (token !== undefined && !isBootstrapToken(token)) {
    throw new Error(
      `BOOTSTRAP_API_TOKEN must be ${API_TOKEN_PREFIX} followed by at least ${BOOTSTRAP_TOKEN_MIN_SECRET} letters or digits. Generate one with: echo ${API_TOKEN_PREFIX}$(openssl rand -hex 24)`,
    );
  }
}
