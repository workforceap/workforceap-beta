import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(), isAdmin: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), scope: vi.fn(),
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: { partner: h, partnerProgramCatalog: { count: async () => 1 } } }));
vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: async (org: string, fn: (db: unknown) => unknown) => { h.scope(org); return fn({ partner: h, partnerProgramCatalog: { count: async () => 1 } }); },
  crossTenantOK: (fn: () => unknown) => fn(),
}));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: async () => 'synthetic-org' }));
vi.mock('@/lib/auth/server', () => ({ getUser: h.getUser }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: h.isAdmin, requireAdmin: async () => { if (!await h.isAdmin()) throw new Error('Forbidden'); } }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/audit', () => ({ auditLog: async () => {} }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: async () => {} }));
vi.mock('@/lib/partner/syncProgramCatalog', () => ({ syncPartnerProgramCatalog: async () => {} }));
vi.mock('@/components/marketing/EnrollRefCookie', () => ({ default: () => null }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));

import { POST } from '@/app/api/admin/partners/route';
import { PATCH } from '@/app/api/admin/partners/[id]/route';
import PartnerEnrollmentPage from '@/app/enroll/[school]/page';
import { resolveEnrollmentCopy } from '@/lib/enroll/enrollmentCopy';

const request = (body: unknown, method = 'POST') => new NextRequest('https://example.test/api/admin/partners', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const params = { params: Promise.resolve({ id: 'synthetic-school' }) };
const createBody = { name: 'Example High School', slug: 'example-high-school' };
const partner = {
  id: 'synthetic-school', name: 'Example High School', slug: 'example-high-school', referralCode: 'example2026',
  enrollmentPageEnabled: false, sponsorshipTermLabel: '2026', schoolDistrict: null,
  enrollmentHeadline: null, enrollmentBlurb: null,
  programCatalog: [{ programSlug: 'it-support-professional-certificate-ibm', featured: false, note: null }],
};

beforeEach(() => {
  vi.clearAllMocks(); h.getUser.mockResolvedValue({ id: 'synthetic-staff' }); h.isAdmin.mockResolvedValue(true);
  h.findUnique.mockResolvedValue(null);
  h.findFirst.mockImplementation(async ({ where }) => where.id ? partner : null);
  h.create.mockImplementation(async ({ data }) => ({ id: 'synthetic-created', ...data }));
  h.update.mockResolvedValue(partner);
});

describe('partner enrollment copy at save and render boundaries', () => {
  it.each(['enrollmentHeadline', 'enrollmentBlurb'])('rejects unsafe %s on both create and edit before any write', async (field) => {
    const created = await POST(request({ ...createBody, [field]: 'FREE career training' }));
    expect(created.status).toBe(400);
    expect((await created.json()).error).toContain('qualifying no-cost wording');
    const edited = await PATCH(request({ [field]: 'Get free certification' }, 'PATCH'), params);
    expect(edited.status).toBe(400);
    expect(h.create).not.toHaveBeenCalled(); expect(h.update).not.toHaveBeenCalled();
  });

  it('accepts qualifying no-cost copy and allows clearing an override', async () => {
    expect((await POST(request({ ...createBody, enrollmentHeadline: 'Training at no cost for qualifying members', enrollmentBlurb: null }))).status).toBe(201);
    expect(h.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ organizationId: 'synthetic-org', enrollmentHeadline: 'Training at no cost for qualifying members' }) }));
    expect((await PATCH(request({ enrollmentHeadline: null, enrollmentBlurb: ' Funded through grants and partnerships. ' }, 'PATCH'), params)).status).toBe(200);
    expect(h.update).toHaveBeenCalledWith({ where: { id: 'synthetic-school' }, data: { enrollmentHeadline: null, enrollmentBlurb: 'Funded through grants and partnerships.' } });
    expect(h.scope).toHaveBeenCalledWith('synthetic-org');
  });

  it('preserves authentication, admin authorization and scoped missing-partner behavior', async () => {
    h.getUser.mockResolvedValueOnce(null);
    expect((await POST(request(createBody))).status).toBe(401);
    h.isAdmin.mockResolvedValue(false);
    expect((await POST(request(createBody))).status).toBe(403);
    expect((await PATCH(request({}, 'PATCH'), params)).status).toBe(403);
    h.isAdmin.mockResolvedValue(true); h.findFirst.mockResolvedValue(null);
    expect((await PATCH(request({}, 'PATCH'), params)).status).toBe(404);
    expect(h.create).not.toHaveBeenCalled(); expect(h.update).not.toHaveBeenCalled();
  });

  it('renders safe defaults for previously saved unsafe copy instead of throwing on the public route', async () => {
    h.findFirst.mockResolvedValue({ ...partner, enrollmentHeadline: 'Free classes', enrollmentBlurb: 'Claim your FREE certification' });
    const html = renderToStaticMarkup(await PartnerEnrollmentPage({ params: Promise.resolve({ school: 'example' }) }));
    const page = document.implementation.createHTMLDocument(); page.body.innerHTML = html;
    expect(page.querySelector('h1')?.textContent).toBe('Example students: launch your career with an industry certification');
    expect(html).toContain('at no cost to Example High School students for 2026');
    expect(html).not.toContain('Free classes'); expect(html).not.toContain('FREE certification');
    expect(html).toContain('/apply?ref=example2026');
    expect(h.update).not.toHaveBeenCalled();
  });

  it('renders safe saved headline and blurb overrides in the existing public hero', async () => {
    h.findFirst.mockResolvedValue({ ...partner, enrollmentHeadline: 'Build your next career skill', enrollmentBlurb: 'Qualifying students train at no cost through this partnership.' });
    const page = document.implementation.createHTMLDocument();
    page.body.innerHTML = renderToStaticMarkup(await PartnerEnrollmentPage({ params: Promise.resolve({ school: 'example' }) }));
    expect(page.querySelector('h1')?.textContent).toBe('Build your next career skill');
    expect(page.querySelector('.lede .sub')?.textContent).toBe('Qualifying students train at no cost through this partnership.');
  });

  it('retains safe overrides, uses existing defaults for blanks, and does not mistake Freeport for a prohibited claim', () => {
    expect(resolveEnrollmentCopy({ name: partner.name, termLabel: '2026', headline: ' Freeport students: train at no cost ', blurb: ' Funded by our partnership. ' })).toMatchObject({ headline: 'Freeport students: train at no cost', blurb: 'Funded by our partnership.' });
    expect(resolveEnrollmentCopy({ name: partner.name, termLabel: '2026', headline: '', blurb: null }).blurb).toContain('at no cost');
  });
});
