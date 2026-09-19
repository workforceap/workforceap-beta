import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const h = vi.hoisted(() => ({ findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }));
vi.mock('@/lib/db/prisma', () => {
  const db = { featureFlag: { findMany: h.findMany, findUnique: h.findUnique, create: h.create, update: h.update, delete: h.remove }, $transaction: (fn: (tx: unknown) => unknown) => fn(db) };
  return { prisma: db };
});
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (fn: unknown) => fn }));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => ({ id: 'admin' }) }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: async () => true, getUserRoles: async () => ['admin'], getProfileRole: async () => 'admin' }));
vi.mock('@/lib/db/withDbRetry', () => ({ withDbRetry: (fn: () => unknown) => fn() }));
vi.mock('@/lib/audit', () => ({ auditLog: async () => {} }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: async () => {}, auditRequestMeta: () => ({}) }));
import { GET as memberFlags } from '@/app/api/feature-flags/route';
import { GET as adminFlags, POST as createFlag } from '@/app/api/admin/feature-flags/route';
import { PATCH as patchFlag, DELETE as deleteFlag } from '@/app/api/admin/feature-flags/[id]/route';

const cron = { id: 'cron-row', key: 'cron.enabled:cron_alpha', name: 'Cron alpha', enabled: true, rolloutPercentage: 100, allowedRoles: [], description: null };
const ordinary = { ...cron, id: 'normal-row', key: 'normal-experiment', name: 'Experiment' };
const request = (method = 'GET', body?: unknown) => new NextRequest('http://localhost/api/admin/feature-flags', { method, ...(body ? { body: JSON.stringify(body) } : {}) });
const params = { params: Promise.resolve({ id: 'cron-row' }) };
beforeEach(() => {
  vi.clearAllMocks(); h.findMany.mockResolvedValue([cron, ordinary]); h.findUnique.mockResolvedValue(cron);
  h.update.mockResolvedValue(ordinary); h.create.mockResolvedValue(ordinary); h.remove.mockResolvedValue(ordinary);
});
it('never exposes operational state as a member flag, even with rollout 100/all roles', async () => {
  const result = await memberFlags(request());
  expect((await result.json()).flags.map((f: { key: string }) => f.key)).toEqual(['normal-experiment']);
  expect(h.findMany.mock.calls[0][0].where.NOT).toEqual({ key: { startsWith: 'cron.enabled:' } });
});
it('excludes operational settings in the admin experimentation query', async () => {
  await adminFlags(request());
  expect(h.findMany.mock.calls[0][0].where).toEqual({ NOT: { key: { startsWith: 'cron.enabled:' } } });
});
it('rejects reserved keys on the ordinary feature creation endpoint', async () => {
  expect((await createFlag(request('POST', { key: ' cron.enabled:cron_alpha ', name: 'Cron' }))).status).toBe(400);
  expect(h.create).not.toHaveBeenCalled(); expect(h.findUnique).not.toHaveBeenCalled();
});
it('cannot alter cron state or rollout through an experiment PATCH', async () => {
  expect((await patchFlag(request('PATCH', { enabled: false, rolloutPercentage: 1 }), params)).status).toBe(400);
  expect(h.update).not.toHaveBeenCalled();
});
it('cannot delete a durable cron setting through an experiment DELETE', async () => {
  expect((await deleteFlag(request('DELETE'), params)).status).toBe(400);
  expect(h.findUnique.mock.calls[0][0].select).toEqual({ id: true, key: true });
  expect(h.remove).not.toHaveBeenCalled();
});
it('retains normal feature flag administration', async () => {
  h.findUnique.mockResolvedValue(ordinary);
  expect((await patchFlag(request('PATCH', { enabled: false }), params)).status).toBe(200);
  expect(h.update).toHaveBeenCalledWith({ where: { id: 'cron-row' }, data: { enabled: false } });
  expect((await deleteFlag(request('DELETE'), params)).status).toBe(200);
});
