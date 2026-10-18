import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateDemoFixtureDatabase } from '../../scripts/lib/demo-fixture-database.mjs';

const require = createRequire(import.meta.url);
const guard = require('../../scripts/lib/supabase-project-guard.cjs');
const fixture = require('../../scripts/lib/preview-e2e-member-fixture.cjs');

const DEMO_PUBLIC = 'https://esbdrgaonplpvzmtrdhw.supabase.co';
const DEMO_DIRECT =
  'postgresql://postgres:demo-secret@db.esbdrgaonplpvzmtrdhw.supabase.co:5432/postgres';
const PROD_PUBLIC = 'https://jqddnyuszufndwwezdwp.supabase.co';
const PROD_DIRECT =
  'postgresql://postgres:prod-secret@db.jqddnyuszufndwwezdwp.supabase.co:5432/postgres';

function supabaseAnonJwt(ref: string) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: 'supabase', ref, role: 'anon' })).toString(
    'base64url',
  );
  return `${header}.${payload}.test-signature`;
}

describe('preview E2E member fixture (DEMO only, not build:preview)', () => {
  it('allows fixture database access only on DEMO direct URLs', () => {
    expect(() =>
      validateDemoFixtureDatabase({
        NEXT_PUBLIC_SUPABASE_URL: DEMO_PUBLIC,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonJwt(guard.DEMO_REF),
        POSTGRES_URL_NON_POOLING: DEMO_DIRECT,
      } as unknown as NodeJS.ProcessEnv),
    ).not.toThrow();
    expect(() =>
      validateDemoFixtureDatabase({
        NEXT_PUBLIC_SUPABASE_URL: PROD_PUBLIC,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonJwt(guard.PROD_REF),
        POSTGRES_URL_NON_POOLING: PROD_DIRECT,
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/DEMO|wrong Supabase project/i);
  });

  it('prepares and restores preassessment state for the portal-qa test member', async () => {
    let stored: {
      assessmentCompleted: boolean;
      assessmentCompletedAt: Date | null;
    } = {
      assessmentCompleted: false,
      assessmentCompletedAt: null,
    };
    const lockCalls: string[] = [];
    const prisma = {
      $executeRawUnsafe: async (sql: string) => {
        lockCalls.push(sql);
      },
      organization: {
        findFirst: async () => ({ id: 'org-qa' }),
      },
      user: {
        findFirst: async () => ({
          id: 'user-fixture',
          assessmentCompleted: stored.assessmentCompleted,
          assessmentCompletedAt: stored.assessmentCompletedAt,
        }),
        findUnique: async () => ({
          assessmentCompleted: stored.assessmentCompleted,
          assessmentCompletedAt: stored.assessmentCompletedAt,
        }),
        update: async ({
          data,
        }: {
          data: { assessmentCompleted: boolean; assessmentCompletedAt: Date | null };
        }) => {
          stored = {
            assessmentCompleted: data.assessmentCompleted,
            assessmentCompletedAt: data.assessmentCompletedAt,
          };
        },
      },
    };

    const prepared = await fixture.prepareMemberForSignedInRoutes(prisma);
    expect(prepared.applied).toBe(true);
    expect(stored.assessmentCompleted).toBe(true);
    expect(lockCalls.some((sql) => sql.includes('pg_advisory_lock'))).toBe(true);

    await fixture.restoreMemberSnapshot(prisma, prepared);
    expect(stored.assessmentCompleted).toBe(false);
    expect(stored.assessmentCompletedAt).toBeNull();
    await fixture.verifyRestored(prisma, prepared);
  });

  it('does not mutate when the fixture member is already assessment-complete', async () => {
    let updates = 0;
    const prisma = {
      $executeRawUnsafe: async () => {},
      organization: { findFirst: async () => ({ id: 'org-qa' }) },
      user: {
        findFirst: async () => ({
          id: 'user-fixture',
          assessmentCompleted: true,
          assessmentCompletedAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
        update: async () => {
          updates += 1;
        },
      },
    };
    const prepared = await fixture.prepareMemberForSignedInRoutes(prisma);
    expect(prepared.applied).toBe(false);
    expect(updates).toBe(0);
  });

  it('clears a leftover completion mark without ungating a member who is already incomplete', async () => {
    let stored: {
      assessmentCompleted: boolean;
      assessmentCompletedAt: Date | null;
    } = {
      assessmentCompleted: true,
      assessmentCompletedAt: new Date('2026-02-02T00:00:00.000Z'),
    };
    const prisma = {
      $executeRawUnsafe: async () => {},
      organization: { findFirst: async () => ({ id: 'org-qa' }) },
      user: {
        findFirst: async () => ({
          id: 'user-fixture',
          assessmentCompleted: stored.assessmentCompleted,
          assessmentCompletedAt: stored.assessmentCompletedAt,
        }),
        update: async ({
          data,
        }: {
          data: { assessmentCompleted: boolean; assessmentCompletedAt: Date | null };
        }) => {
          stored = {
            assessmentCompleted: data.assessmentCompleted,
            assessmentCompletedAt: data.assessmentCompletedAt,
          };
        },
      },
    };
    const cleared = await fixture.ensureIncompleteBaseline(prisma);
    expect(cleared.changed).toBe(true);
    expect(stored.assessmentCompleted).toBe(false);
    expect(stored.assessmentCompletedAt).toBeNull();

    const again = await fixture.ensureIncompleteBaseline(prisma);
    expect(again.changed).toBe(false);
  });

  it('keeps member fixture writes out of build:preview', () => {
    const pkg = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['build:preview']).not.toContain('member-test@workforceap.org');
    expect(pkg.scripts['build:preview']).not.toContain('preview-e2e-member');
    expect(pkg.scripts['build:preview']).not.toContain('apply-preview-e2e-member');
  });
});
