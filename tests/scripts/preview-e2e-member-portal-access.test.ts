import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const guard = require('../../scripts/lib/supabase-project-guard.cjs');
const preview = require('../../scripts/apply-preview-e2e-member-portal-access.cjs');
const training = require('../../scripts/apply-preview-training-workspace-schema.cjs');

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

describe('preview E2E member portal-access bootstrap', () => {
  it('allows only Vercel Preview on DEMO', () => {
    expect(() => training.validatePreviewTarget(vercelEnv('preview', 'demo'))).not.toThrow();
    expect(() => training.validatePreviewTarget(vercelEnv('preview', 'prod'))).toThrow(
      /wrong Supabase project/,
    );
    expect(() => training.validatePreviewTarget(vercelEnv('production', 'demo'))).toThrow();
  });

  it('marks assessment complete only when the fixture member is incomplete', async () => {
    const updates: unknown[] = [];
    const prisma = {
      organization: {
        findFirst: async () => ({ id: 'org-1' }),
      },
      user: {
        findFirst: async () => ({
          id: 'user-1',
          assessmentCompleted: false,
          assessmentCompletedAt: null,
        }),
        update: async (args: unknown) => {
          updates.push(args);
        },
      },
    };
    const first = await preview.ensureE2eMemberPortalAccess(prisma);
    expect(first.updated).toBe(true);
    expect(updates).toHaveLength(1);

    const prismaDone = {
      organization: { findFirst: async () => ({ id: 'org-1' }) },
      user: {
        findFirst: async () => ({
          id: 'user-1',
          assessmentCompleted: true,
          assessmentCompletedAt: new Date('2026-01-01'),
        }),
        update: async () => {
          throw new Error('should not update');
        },
      },
    };
    const second = await preview.ensureE2eMemberPortalAccess(prismaDone);
    expect(second.updated).toBe(false);
    expect(second.reason).toBe('already complete');
  });
});
