import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiagnosticTile } from '@/components/portal/kit/pages/admin-subviews/DiagnosticsKit';

const mocks = vi.hoisted(() => ({ ping: vi.fn(), read: vi.fn(), count: vi.fn(), record: vi.fn() }));
vi.mock('next/headers', () => ({ headers: async () => ({}) }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => ({ id: 'synthetic-admin' }) }));
vi.mock('@/lib/tenant/adminPageScope', () => ({ resolveAdminPageTenant: async () => ({ ok: true }) }));
// `count` backs the failed-sends alert (workflowDiagnostic) and the send-log delivery tile (emailSendLog).
vi.mock('@/lib/db/prisma', () => ({ prisma: { $queryRaw: mocks.ping, workflowDiagnostic: { findMany: mocks.read, count: mocks.count }, emailSendLog: { count: mocks.count } } }));
vi.mock('@/lib/diagnostics', () => ({ recordWorkflowDiagnostic: mocks.record }));
vi.mock('@/lib/audit/readOnlyPortalAudit', () => ({ isReadOnlyPortalAuditHeader: () => true }));
vi.mock('@/components/portal/PageHeader', () => ({ default: () => null }));
vi.mock('@/components/portal/ui/DataTable', () => ({ default: () => null }));
vi.mock('@/components/portal/kit/pages/admin-subviews/DiagnosticsKit', () => ({ DiagnosticsKit: () => null }));
import AdminDiagnosticsPage from '@/app/admin/diagnostics/page';

async function load() {
  const page = await AdminDiagnosticsPage({ searchParams: Promise.resolve({}) });
  const props = page.props as { tiles: DiagnosticTile[]; note: string };
  return { ...props, tile: (name: string) => props.tiles.find(t => t.name === name) };
}
beforeEach(() => { vi.resetAllMocks(); mocks.ping.mockResolvedValue([{ ok: 1 }]); mocks.read.mockResolvedValue([]); mocks.count.mockResolvedValue(0); });

describe('diagnostic measurement availability', () => {
  it('distinguishes two rejected reads from successfully measured empty activity', async () => {
    mocks.read.mockRejectedValue(new Error('Synthetic read failure'));
    const page = await load();
    expect(page.tile('Database')).toMatchObject({ status: 'Healthy', tone: 'ok' });
    for (const name of ['Email Queue', 'Integrations']) expect(page.tile(name)).toMatchObject({ status: 'Unavailable', tone: 'alert' });
    expect(page.note).toContain('measurement failed');
    expect(page.note).not.toContain('All measured subsystems are reporting healthy');
  });
  it('keeps a successfully empty result muted', async () => {
    const page = await load();
    for (const name of ['Email Queue', 'Integrations']) expect(page.tile(name)).toMatchObject({ status: 'No recent activity', tone: 'muted' });
    expect(page.note).not.toContain('could not be read');
  });
  it('preserves independently observed integration errors when only email read fails', async () => {
    mocks.read.mockRejectedValueOnce(new Error('Synthetic email read failure')).mockResolvedValueOnce([{ status: 'error' }]);
    const page = await load();
    expect(page.tile('Email Queue')?.status).toBe('Unavailable');
    expect(page.tile('Integrations')).toMatchObject({ status: 'Degraded · 1 error', tone: 'alert' });
  });
  it('preserves a measured email result when only integration read fails', async () => {
    mocks.read.mockResolvedValueOnce([{ status: 'ok' }]).mockRejectedValueOnce(new Error('Synthetic integration read failure'));
    const page = await load();
    expect(page.tile('Email Queue')?.status).toBe('Healthy');
    expect(page.tile('Integrations')?.status).toBe('Unavailable');
  });
  it('does not claim empty activity when the database ping fails', async () => {
    mocks.ping.mockRejectedValue(new Error('Synthetic database outage'));
    const page = await load();
    expect(page.tile('Database')?.status).toBe('Unreachable');
    for (const name of ['Email Queue', 'Integrations']) expect(page.tile(name)?.status).toBe('Unavailable');
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.count).not.toHaveBeenCalled();
  });
});
