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
    const applied: string[] = [];
    const prisma = fullProtectionPrisma({ applied });
    const result = await preview.ensurePreviewSchema(
      { directDatabaseUrl: DEMO_DIRECT },
      {
        PrismaClient: class {
          constructor() {
            return prisma;
          }
        },
      },
    );
    expect(result).toEqual({ applied: false });
    expect(applied).toEqual([]);
  });

  it('fails loudly when post-check finds missing constraint or trigger', async () => {
    const prisma = partialProtectionPrisma({
      columns: new Set(preview.REQUIRED_COLUMNS),
      constraint: false,
      trigger: false,
      function: true,
    });
    await expect(preview.assertAssessmentAttemptProtections(prisma)).rejects.toThrow(
      /incomplete.*constraint|trigger/i,
    );
  });

  it('recovers from an interrupted partial apply on the next run', async () => {
    const state: ProtectionState = {
      columns: new Set<string>(preview.REQUIRED_COLUMNS),
      constraint: false,
      trigger: false,
      function: false,
    };
    const applied: string[] = [];
    type PrismaMock = {
      $queryRawUnsafe: (sql: string) => Promise<unknown>;
      $executeRawUnsafe: (sql: string) => Promise<void>;
      $transaction: (fn: (tx: PrismaMock) => Promise<void>) => Promise<void>;
      $disconnect: () => Promise<void>;
    };
    const prisma: PrismaMock = {
      $queryRawUnsafe: async (sql: string) => queryProtectionState(sql, state),
      $executeRawUnsafe: async (sql: string) => {
        applied.push(sql);
        if (sql.includes('ADD CONSTRAINT')) state.constraint = true;
        if (sql.includes('CREATE OR REPLACE FUNCTION')) state.function = true;
        if (sql.includes('CREATE TRIGGER')) state.trigger = true;
      },
      $transaction: async (fn) => fn(prisma),
      $disconnect: async () => {},
    };
    const result = await preview.ensurePreviewSchema(
      { directDatabaseUrl: DEMO_DIRECT },
      {
        PrismaClient: class {
          constructor() {
            return prisma;
          }
        },
      },
    );
    expect(result.applied).toBe(true);
    expect(preview.protectionsReady(state)).toBe(true);
    expect(applied.length).toBeGreaterThan(0);
  });

  it('fails loudly when an apply is interrupted before protections exist', async () => {
    const state: ProtectionState = {
      columns: new Set<string>(),
      constraint: false,
      trigger: false,
      function: false,
    };
    type PrismaMock = {
      $queryRawUnsafe: (sql: string) => Promise<unknown>;
      $executeRawUnsafe: (sql: string) => Promise<void>;
      $transaction: (fn: (tx: PrismaMock) => Promise<void>) => Promise<void>;
      $disconnect: () => Promise<void>;
    };
    const prisma: PrismaMock = {
      $queryRawUnsafe: async (sql: string) => queryProtectionState(sql, state),
      $executeRawUnsafe: async () => {
        throw new Error('connection reset');
      },
      $transaction: async (fn) => fn(prisma),
      $disconnect: async () => {},
    };
    await expect(
      preview.ensurePreviewSchema(
        { directDatabaseUrl: DEMO_DIRECT },
        {
          PrismaClient: class {
            constructor() {
              return prisma;
            }
          },
        },
      ),
    ).rejects.toThrow(/connection reset/);
    expect(preview.protectionsReady(state)).toBe(false);
  });
});

type ProtectionState = {
  columns: Set<string>;
  constraint: boolean;
  trigger: boolean;
  function: boolean;
};

function fullProtectionPrisma({ applied }: { applied: string[] }) {
  const state: ProtectionState = {
    columns: new Set<string>(preview.REQUIRED_COLUMNS),
    constraint: true,
    trigger: true,
    function: true,
  };
  return {
    $queryRawUnsafe: async (sql: string) => queryProtectionState(sql, state),
    $executeRawUnsafe: async (sql: string) => {
      applied.push(sql);
    },
    $disconnect: async () => {},
  };
}

function partialProtectionPrisma(state: ProtectionState) {
  return {
    $queryRawUnsafe: async (sql: string) => queryProtectionState(sql, state),
  };
}

function queryProtectionState(sql: string, state: ProtectionState) {
  if (sql.includes('column_name')) {
    return [...state.columns].map((column_name) => ({ column_name, ...(column_name === 'assessment_attempt_count' ? { data_type: 'integer', is_nullable: 'NO', column_default: '0' } : column_name === 'assessment_history' ? { data_type: 'jsonb', is_nullable: 'NO', column_default: "'[]'::jsonb" } : { data_type: 'timestamp without time zone', is_nullable: 'YES', column_default: null }) }));
  }
  if (sql.includes('pg_constraint')) {
    return state.constraint ? [{ conname: preview.REQUIRED_CONSTRAINT }] : [];
  }
  if (sql.includes('pg_trigger')) {
    return state.trigger ? [{ tgname: preview.REQUIRED_TRIGGER }] : [];
  }
  if (sql.includes('pg_proc')) {
    return state.function ? [{ proname: preview.REQUIRED_FUNCTION }] : [];
  }
  return [];
}


it('rejects named columns with an incompatible type or missing default', () => {
  expect(preview.columnDefinitionReady({ column_name: 'assessment_attempt_count', data_type: 'text', is_nullable: 'NO', column_default: '0' })).toBe(false);
  expect(preview.columnDefinitionReady({ column_name: 'assessment_history', data_type: 'jsonb', is_nullable: 'YES', column_default: null })).toBe(false);
});
