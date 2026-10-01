// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ audit: vi.fn(), actor: vi.fn(), row: vi.fn(), read: vi.fn() }));
vi.mock('@/lib/audit', () => ({ auditLog: mocks.audit }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/enrollmentAgreements/access', () => ({ requireAgreementActor: mocks.actor }));
vi.mock('@/lib/enrollmentAgreements/service', () => ({ getAgreementForRead: mocks.row }));
vi.mock('@/lib/enrollmentAgreements/storage', async (original) => ({
  ...await original<typeof import('@/lib/enrollmentAgreements/storage')>(), readStoredAgreementPdf: mocks.read,
}));

import { recordAgreementAudit } from '@/lib/enrollmentAgreements/audit';
import { GET } from '@/app/api/enrollment-agreements/[id]/download/route';

const actor = { id: 'admin', role: 'admin', organizationId: 'organization' };
const subject = { id: 'revision', memberId: 'member', storagePath: 'private/path', reviewNote: 'private note' };
const bytes = new Uint8Array(Buffer.from('%PDF synthetic private document'));
const request = () => GET(new Request('https://portal.test/api/enrollment-agreements/revision/download'), { params: Promise.resolve({ id: 'revision' }) });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.audit.mockResolvedValue(undefined);
  mocks.actor.mockResolvedValue(actor);
  mocks.row.mockResolvedValue(subject);
  mocks.read.mockResolvedValue(bytes);
});

describe('enrollment audit privacy and delivery', () => {
  it.each(['uploaded', 'verified', 'needs_correction', 'downloaded'] as const)('records bounded identifiers for %s, not document data', async (action) => {
    await recordAgreementAudit(actor, action, subject);
    expect(mocks.audit).toHaveBeenCalledExactlyOnceWith({
      actorUserId: 'admin', actorEmailSnapshot: null, actorRoleSnapshot: 'admin',
      action: `enrollment_agreement_${action}`, targetType: 'EnrollmentAgreementSubmission', targetId: 'revision',
      metadata: { organizationId: 'organization', memberId: 'member' },
    });
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toMatch(/private|PDF/);
  });
  it('does not misrepresent a committed mutation as a rollback when secondary audit persistence fails', async () => {
    mocks.audit.mockRejectedValue(new Error('private failure'));
    await expect(recordAgreementAudit(actor, 'uploaded', subject)).resolves.toBeUndefined();
  });
  it('staff download is audited before bytes are delivered', async () => {
    const response = await request();
    expect(response.status).toBe(200);
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'enrollment_agreement_downloaded' }));
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });
  it('failed staff access-audit persistence withholds all PDF bytes and diagnostics', async () => {
    mocks.audit.mockRejectedValue(new Error('secret database diagnostic'));
    const response = await request();
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toContain('AUDIT_UNAVAILABLE');
    expect(body).not.toMatch(/secret|PDF synthetic/);
  });
  it('denied or unavailable documents do not record a successful staff download', async () => {
    mocks.read.mockRejectedValue(new Error('not available'));
    expect((await request()).status).toBe(503);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it('self-download is not misclassified as staff access', async () => {
    mocks.actor.mockResolvedValue({ ...actor, id: 'member', role: 'member' });
    expect((await request()).status).toBe(200);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
