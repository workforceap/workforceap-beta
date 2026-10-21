import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepare, ensureIncomplete, restore } from '../../scripts/portal-c-member-fixture-call.mjs';

const original = { userId: 'synthetic-member', before: { assessmentCompleted: true, assessmentCompletedAt: '2026-01-01T00:00:00.000Z' } };
let directory: string;
let path: string;
let actions: string[];

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'portal-c-recovery-'));
  path = join(directory, 'original.json');
  actions = [];
  vi.stubEnv('PORTAL_C_E2E_FIXTURE_SNAPSHOT', path);
  vi.stubEnv('PLAYWRIGHT_BASE_URL', 'https://synthetic.vercel.app');
  vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_URL', 'https://oidc.invalid/token');
  vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'synthetic-request-token');
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).startsWith('https://oidc.invalid')) return Response.json({ value: 'synthetic-oidc' });
    const { action, snapshot } = JSON.parse(String(init?.body));
    actions.push(action);
    if (action === 'snapshot') return Response.json({ snapshot: original });
    // Every write must already have a durable recovery record.
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(original);
    if (action === 'restore') expect(snapshot).toEqual(original);
    return Response.json({ ok: true, snapshot: { ...original, applied: true } });
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

describe('fixture recovery record', () => {
  it('writes the original state before a standalone prepare and sends it back to restore', async () => {
    await prepare();
    await restore();
    expect(actions).toEqual(['snapshot', 'prepare', 'restore']);
  });
  it('retains the original state across gate reset and prepare', async () => {
    await ensureIncomplete();
    await prepare();
    await restore();
    expect(actions).toEqual(['snapshot', 'ensure-incomplete', 'prepare', 'restore']);
  });
  it('fails on a corrupt recovery record without issuing a restore request', async () => {
    writeFileSync(path, 'corrupt');
    await expect(restore()).rejects.toThrow();
    expect(actions).toEqual([]);
  });
});
