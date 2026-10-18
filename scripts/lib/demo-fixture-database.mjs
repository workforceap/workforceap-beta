/**
 * DEMO-only database access for signed-in Preview fixture setup.
 * The signed-in job is GitHub Actions, not a Vercel build, so this checks the
 * connection URL itself and never requires VERCEL_ENV.
 */
import guard from './supabase-project-guard.cjs';

const { DEMO_REF, PROD_REF } = guard;

export { DEMO_REF, PROD_REF };

export function resolveDemoFixtureDatabaseUrl(env = process.env) {
  return (
    env.POSTGRES_URL_NON_POOLING?.trim() ||
    env.POSTGRES_PRISMA_URL?.trim() ||
    env.DATABASE_URL?.trim() ||
    ''
  );
}

/** @returns {{ directDatabaseUrl: string, expected: 'demo' }} */
export function validateDemoFixtureDatabase(env = process.env) {
  const directDatabaseUrl = resolveDemoFixtureDatabaseUrl(env);
  if (!directDatabaseUrl) {
    throw new Error(
      'POSTGRES_URL_NON_POOLING or POSTGRES_PRISMA_URL is required for DEMO fixture setup.',
    );
  }
  const classification = guard.projectForUrl(directDatabaseUrl);
  let host = 'unparsed';
  try {
    host = new URL(directDatabaseUrl).hostname;
  } catch {
    host = 'unparsed';
  }
  if (classification !== 'demo') {
    throw new Error(
      `Fixture setup is allowed only on the DEMO Supabase project (${DEMO_REF}). Refused host ${host} classified as ${classification}.`,
    );
  }
  return { directDatabaseUrl, expected: 'demo' };
}
