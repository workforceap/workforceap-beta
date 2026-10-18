/**
 * DEMO-only database access for signed-in Preview fixture setup.
 * The signed-in job is GitHub Actions, not a Vercel build, so this checks the
 * connection URL itself and never requires VERCEL_ENV.
 */
import guard from './supabase-project-guard.cjs';

const { DEMO_REF, PROD_REF } = guard;

export { DEMO_REF, PROD_REF };

function candidateUrls(env = process.env) {
  return [env.POSTGRES_URL_NON_POOLING, env.POSTGRES_PRISMA_URL, env.DATABASE_URL]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);
}

export function resolveDemoFixtureDatabaseUrl(env = process.env) {
  const urls = candidateUrls(env);
  const demo = urls.find((value) => guard.projectForUrl(value) === 'demo');
  return demo || urls[0] || '';
}

function hostOf(value) {
  try {
    return new URL(value).hostname;
  } catch {
    return 'unparsed';
  }
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
  if (classification !== 'demo') {
    const refused = candidateUrls(env)
      .map((value) => `${hostOf(value)}=${guard.projectForUrl(value)}`)
      .join(', ');
    throw new Error(
      `Fixture setup is allowed only on the DEMO Supabase project (${DEMO_REF}). Refused ${refused || `host ${hostOf(directDatabaseUrl)} classified as ${classification}`}.`,
    );
  }
  return { directDatabaseUrl, expected: 'demo' };
}
