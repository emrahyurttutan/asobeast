export const BOOTSTRAP_EMAIL = 'Engine@Example.com';
export const BOOTSTRAP_PASSWORD = 'engine-owner-secret';
export const BOOTSTRAP_TOKEN = `asob_${'a1b2c3d4'.repeat(6)}`;

process.env.BOOTSTRAP_OWNER_EMAIL = BOOTSTRAP_EMAIL;
process.env.BOOTSTRAP_OWNER_PASSWORD = BOOTSTRAP_PASSWORD;
process.env.BOOTSTRAP_API_TOKEN = BOOTSTRAP_TOKEN;

export function clearBootstrapEnv(): void {
  delete process.env.BOOTSTRAP_OWNER_EMAIL;
  delete process.env.BOOTSTRAP_OWNER_PASSWORD;
  delete process.env.BOOTSTRAP_API_TOKEN;
}
