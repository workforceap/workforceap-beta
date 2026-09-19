import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  flags: new Map<string, { key: string; enabled: boolean }>(),
  legacy: [] as Array<{ workflow: string; method: string; metadata: { enabled?: unknown }; createdAt: Date }>,
  findFlags: vi.fn(), importFlags: vi.fn(), upsert: vi.fn(), legacyRead: vi.fn(),
  diagnosticCreate: vi.fn(), diagnosticCreateMany: vi.fn(), diagnosticsRead: vi.fn(),
  getUser: vi.fn(), requireAdmin: vi.fn(), getOrg: vi.fn(),
}));
vi.mock('@/lib/db/prisma', () => {
  const db = {
    featureFlag: { findMany: h.findFlags, createMany: h.importFlags, upsert: h.upsert },
    workflowDiagnostic: { findFirst: h.legacyRead, create: h.diagnosticCreate, createMany: h.diagnosticCreateMany, findMany: h.diagnosticsRead },
    $transaction: (fn: (tx: unknown) => unknown) => fn(db),
  };
  return { prisma: db };
});
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (fn: unknown) => fn }));
vi.mock('@/lib/auth/server', () => ({ getUser: h.getUser }));
vi.mock('@/lib/auth/roles', () => ({ requireAdmin: h.requireAdmin, isSuperAdmin: async () => false }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: h.getOrg }));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn() }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(), auditRequestMeta: () => ({}) }));
vi.mock('@/lib/admin/cronRegistry', () => ({ CRON_REGISTRY: [{ id: 'alpha', workflowKey: 'cron_alpha' }, { id: 'beta', workflowKey: 'cron_beta' }] }));

import { isCronEnabled, loadCronEnabledStates, cronSettingKey } from '@/lib/cron/isCronEnabled';
import { POST as toggle } from '@/app/api/admin/email-crons/[id]/toggle/route';
import { POST as activateAll } from '@/app/api/admin/email-crons/activate-all/route';
import { GET as list } from '@/app/api/admin/email-crons/route';

beforeEach(() => {
  vi.clearAllMocks();
  h.flags.clear(); h.legacy.length = 0;
  h.getUser.mockResolvedValue({ id: 'admin' }); h.requireAdmin.mockResolvedValue(undefined); h.getOrg.mockResolvedValue('org-1');
  h.findFlags.mockImplementation(async ({ where }: { where: { key: { in: string[] } } }) => where.key.in.flatMap(k => h.flags.has(k) ? [h.flags.get(k)!] : []));
  h.importFlags.mockImplementation(async ({ data }: { data: Array<{ key: string; enabled: boolean }> }) => { for (const f of data) if (!h.flags.has(f.key)) h.flags.set(f.key, f); });
  h.upsert.mockImplementation(async ({ where, create, update }: { where: { key: string }; create: { key: string; enabled: boolean }; update: { enabled: boolean } }) => {
    h.flags.set(where.key, h.flags.has(where.key) ? { key: where.key, enabled: update.enabled } : create);
  });
  h.legacyRead.mockImplementation(async ({ where }: { where: { workflow: string } }) => h.legacy.filter(r => r.workflow === where.workflow && typeof r.metadata.enabled === 'boolean').sort((a,b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null);
  h.diagnosticCreate.mockResolvedValue({}); h.diagnosticCreateMany.mockResolvedValue({ count: 2 }); h.diagnosticsRead.mockResolvedValue([]);
});

describe('durable cron settings', () => {
  it('imports actual admin_toggle metadata and survives retention/history growth', async () => {
    h.legacy.push({ workflow: 'cron_alpha', method: 'admin_toggle', metadata: { enabled: false }, createdAt: new Date('2025-01-01') });
    expect(await isCronEnabled('cron_alpha')).toBe(false);
    expect(h.legacyRead).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ AND: expect.arrayContaining([
      { OR: [{ method: { in: ['admin_toggle', 'admin_activate_all'] } }, { summary: { contains: 'toggled' } }] },
    ]) }) }));
    h.legacy.length = 0;
    expect(await isCronEnabled('cron_alpha')).toBe(false);
    expect(h.legacyRead).toHaveBeenCalledTimes(1);
    expect(h.importFlags).toHaveBeenCalledTimes(1);
  });
  it('persists the default only once when there was no legacy toggle', async () => {
    expect(await isCronEnabled('cron_alpha')).toBe(true);
    expect(await isCronEnabled('cron_alpha')).toBe(true);
    expect(h.legacyRead).toHaveBeenCalledTimes(1);
  });
  it('does not overwrite a concurrent admin disable during legacy initialization', async () => {
    h.importFlags.mockImplementationOnce(async () => h.flags.set(cronSettingKey('cron_alpha'), { key: cronSettingKey('cron_alpha'), enabled: false }));
    expect(await isCronEnabled('cron_alpha')).toBe(false);
  });
  it('loads existing settings in one query regardless of diagnostic history', async () => {
    for (const key of ['cron_alpha', 'cron_beta']) h.flags.set(cronSettingKey(key), { key: cronSettingKey(key), enabled: false });
    expect(await loadCronEnabledStates(['cron_alpha', 'cron_beta', 'cron_alpha'])).toEqual(new Map([['cron_alpha', false], ['cron_beta', false]]));
    expect(h.findFlags).toHaveBeenCalledTimes(1); expect(h.legacyRead).not.toHaveBeenCalled();
  });
  it('propagates setting read failures instead of enabling the job', async () => {
    h.findFlags.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(isCronEnabled('cron_alpha')).rejects.toThrow('database unavailable');
    expect(h.legacyRead).not.toHaveBeenCalled();
  });
  it('ignores malformed legacy metadata while importing the latest valid state', async () => {
    h.legacy.push({ workflow: 'cron_alpha', method: 'admin_toggle', metadata: { enabled: false }, createdAt: new Date('2025-01-01') },
      { workflow: 'cron_alpha', method: 'admin_toggle', metadata: { enabled: 'yes' }, createdAt: new Date('2026-01-01') });
    expect(await isCronEnabled('cron_alpha')).toBe(false);
    expect(h.legacyRead.mock.calls[0][0].where.AND[1]).toEqual({ OR: [
      { metadata: { path: ['enabled'], equals: true } }, { metadata: { path: ['enabled'], equals: false } },
    ] });
  });
});

const request = (body: unknown) => new NextRequest('http://localhost/api/admin/email-crons/alpha/toggle', { method: 'POST', body: JSON.stringify(body) });
const params = { params: Promise.resolve({ id: 'alpha' }) };
describe('cron setting route actions', () => {
  it('disable is read back by execution and list even with no diagnostics in the retained window', async () => {
    const response = await toggle(request({ enabled: false }), params);
    expect(response.status).toBe(200);
    expect(await isCronEnabled('cron_alpha')).toBe(false);
    const listed = await list(new NextRequest('http://localhost/api/admin/email-crons'));
    expect((await listed.json()).crons.find((c: { id: string }) => c.id === 'alpha').enabled).toBe(false);
    expect(h.diagnosticCreate).toHaveBeenCalledTimes(1);
  });
  it('activate all updates durable settings as well as audit diagnostics', async () => {
    for (const key of ['cron_alpha', 'cron_beta']) h.flags.set(cronSettingKey(key), { key: cronSettingKey(key), enabled: false });
    expect((await activateAll(request({}))).status).toBe(200);
    expect([...h.flags.values()].every(f => f.enabled)).toBe(true);
    expect(h.diagnosticCreateMany).toHaveBeenCalledTimes(1);
  });
  it.each([{}, { enabled: 'false' }, { enabled: null }, []])('rejects a nonboolean command: %j', async body => {
    expect((await toggle(request(body), params)).status).toBe(400);
    expect(h.upsert).not.toHaveBeenCalled();
  });
  it('fails before mutation when actor organization cannot be resolved', async () => {
    h.getOrg.mockRejectedValueOnce(new Error('no organization'));
    expect((await toggle(request({ enabled: false }), params)).status).toBe(500);
    expect(h.upsert).not.toHaveBeenCalled(); expect(h.diagnosticCreate).not.toHaveBeenCalled();
  });
  it('reports failed persistence as HTTP 500', async () => {
    h.upsert.mockRejectedValueOnce(new Error('write failed'));
    expect((await toggle(request({ enabled: false }), params)).status).toBe(500);
    expect(h.diagnosticCreate).not.toHaveBeenCalled();
  });
  it('requires admin authentication before writes', async () => {
    h.requireAdmin.mockRejectedValueOnce(new Error('forbidden'));
    expect((await toggle(request({ enabled: false }), params)).status).toBe(403);
    expect(h.upsert).not.toHaveBeenCalled();
  });
});
