import { PASSWORD_RULE } from '@asobeast/shared';
import {
  assertBootstrapConfiguration,
  bootstrapOwnerOf,
  isBootstrapToken,
} from './bootstrap-config';

const TOKEN = `asob_${'0f'.repeat(24)}`;

const complete = {
  BOOTSTRAP_OWNER_EMAIL: 'engine@example.com',
  BOOTSTRAP_OWNER_PASSWORD: 'engine-owner-secret',
  BOOTSTRAP_API_TOKEN: TOKEN,
  BILLING_ENABLED: false,
};

describe('assertBootstrapConfiguration', () => {
  it('accepts an instance without any bootstrap variable', () => {
    expect(() =>
      assertBootstrapConfiguration({
        BOOTSTRAP_OWNER_EMAIL: undefined,
        BOOTSTRAP_OWNER_PASSWORD: undefined,
        BOOTSTRAP_API_TOKEN: undefined,
        BILLING_ENABLED: true,
      }),
    ).not.toThrow();
  });

  it('accepts an owner with a token', () => {
    expect(() => assertBootstrapConfiguration(complete)).not.toThrow();
  });

  it('accepts an owner without a token', () => {
    expect(() =>
      assertBootstrapConfiguration({
        ...complete,
        BOOTSTRAP_API_TOKEN: undefined,
      }),
    ).not.toThrow();
  });

  it('refuses to boot with billing on', () => {
    expect(() =>
      assertBootstrapConfiguration({ ...complete, BILLING_ENABLED: true }),
    ).toThrow('BILLING_ENABLED=true');
  });

  it.each([
    [
      'a token alone',
      { BOOTSTRAP_OWNER_EMAIL: undefined, BOOTSTRAP_OWNER_PASSWORD: undefined },
    ],
    ['an email without a password', { BOOTSTRAP_OWNER_PASSWORD: undefined }],
    ['a password without an email', { BOOTSTRAP_OWNER_EMAIL: undefined }],
  ])('refuses to boot with %s', (_case, missing) => {
    expect(() =>
      assertBootstrapConfiguration({ ...complete, ...missing }),
    ).toThrow('set together');
  });

  it('refuses an address that is not one', () => {
    expect(() =>
      assertBootstrapConfiguration({
        ...complete,
        BOOTSTRAP_OWNER_EMAIL: 'engine',
      }),
    ).toThrow('not an email address');
  });

  it('refuses a password registration would refuse', () => {
    expect(() =>
      assertBootstrapConfiguration({
        ...complete,
        BOOTSTRAP_OWNER_PASSWORD: 'short',
      }),
    ).toThrow(PASSWORD_RULE);
  });

  it('refuses a malformed token without echoing it', () => {
    const run = () =>
      assertBootstrapConfiguration({
        ...complete,
        BOOTSTRAP_API_TOKEN: 'asob_tooshort',
      });
    expect(run).toThrow('at least 32 letters or digits');
    expect(run).not.toThrow('tooshort');
  });
});

describe('isBootstrapToken', () => {
  it.each([
    [TOKEN, true],
    [`asob_${'A'.repeat(32)}`, true],
    [`asob_${'A'.repeat(31)}`, false],
    [`asob_${'a'.repeat(31)}-`, false],
    [`ASOB_${'a'.repeat(40)}`, false],
    ['a'.repeat(40), false],
  ])('judges %s as %s', (value, expected) => {
    expect(isBootstrapToken(value)).toBe(expected);
  });
});

describe('bootstrapOwnerOf', () => {
  it('answers nothing until both the email and the password are set', () => {
    expect(
      bootstrapOwnerOf({ ...complete, BOOTSTRAP_OWNER_PASSWORD: undefined }),
    ).toBeNull();
  });

  it('answers the owner with its token', () => {
    expect(bootstrapOwnerOf(complete)).toEqual({
      email: 'engine@example.com',
      password: 'engine-owner-secret',
      apiToken: TOKEN,
    });
  });

  it('answers a null token when none is configured', () => {
    expect(
      bootstrapOwnerOf({ ...complete, BOOTSTRAP_API_TOKEN: undefined })
        ?.apiToken,
    ).toBeNull();
  });
});
