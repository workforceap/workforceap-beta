import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const guard = require('../../scripts/lib/supabase-project-guard.cjs');
const preview = require('../../scripts/apply-preview-assessment-attempts-schema.cjs');

const DEMO_PUBLIC = 'https://esbdrgaonplpvzmtrdhw.supabase.co';
const DEMO_POOLER =
  'postgresql://postgres.esbdrgaonplpvzmtrdhw:demo-secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres';
const DEMO_DIRECT =
  'postgresql://postgres:demo-secret@db.esbdrgaonplpvzmtrdhw.supabase.co:5432/postgres';
const PROD_PUBLIC = 'https://jqddnyuszufndwwezdwp.supabase.co';
const PROD_POOLER =
  'postgresql://postgres.jqddnyuszufndwwezdwp:prod-secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres';
const PROD_DIRECT =
  'postgresql://postgres:prod-secret@db.jqddnyuszufndwwezdwp.supabase.co:5432/postgres';

function supabaseAnonJwt(ref: string) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: 'supabase', ref, role: 'anon' })).toString(
    'base64url',
  );
  return `${header}.${payload}.test-signature`;
}

function vercelEnv(scope: 'preview' | 'production', project: 'demo' | 'prod') {
  const isDemo = project === 'demo';
  return {
    VERCEL: '1',
    VERCEL_ENV: scope,
    NEXT_PUBLIC_SUPABASE_URL: isDemo ? DEMO_PUBLIC : PROD_PUBLIC,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonJwt(isDemo ? guard.DEMO_REF : guard.PROD_REF),
    POSTGRES_PRISMA_URL: isDemo ? DEMO_POOLER : PROD_POOLER,
    POSTGRES_URL_NON_POOLING: isDemo ? DEMO_DIRECT : PROD_DIRECT,
    DATABASE_URL: '',
  };
}

describe('preview assessment-attempts schema bootstrap', () => {
  it('allows only Vercel Preview on DEMO', () => {
    expect(() => preview.validatePreviewTarget(vercelEnv('preview', 'demo'))).not.toThrow();
    expect(() => preview.validatePreviewTarget(vercelEnv('preview', 'prod'))).toThrow(
      /wrong Supabase project/,
    );
    expect(() => preview.validatePreviewTarget(vercelEnv('production', 'demo'))).toThrow();
  });

  it('treats the three Prisma-selected columns as ready only when all exist', () => {
    expect(preview.columnsReady(new Set())).toBe(false);
    expect(preview.columnsReady(new Set(['assessment_attempt_count']))).toBe(false);
    expect(
      preview.columnsReady(
        new Set([
          'assessment_attempt_count',
          'assessment_retake_requested_at',
          'assessment_history',
        ]),
      ),
    ).toBe(true);
  });

  it('does not apply when the columns are already present', async () => {
    const applied = [];
    const prisma = {
      $queryRawUnsafe: async () =>
        preview.REQUIRED_COLUMNS.map((column_name: string) => ({ column_name })),
      $executeRawUnsafe: async (sql: string) => {
        applied.push(sql);
      },
      $disconnect: async () => {},
    };
    const result = await preview.ensurePreviewSchema(
      { directDatabaseUrl: DEMO_DIRECT },
      { PrismaClient: class {
        constructor() {
          return prisma;
        }
      } },
    );
    expect(result).toEqual({ applied: false });
    expect(applied).toEqual([]);
  });
});
