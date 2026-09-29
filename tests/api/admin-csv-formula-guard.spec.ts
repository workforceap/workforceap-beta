import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * S01/P02: the admin member export, the bulk member export and the TWC
 * program-catalog export neutralise spreadsheet formulas and are never cached.
 * A member- or staff-typed value such as `=HYPERLINK(...)` must open in Excel
 * or Sheets as text (leading `'`), the same rule the shared `lib/csv.ts`
 * `csvEscape` applies to the partner export (#2563). Each response is
 * `Cache-Control: no-store` so no browser, proxy or CDN keeps the PII.
 */
const mocks = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  memberEventGroupBy: vi.fn(),
  courseProgressGroupBy: vi.fn(),
  memberProgramProgressFindMany: vi.fn(),
  catalogFindMany: vi.fn(),
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  auditLog: vi.fn(),
}));

vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: mocks.isAdmin, isSuperAdmin: async () => false }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/audit', () => ({ auditLog: mocks.auditLog }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: async () => {}, auditRequestMeta: () => ({}) }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: async () => 'org-a' }));
vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: async (_orgId: string, load: (db: unknown) => unknown) => {
    const { prisma } = await import('@/lib/db/prisma');
    return load(prisma);
  },
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { findMany: mocks.userFindMany },
    memberEvent: { groupBy: mocks.memberEventGroupBy },
    courseProgress: { groupBy: mocks.courseProgressGroupBy },
    memberProgramProgress: { findMany: mocks.memberProgramProgressFindMany },
    organizationProgramCatalog: { findMany: mocks.catalogFindMany },
  },
}));

import { GET as exportMembers } from '@/app/api/admin/members/export/route';
import { POST as bulkExportMembers } from '@/app/api/admin/members/bulk-export/route';
import { GET as exportTwc } from '@/app/api/admin/programs/export-twc/route';

const FORMULA = '=HYPERLINK("http://x","y")';
const MEMBER_ID = '00000000-0000-0000-0000-00000000cccc';

/** Minimal RFC 4180 parser: quoted fields, doubled quotes, CRLF or LF rows. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function member(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: MEMBER_ID,
    fullName: 'Pat Jones',
    email: 'pat@example.test',
    phone: null,
    enrolledProgram: null,
    enrolledAt: new Date('2026-01-05'),
    memberStatus: 'active',
    staleTrainingDetectedAt: null,
    assessmentScorePct: 80,
    assessmentCompleted: true,
    updatedAt: new Date('2026-09-01'),
    createdAt: new Date('2026-01-01'),
    lastLoginAt: null,
    pipelineBoardStage: 'in_training',
    profile: { profilePhone: null, employmentStatus: 'Unemployed', educationLevel: 'High school' },
    courseEnrollments: [],
    partnerReferrals: [],
    counselorAssignments: [],
    placementRecord: null,
    ...overrides,
  };
}

function catalogRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'IT Support',
    description: 'Entry-level help desk training',
    duration: '12 weeks',
    cost: 1200,
    certCost: 150,
    bookCost: 0,
    miscCost: 0,
    programStartDate: null,
    programEndDate: null,
    certifications: ['CompTIA A+'],
    ...overrides,
  };
}

type Export = { status: number; rows: string[][]; cacheControl: string | null; disposition: string };

async function read(response: Response): Promise<Export> {
  const text = response.status === 200 ? await response.text() : '';
  return {
    status: response.status,
    rows: parseCsv(text).filter((r) => r.some((c) => c !== '')),
    cacheControl: response.headers.get('Cache-Control'),
    disposition: response.headers.get('Content-Disposition') ?? '',
  };
}

const runners: Record<string, { column: string; run: () => Promise<Export>; seed: (value: string) => void }> = {
  'GET /api/admin/members/export': {
    column: 'Name',
    run: async () => read(await exportMembers(new Request('https://workforceap.org/api/admin/members/export') as never)),
    seed: (value) => mocks.userFindMany.mockResolvedValue([member({ fullName: value })]),
  },
  'POST /api/admin/members/bulk-export': {
    column: 'Name',
    run: async () =>
      read(
        await bulkExportMembers(
          new Request('https://workforceap.org/api/admin/members/bulk-export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ memberIds: [MEMBER_ID] }),
          }) as never,
        ),
      ),
    seed: (value) => mocks.userFindMany.mockResolvedValue([member({ fullName: value })]),
  },
  'GET /api/admin/programs/export-twc': {
    column: 'Program name',
    run: async () => read(await exportTwc(new Request('https://workforceap.org/api/admin/programs/export-twc') as never)),
    seed: (value) => mocks.catalogFindMany.mockResolvedValue([catalogRow({ name: value })]),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ id: 'admin-a' });
  mocks.isAdmin.mockResolvedValue(true);
  mocks.auditLog.mockResolvedValue(undefined);
  mocks.memberEventGroupBy.mockResolvedValue([]);
  mocks.courseProgressGroupBy.mockResolvedValue([]);
  mocks.memberProgramProgressFindMany.mockResolvedValue([]);
  mocks.userFindMany.mockResolvedValue([member()]);
  mocks.catalogFindMany.mockResolvedValue([catalogRow()]);
});

describe.each(Object.entries(runners))('%s', (_name, { column, run, seed }) => {
  function cell(result: Export): string {
    const index = result.rows[0].indexOf(column);
    expect(index, `header has "${column}"`).toBeGreaterThan(-1);
    return result.rows[1][index];
  }

  it('shows a formula-shaped value as text: the cell starts with \'=', async () => {
    seed(FORMULA);
    const result = await run();
    expect(result.status).toBe(200);
    expect(cell(result)).toBe(`'${FORMULA}`);
    expect(cell(result).startsWith("'=")).toBe(true);
  });

  it.each(['+SUM(A1)', '-2+3', '@cmd', '\tTAB', '\rCR'])('neutralises a value starting with %j', async (value) => {
    seed(value);
    const result = await run();
    expect(cell(result)).toBe(`'${value}`);
  });

  it('leaves a normal value unchanged and still quotes commas and quotes', async () => {
    seed('Pat "PJ" Jones, Jr.');
    const result = await run();
    expect(cell(result)).toBe('Pat "PJ" Jones, Jr.');
    seed('Pat Jones');
    expect(cell(await run())).toBe('Pat Jones');
  });

  it('is never cached', async () => {
    const result = await run();
    expect(result.status).toBe(200);
    expect(result.cacheControl).toBe('no-store');
    expect(result.disposition).toMatch(/^attachment; filename=".+\.csv"$/);
  });
});
