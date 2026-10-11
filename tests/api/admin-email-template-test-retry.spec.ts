// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), requireAdmin: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(),
  getResend: vi.fn(), send: vi.fn(), audit: vi.fn(), diagnostic: vi.fn(),
}));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/auth/roles', () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  $transaction: async (run: (tx: unknown) => unknown) => run({ emailTemplate: { findUnique: mocks.findUnique } }),
  emailSendLog: { upsert: mocks.upsert },
} }));
vi.mock('@/lib/email', () => ({ getResend: mocks.getResend }));
vi.mock('@/lib/audit', () => ({ auditLog: mocks.audit }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: mocks.audit }));
vi.mock('@/lib/diagnostics', () => ({ recordWorkflowDiagnostic: mocks.diagnostic }));

import { POST } from '@/app/api/admin/email-templates/[id]/test/route';

const initialTime = Date.parse('2026-10-11T08:00:00Z');
const revision = '2026-10-10T00:00:00.000Z';
const actor = { id: 'actor-a', email: 'synthetic-admin@workforceap.org' };
const template = { id: 'template-a', subject: 'Hello {firstName}', body: '<p>Hi {firstName}</p>', variables: ['firstName'], updatedAt: new Date(revision) };
const attempt = () => ({
  actorId: actor.id, templateId: template.id,
  attemptId: `${initialTime}-00000000-0000-4000-8000-000000000001`,
  templateUpdatedAt: revision, to: actor.email, variables: { firstName: 'Synthetic' },
});
const request = (body: unknown) => new NextRequest('https://www.workforceap.org/api/admin/email-templates/template-a/test', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const call = (body: unknown = attempt(), id = template.id) => POST(request(body), { params: Promise.resolve({ id }) });
let now = initialTime;
let accepted: Map<string, { payload: string; id: string }>;

beforeEach(() => {
  vi.clearAllMocks();
  now = initialTime;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubEnv('UNSUBSCRIBE_TOKEN_SECRET', 'synthetic-unsubscribe-secret');
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.workforceap.org');
  vi.stubEnv('EMAIL_FROM', 'WorkforceAP <hello@workforceap.org>');
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected external request'); }));
  mocks.getUser.mockResolvedValue(actor);
  mocks.requireAdmin.mockResolvedValue(undefined);
  mocks.findUnique.mockResolvedValue(template);
  mocks.upsert.mockResolvedValue({});
  mocks.audit.mockResolvedValue(undefined);
  mocks.diagnostic.mockResolvedValue(undefined);
  mocks.getResend.mockReturnValue({ emails: { send: mocks.send } });
  accepted = new Map();
  // Actual shared sender + an SDK-shaped provider binding, never a mocked send helper.
  mocks.send.mockImplementation(async (payload: unknown, options: { idempotencyKey: string }) => {
    const previous = accepted.get(options.idempotencyKey);
    const serialized = JSON.stringify(payload);
    if (previous && previous.payload !== serialized) return { data: null, error: {
      name: 'invalid_idempotent_request', statusCode: 409, message: 'Same key with different payload',
    } };
    const record = previous ?? { payload: serialized, id: `synthetic-provider-${accepted.size + 1}` };
    accepted.set(options.idempotencyKey, record);
    return { data: { id: record.id }, error: null };
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('admin template test logical-send retries', () => {
  it('replays exactly one provider payload/key after the accepted HTTP response is lost', async () => {
    const frozen = attempt();
    await call(frozen); // Provider accepted; browser loses this response entirely.
    now += 180_000;
    const retried = await call(frozen);
    expect(retried.status).toBe(200);
    expect(await retried.json()).toMatchObject({ ok: true, providerMessageId: 'synthetic-provider-1' });
    expect(accepted.size).toBe(1);
    expect(mocks.send.mock.calls[1]).toEqual(mocks.send.mock.calls[0]);
    expect(mocks.send.mock.calls[0][0]).toMatchObject({
      from: 'WorkforceAP <hello@workforceap.org>', to: actor.email, subject: 'Hello Synthetic',
      html: expect.stringContaining('Hi Synthetic'), text: expect.stringContaining('Hi Synthetic'),
      headers: { 'List-Unsubscribe': expect.stringContaining('/api/unsubscribe?token='), 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    });
  });

  it('allocates a distinct key only for a new explicit logical test', async () => {
    await call();
    const fresh = { ...attempt(), attemptId: `${initialTime}-00000000-0000-4000-8000-000000000002` };
    expect((await call(fresh)).status).toBe(200);
    expect(accepted.size).toBe(2);
    expect(mocks.send.mock.calls[1][1]).not.toEqual(mocks.send.mock.calls[0][1]);
  });

  it.each(['actor', 'template'])('rejects a restored operation owned by a different %s before any read/send', async (kind) => {
    const frozen = attempt();
    if (kind === 'actor') frozen.actorId = 'another-actor';
    else frozen.templateId = 'another-template';
    expect((await call(frozen)).status).toBe(kind === 'actor' ? 403 : 400);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('does not turn actor A’s retained operation into a new actor B key after login changes', async () => {
    await call();
    mocks.getUser.mockResolvedValue({ id: 'actor-b', email: actor.email });
    expect((await call()).status).toBe(403);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(accepted.size).toBe(1);
  });

  it('rechecks a revoked admin role before replaying an accepted operation', async () => {
    await call();
    mocks.requireAdmin.mockRejectedValue(new Error('Role revoked'));
    expect((await call()).status).toBe(403);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it('fails closed on a changed template revision before sending the old operation again', async () => {
    await call();
    mocks.findUnique.mockResolvedValue({ ...template, subject: 'Edited template', updatedAt: new Date('2026-10-11T08:01:00Z') });
    const response = await call();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'template_changed', deliveryStatus: 'unknown' });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it.each(['variables', 'from', 'unsubscribe', 'site'])('preserves the key and unknown outcome when %s changes the provider payload', async (kind) => {
    await call();
    const frozen = attempt();
    if (kind === 'variables') frozen.variables.firstName = 'Changed';
    if (kind === 'from') vi.stubEnv('EMAIL_FROM', 'Changed <changed@workforceap.org>');
    if (kind === 'unsubscribe') vi.stubEnv('UNSUBSCRIBE_TOKEN_SECRET', 'rotated-synthetic-secret');
    if (kind === 'site') vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://changed.workforceap.org');
    const response = await call(frozen);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'provider_payload_conflict', deliveryStatus: 'unknown' });
    expect(mocks.send.mock.calls[1][1]).toEqual(mocks.send.mock.calls[0][1]);
    expect(accepted.size).toBe(1);
  });

  it.each([
    { label: 'missing operation', mutate: () => ({ to: actor.email }), status: 400 },
    { label: 'malformed operation', mutate: () => ({ ...attempt(), attemptId: 'not-an-attempt' }), status: 400 },
    { label: 'future operation', mutate: () => ({ ...attempt(), attemptId: `${initialTime + 120_000}-00000000-0000-4000-8000-000000000001` }), status: 400 },
    { label: 'oversized variables', mutate: () => ({ ...attempt(), variables: { firstName: 'x'.repeat(65_536) } }), status: 400 },
    { label: 'invalid variable value', mutate: () => ({ ...attempt(), variables: { firstName: 1 } }), status: 400 },
  ])('rejects $label before provider egress', async ({ mutate, status }) => {
    expect((await call(mutate())).status).toBe(status);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('rejects the exact 23h retry-age boundary instead of issuing a fresh key', async () => {
    await call();
    now += 23 * 60 * 60 * 1_000;
    const response = await call();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'attempt_expired', deliveryStatus: 'unknown' });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it('allows the final instant inside the 23h bound under the original key', async () => {
    await call();
    now += 23 * 60 * 60 * 1_000 - 1;
    expect((await call()).status).toBe(200);
    expect(accepted.size).toBe(1);
    expect(mocks.send.mock.calls[1]).toEqual(mocks.send.mock.calls[0]);
  });

  it('keeps malformed provider acceptance unknown and returns no success receipt', async () => {
    mocks.send.mockResolvedValue({ data: null, error: null });
    const response = await call();
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ deliveryStatus: 'unknown' });
    expect(mocks.upsert.mock.calls.at(-1)?.[0].create).toMatchObject({ status: 'failed', providerMessageId: null });
  });

  it('keeps concurrent provider-key conflicts unknown without generating a second operation', async () => {
    mocks.send.mockResolvedValue({ data: null, error: { name: 'concurrent_idempotent_requests', statusCode: 409, message: 'Request in flight' } });
    const response = await call();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'provider_attempt_in_progress', deliveryStatus: 'unknown' });
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it('still rejects anonymous requests before looking up a template or sending', async () => {
    mocks.getUser.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('preserves fixture-recipient suppression', async () => {
    expect((await call({ ...attempt(), to: 'fixture@example.test' })).status).toBe(422);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
