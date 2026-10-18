import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const bootstrap = require('../../scripts/apply-preview-member-lab-schema.cjs');
const root = path.resolve(__dirname, '../..');
const DEMO_DIRECT = 'postgresql://postgres:fixture-secret@db.esbdrgaonplpvzmtrdhw.supabase.co:5432/postgres';
const env = {
  VERCEL: '1', VERCEL_ENV: 'preview',
  NEXT_PUBLIC_SUPABASE_URL: 'https://esbdrgaonplpvzmtrdhw.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_demo_test_key_not_secret',
  POSTGRES_PRISMA_URL: 'postgresql://postgres.esbdrgaonplpvzmtrdhw:fixture-secret@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
  POSTGRES_URL_NON_POOLING: DEMO_DIRECT,
};
const target = bootstrap.validatePreviewTarget(env);
const contract = JSON.parse(readFileSync(path.join(root, 'scripts/lib/member-lab-schema-contract.json'), 'utf8'));
const readyState = () => structuredClone(contract.schema);
const absentState = () => Object.fromEntries(bootstrap.STATE_KEYS.map((key: string) => [key, []]));

function fakeClient(states: unknown[]) {
  const query = vi.fn(); states.forEach((state) => query.mockResolvedValueOnce([{ state }]));
  const disconnect = vi.fn();
  class Client { $queryRawUnsafe = query; $disconnect = disconnect; }
  return { Client, query, disconnect };
}

describe('member lab preview schema bootstrap', () => {
  it('reuses the Vercel Preview + DEMO + direct-target guard', () => {
    expect(target.directDatabaseUrl).toBe(DEMO_DIRECT);
    for (const override of [
      { VERCEL: '0' }, { VERCEL_ENV: 'development' }, { VERCEL_ENV: 'production' },
      { POSTGRES_URL_NON_POOLING: '' },
      { NEXT_PUBLIC_SUPABASE_URL: 'https://jqddnyuszufndwwezdwp.supabase.co' },
      { POSTGRES_PRISMA_URL: 'postgresql://postgres:fixture-secret@db.jqddnyuszufndwwezdwp.supabase.co:5432/postgres' },
      { POSTGRES_URL_NON_POOLING: 'postgresql://postgres:fixture-secret@db.jqddnyuszufndwwezdwp.supabase.co:5432/postgres' },
      { POSTGRES_URL_NON_POOLING: 'postgresql://postgres.esbdrgaonplpvzmtrdhw:fixture-secret@evil.example/postgres' },
    ]) expect(() => bootstrap.validatePreviewTarget({ ...env, ...override })).toThrow();
  });

  it('checks target and fixed migration without connecting or printing a secret', () => {
    const result = spawnSync(process.execPath, ['scripts/apply-preview-member-lab-schema.cjs', '--check'], {
      cwd: root, env: { ...process.env, ...env }, encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('no database command executed');
    expect(result.stdout + result.stderr).not.toContain('fixture-secret');
    const blocked = spawnSync(process.execPath, ['scripts/apply-preview-member-lab-schema.cjs', '--check'], {
      cwd: root, env: { ...process.env, ...env, VERCEL_ENV: 'production' }, encoding: 'utf8',
    });
    expect(blocked.status).toBe(1);
    expect(blocked.stderr).toContain('BLOCKED');
    expect(blocked.stdout + blocked.stderr).not.toContain('fixture-secret');
  });

  it('runs only the fixed file, passes the direct URL outside arguments, and captures driver output', () => {
    const spawn = vi.fn(() => ({ status: 0 }));
    bootstrap.executeMigration(target, { cwd: root, spawn });
    const call = spawn.mock.calls[0] as unknown as [string, string[], { shell: boolean; stdio: string; env: Record<string, string> }];
    expect(call[1]).toEqual(['prisma', 'db', 'execute', '--file', path.join(root, 'prisma/migrations', bootstrap.MIGRATION_NAME, 'migration.sql'), '--schema', path.join(root, 'prisma/schema.prisma')]);
    expect(call[1].join(' ')).not.toContain('fixture-secret');
    expect(call[2].shell).toBe(false);
    expect(call[2].stdio).toBe('pipe');
    expect(call[2].env.POSTGRES_PRISMA_URL).toBe(DEMO_DIRECT);
    expect(call[2].env.POSTGRES_URL_NON_POOLING).toBe(DEMO_DIRECT);
    expect(() => bootstrap.executeMigration(target, { spawn: () => ({ status: 1, stderr: DEMO_DIRECT }) })).toThrow('Preview member-lab migration failed.');
  });

  it('skips the complete verified installation without applying DDL', async () => {
    const db = fakeClient([readyState()]); const execute = vi.fn();
    await expect(bootstrap.ensurePreviewSchema(target, { PrismaClient: db.Client, execute })).resolves.toEqual({ applied: false });
    expect(execute).not.toHaveBeenCalled();
    expect(db.disconnect).toHaveBeenCalledOnce();
    expect(db.query.mock.calls[0][0]).toContain('pg_get_triggerdef');
    expect(db.query.mock.calls[0][0]).toContain('p.prosrc');
  });

  it('applies once only when every target object is absent, then verifies all postconditions', async () => {
    const db = fakeClient([absentState(), readyState()]); const execute = vi.fn();
    await expect(bootstrap.ensurePreviewSchema(target, { PrismaClient: db.Client, execute })).resolves.toEqual({ applied: true });
    expect(execute).toHaveBeenCalledOnce();
    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.disconnect).toHaveBeenCalledOnce();
  });

  it.each(bootstrap.STATE_KEYS as readonly string[])('fails closed when only a %s object remains', async (key) => {
    const state = absentState(); state[key] = [readyState()[key][0]];
    const db = fakeClient([state]); const execute = vi.fn();
    await expect(bootstrap.ensurePreviewSchema(target, { PrismaClient: db.Client, execute })).rejects.toThrow('partial or mismatched');
    expect(execute).not.toHaveBeenCalled(); expect(db.disconnect).toHaveBeenCalledOnce();
  });

  const drifts: [string, (state: ReturnType<typeof readyState>) => void][] = [
    ['table missing', (s) => { s.tables.pop(); }],
    ['view in place of table', (s) => { s.tables[0].kind = 'v'; }],
    ['RLS disabled', (s) => { s.tables[0].rls = false; }],
    ['column missing', (s) => { s.columns.pop(); }],
    ['extra column', (s) => { s.columns.push({ ...s.columns[0], name: 'unexpected' }); }],
    ['column type', (s) => { s.columns[0].type = 'integer'; }],
    ['nullable identifier', (s) => { s.columns[0].notNull = false; }],
    ['different default', (s) => { s.columns[0].default = "'forged'::text"; }],
    ['invalid index', (s) => { s.indexes[0].valid = false; }],
    ['index missing', (s) => { s.indexes.pop(); }],
    ['unique constraint weakened', (s) => { s.indexes[0].unique = false; }],
    ['FK or bounds missing', (s) => { s.constraints.pop(); }],
    ['unvalidated constraint', (s) => { s.constraints[0].validated = false; }],
    ['different bounds', (s) => { s.constraints[0].definition = 'CHECK (true)'; }],
    ['broad read policy', (s) => { s.policies[0].using = 'true'; }],
    ['broad insert policy', (s) => { s.policies[1].check = 'true'; }],
    ['extra permissive policy', (s) => { s.policies.push({ ...s.policies[0], name: 'public_access', using: 'true' }); }],
    ['policy role', (s) => { s.policies[0].roles = ['anon']; }],
    ['missing helper', (s) => { s.functions.pop(); }],
    ['permissive helper body', (s) => { s.functions[0].body = 'SELECT true'; }],
    ['definer changed', (s) => { s.functions[0].definer = !s.functions[0].definer; }],
    ['unsafe search path', (s) => { s.functions[0].config = ['search_path=public, pg_temp']; }],
    ['extra function overload', (s) => { s.functions.push({ ...s.functions[0], arguments: 'actor text' }); }],
    ['trigger disabled', (s) => { s.triggers[0].enabled = 'D'; }],
    ['trigger missing', (s) => { s.triggers.pop(); }],
    ['different trigger timing', (s) => { s.triggers[0].definition = s.triggers[0].definition.replace('BEFORE', 'AFTER'); }],
    ['wrong trigger function schema', (s) => { s.triggers[0].functionSchema = 'pg_temp'; }],
  ];
  it.each(drifts)('rejects %s before mutation', async (_name, mutate) => {
    const state = readyState(); mutate(state);
    const db = fakeClient([state]); const execute = vi.fn();
    await expect(bootstrap.ensurePreviewSchema(target, { PrismaClient: db.Client, execute })).rejects.toThrow('partial or mismatched');
    expect(execute).not.toHaveBeenCalled(); expect(db.disconnect).toHaveBeenCalledOnce();
  });

  it('ignores catalog row order and SQL formatting without hiding changed string literals', () => {
    const reordered = readyState();
    for (const key of bootstrap.STATE_KEYS) reordered[key].reverse();
    reordered.functions[0].body = `\n${reordered.functions[0].body}\n`;
    expect(bootstrap.schemaReady(reordered)).toBe(true);
    expect(bootstrap.normalizeSql(" SELECT 'a  b' ")).not.toBe(bootstrap.normalizeSql("SELECT 'a b'"));
  });

  it('requires a complete catalog response and fails migration postcondition failures', async () => {
    for (const state of [null, {}, { tables: [] }, { ...absentState(), functions: null }]) {
      const db = fakeClient([state]); const execute = vi.fn();
      await expect(bootstrap.ensurePreviewSchema(target, { PrismaClient: db.Client, execute })).rejects.toThrow();
      expect(execute).not.toHaveBeenCalled(); expect(db.disconnect).toHaveBeenCalledOnce();
    }
    const db = fakeClient([absentState(), absentState()]);
    await expect(bootstrap.ensurePreviewSchema(target, { PrismaClient: db.Client, execute: vi.fn() })).rejects.toThrow('postconditions');
  });

  it('accepts a concurrent winner only after verifying the complete schema', async () => {
    const execute = vi.fn().mockRejectedValue(new Error(DEMO_DIRECT));
    const winner = fakeClient([absentState(), readyState()]);
    await expect(bootstrap.ensurePreviewSchema(target, { PrismaClient: winner.Client, execute })).resolves.toEqual({ applied: false });
    const incomplete = fakeClient([absentState(), absentState()]);
    await expect(bootstrap.ensurePreviewSchema(target, { PrismaClient: incomplete.Client, execute })).rejects.toThrow('migration failed and schema is not verified');
    expect(incomplete.disconnect).toHaveBeenCalledOnce();
  });

  it('requires the reviewed migration hash before opening a connection', async () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'wap-lab-schema-test-'));
    try {
      const directory = path.join(cwd, 'prisma/migrations', bootstrap.MIGRATION_NAME);
      mkdirSync(directory, { recursive: true });
      writeFileSync(path.join(directory, 'migration.sql'), 'CREATE TABLE unrelated(id text);');
      const Client = vi.fn(); const execute = vi.fn();
      await expect(bootstrap.ensurePreviewSchema(target, { cwd, PrismaClient: Client, execute })).rejects.toThrow('contract differ');
      expect(Client).not.toHaveBeenCalled(); expect(execute).not.toHaveBeenCalled();
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });

  it('follows workspace setup only in preview and preserves the migration transaction/advisory lock', () => {
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(pkg.scripts['build:preview']).toContain(
      'apply-preview-training-workspace-schema.cjs && node scripts/apply-preview-member-lab-schema.cjs && node scripts/apply-preview-assessment-attempts-schema.cjs && next build',
    );
    expect(pkg.scripts['build:preview']).not.toContain('preview-e2e-member');
    expect(pkg.scripts['build:preview']).not.toContain('apply-preview-e2e-member');
    expect(pkg.scripts['build:with-migrate']).not.toContain('apply-preview-member-lab-schema');
    const sql = readFileSync(path.join(root, 'prisma/migrations', bootstrap.MIGRATION_NAME, 'migration.sql'), 'utf8');
    expect(sql).toContain('BEGIN;'); expect(sql).toContain('pg_advisory_xact_lock'); expect(sql.trimEnd()).toMatch(/COMMIT;$/);
    expect(bootstrap.loadContract()).toEqual(contract.schema);
    expect(contract.schema.functions).toHaveLength(3);
    expect(contract.schema.triggers).toHaveLength(2);
  });
});
