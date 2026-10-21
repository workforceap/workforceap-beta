import 'server-only';
import { PrismaClient } from '@prisma/client';
import guard from '@/scripts/lib/supabase-project-guard.cjs';

const cache = globalThis as typeof globalThis & { portalCFixtureDatabase?: PrismaClient };

/** Dedicated DEMO session connection: the app's Preview client flattens transactions. */
export function getPortalCFixtureDatabase(env: NodeJS.ProcessEnv = process.env) {
  const url = env.POSTGRES_URL_NON_POOLING ?? '';
  if (env.VERCEL_ENV !== 'preview' || guard.projectForUrl(url) !== 'demo' || new URL(url).port === '6543') {
    throw new Error('Fixture transactions require a DEMO direct/session database URL on Preview.');
  }
  return cache.portalCFixtureDatabase ??= new PrismaClient({ datasources: { db: { url } } });
}
