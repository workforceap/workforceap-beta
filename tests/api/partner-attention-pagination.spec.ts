import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ user: vi.fn(), partner: vi.fn(), load: vi.fn() }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (fn: unknown) => fn }));
vi.mock('@/lib/auth/server', () => ({ getUser: h.user }));
vi.mock('@/lib/auth/roles', () => ({ getPartnerForUser: h.partner }));
vi.mock('@/lib/partner/attentionQueue', () => ({ loadPartnerAttentionPage: h.load }));
import { GET } from '@/app/api/partner/members/needs-attention/route';
import { encodeAttentionCursor, parseAttentionQuery, type AttentionCursor } from '@/lib/partner/attentionPagination';
const scope = { partnerId: 'partner-1', organizationId: 'org-1' };
const now = new Date('2026-09-19T12:00:00.000Z');
const cursor: AttentionCursor = { v: 1, ...scope, tier: 'high', asOf: now.toISOString(), updatedAt: '2020-01-01T00:00:00.000Z', referralId: 'r1' };
const parse = (value: unknown, tier = 'high') => parseAttentionQuery(new URLSearchParams({ tier, cursor: Buffer.from(JSON.stringify(value)).toString('base64url') }), scope, now);
beforeEach(() => { vi.clearAllMocks(); h.user.mockResolvedValue({ id: 'actor' }); h.partner.mockResolvedValue({ partnerId: 'partner-1', partner: { organizationId: 'org-1' } }); h.load.mockResolvedValue({ members: [], counts: { all: 0, high: 0, medium: 0, low: 0, watch: 0 }, total: 0, nextCursor: null, asOf: now.toISOString() }); });

describe('strict partner attention pagination', () => {
  it('round trips a scoped, typed cursor and retains its original reference time', () => {
    const parsed = parse(cursor);
    expect(parsed).toEqual({ tier: 'high', limit: 50, asOf: now, cursor });
    expect(encodeAttentionCursor(parsed.cursor!)).toBe(encodeAttentionCursor(cursor));
  });
  it.each([
    null, [], 3, 'cursor', { ...cursor, v: 2 }, { ...cursor, partnerId: 'other' }, { ...cursor, organizationId: 'other' },
    { ...cursor, tier: 'watch' }, { ...cursor, after: 'extra' }, { ...cursor, referralId: [] },
    { ...cursor, referralId: '' }, { ...cursor, referralId: ' x ' }, { ...cursor, referralId: 'a'.repeat(129) },
    { ...cursor, asOf: '2026-09-20T12:00:00.000Z' }, { ...cursor, asOf: '2026-09-18T11:59:59.000Z' },
    { ...cursor, asOf: '2026-09-19' }, { ...cursor, updatedAt: 'invalid' }, { ...cursor, updatedAt: 0 },
  ])('rejects malformed, foreign-scope or expired cursor %#', value => expect(() => parse(value)).toThrow());
  it.each(['', '!!!', 'a'.repeat(2001), 'eyJ2IjoxfQ=='])('rejects invalid cursor encoding %s', raw => {
    expect(() => parseAttentionQuery(new URLSearchParams({ cursor: raw }), scope, now)).toThrow();
  });
  it.each(['0', '-1', '1.5', '101', 'Infinity', '2junk'])('rejects invalid page size %s', limit => expect(() => parseAttentionQuery(new URLSearchParams({ limit }), scope, now)).toThrow());
  it('defaults first page and rejects unknown tier', () => {
    expect(parseAttentionQuery(new URLSearchParams(), scope, now)).toEqual({ tier: 'all', limit: 50, asOf: now, cursor: undefined });
    expect(() => parseAttentionQuery(new URLSearchParams({ tier: 'critical' }), scope, now)).toThrow();
  });
  it('uses authenticated scope and returns all pagination fields', async () => {
    const response = await GET(new Request('https://example.test/api/partner/members/needs-attention?tier=high&partnerId=foreign'));
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ total: 0, nextCursor: null });
    expect(h.load).toHaveBeenCalledWith('partner-1', 'org-1', expect.objectContaining({ tier: 'high', limit: 50 }));
  });
  it('returns 400 before a queue read for malformed or foreign cursor', async () => {
    const response = await GET(new Request('https://example.test/api/partner/members/needs-attention?cursor=bad'));
    expect(response.status).toBe(400); expect(h.load).not.toHaveBeenCalled();
  });
  it('keeps anonymous and non-partner actors outside the queue', async () => {
    h.user.mockResolvedValueOnce(null);
    expect((await GET(new Request('https://example.test'))).status).toBe(401);
    h.partner.mockResolvedValueOnce(null);
    expect((await GET(new Request('https://example.test'))).status).toBe(403);
    expect(h.load).not.toHaveBeenCalled();
  });
});
