import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { matchesWhere } from '@/tests/helpers/prismaWhereMatches';
const mocks = vi.hoisted(() => ({ users: vi.fn() }));
vi.mock('next/headers', () => ({ headers: async () => ({}) }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: async () => ({ id: 'synthetic-admin' }) }));
vi.mock('@/lib/tenant/adminPageScope', () => ({
  resolveAdminPageTenant: async () => ({ ok: true, orgId: 'org-a', superAdmin: false }),
  withAdminPageScope: async (_scope: unknown, load: (db: unknown) => unknown) => load({ user: { findMany: mocks.users } }),
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: { workflowDiagnostic: { findMany: async () => [] } } }));
vi.mock('@/lib/diagnostics', () => ({ recordWorkflowDiagnostic: vi.fn() }));
vi.mock('@/lib/audit/readOnlyPortalAudit', () => ({ isReadOnlyPortalAuditHeader: () => true }));
vi.mock('@/components/portal/PageHeader', () => ({ default: () => null }));
vi.mock('@/components/portal/ui/DataTable', () => ({ default: ({ rows, columns }: { rows: Array<{ id: string }>; columns: Array<{ key: string; cell: (row: unknown) => React.ReactNode }> }) => <div>{rows.map((row) => <div key={row.id}>{columns.map((column) => <span key={column.key}>{column.cell(row)}</span>)}</div>)}</div> }));
import AdminDiagnosticsPage from '@/app/admin/diagnostics/page';
const PRIMARY = { programSlug: 'comptia-a-professional-certificate', isPrimary: true };
const base = { deletedAt: null, courseEnrollments: [] as Array<typeof PRIMARY>, enrolledProgram: null as string | null };
beforeEach(() => vi.clearAllMocks());
async function page() { return renderToStaticMarkup(await AdminDiagnosticsPage({ searchParams: Promise.resolve({ ui: 'legacy' }) })); }

describe('legacy diagnostics enrollment drift', () => {
  it('detects a missing legacy mirror, treats aliases as equal, and skips cleared historical-only records', async () => {
    const rows = [
      { ...base, id: 'primary-only', fullName: 'Primary Only', courseEnrollments: [PRIMARY] },
      { ...base, id: 'alias', fullName: 'Alias Match', enrolledProgram: 'comptia-a-plus', courseEnrollments: [PRIMARY] },
      { ...base, id: 'history', fullName: 'Cleared History', courseEnrollments: [{ ...PRIMARY, isPrimary: false }] },
    ];
    mocks.users.mockImplementation(async (args: { where: unknown }) => rows.filter((row) => matchesWhere(row, args.where)));
    const html = await page();
    expect(html).toContain('Primary Only');
    expect(html).toContain('Missing legacy pointer');
    expect(html).not.toContain('Alias Match');
    expect(html).not.toContain('Cleared History');
    expect(mocks.users.mock.calls[0][0]).toMatchObject({ orderBy: { id: 'asc' }, take: 501 });
  });
  it('labels a capped clean scan as partial instead of claiming every account was checked', async () => {
    mocks.users.mockResolvedValue(Array.from({ length: 501 }, (_, index) => ({ ...base, id: `member-${index}`, fullName: 'Synthetic', enrolledProgram: PRIMARY.programSlug, courseEnrollments: [PRIMARY] })));
    const html = await page();
    expect(html).toContain('500');
    expect(html).toContain('partial scan');
    expect(html).toContain('additional accounts have not been checked');
    expect(html).not.toContain('in sync for all');
  });
});
