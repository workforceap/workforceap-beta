import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), send: vi.fn(), audit: vi.fn(), event: vi.fn(),
  afterQueue: [] as Array<() => Promise<unknown>>,
  tx: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    profile: { upsert: vi.fn() },
    preScreeningResponse: { findUnique: vi.fn(), create: vi.fn() },
    preScreeningDraft: { deleteMany: vi.fn() },
  },
}));

vi.mock('next/server', () => ({
  NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) },
  after: (fn: () => Promise<unknown>) => mocks.afterQueue.push(fn),
}));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { $transaction: (fn: (tx: typeof mocks.tx) => Promise<unknown>) => fn(mocks.tx) } }));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (fn: unknown) => fn }));
vi.mock('@/lib/email', () => ({ sendPreScreeningReadyEmail: mocks.send }));
vi.mock('@/lib/audit', () => ({ auditLog: mocks.audit }));
vi.mock('@/lib/audit/log', () => ({ logAuditEvent: mocks.event }));

import { POST } from '@/app/api/member/pre-screening/route';

const answers = {
  employmentStatus: 'Student', primaryGoal: 'Certification', weeklyHours: '10-20 hrs',
  barrier: 'Travel to training', hearAbout: 'Workforce Solutions', workforceAssistance: false,
  phone: '5125550100', address: '100 Example Street, Austin, TX',
};

let stored: Record<string, unknown> | null;
let pending: Record<string, unknown> | null;
let contacts: { phone: string | null; address: string | null };
let committed: Promise<void>;
let completeCommit: () => void;
const duplicate = (target = 'user_id') => Object.assign(new Error('Unique response per member'), { code: 'P2002', meta: { target: [target] } });

function responseRow() {
  return stored && { id: 'response-1', ...stored, user: { phone: contacts.phone, profile: { profileAddress: contacts.address } } };
}

function request(body: unknown = answers) {
  return new Request('http://localhost/api/member/pre-screening', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

async function flushAfter() {
  await Promise.all(mocks.afterQueue.splice(0).map((fn) => fn()));
}

function waitForBothPreflightReads() {
  let release!: () => void;
  const bothRead = new Promise<void>((resolve) => { release = resolve; });
  let reads = 0;
  mocks.tx.preScreeningResponse.findUnique.mockImplementation(async () => {
    if (stored) return responseRow();
    reads += 1;
    if (reads === 2) release();
    await bothRead;
    return null;
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  stored = null;
  pending = null;
  contacts = { phone: null, address: null };
  committed = new Promise<void>((resolve) => { completeCommit = resolve; });
  mocks.afterQueue.length = 0;
  mocks.getUser.mockResolvedValue({ id: 'member-1', email: 'member@example.test' });
  mocks.tx.user.findUnique.mockResolvedValue({ assessmentCompleted: true, organizationId: 'org-a', fullName: 'Pat Example', email: 'member@example.test' });
  mocks.tx.preScreeningResponse.findUnique.mockImplementation(async () => responseRow());
  mocks.tx.preScreeningResponse.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    if (pending || stored) {
      await committed;
      throw duplicate();
    }
    pending = data;
    return { id: 'response-1' };
  });
  mocks.tx.user.update.mockImplementation(async ({ data }: { data: { phone: string } }) => {
    contacts.phone = data.phone;
    return { id: 'member-1' };
  });
  mocks.tx.profile.upsert.mockImplementation(async ({ update }: { update: { profileAddress: string } }) => {
    contacts.address = update.profileAddress;
    stored = pending;
    completeCommit();
    return { id: 'profile-1' };
  });
  mocks.tx.preScreeningDraft.deleteMany.mockResolvedValue({ count: 1 });
  mocks.send.mockResolvedValue(undefined);
  mocks.audit.mockResolvedValue(undefined);
  mocks.event.mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('pre-screening first-write-wins retries', () => {
  it('accepts a retry after the first response was lost without rewriting answers or notifying staff twice', async () => {
    expect((await POST(request())).status).toBe(200);
    const retry = await POST(request());
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ ok: true, alreadySubmitted: true });
    expect(stored).toMatchObject({ barrier: answers.barrier, userId: 'member-1', organizationId: 'org-a' });
    expect(mocks.tx.preScreeningResponse.create).toHaveBeenCalledTimes(1);
    expect(mocks.tx.user.update).toHaveBeenCalledTimes(1);
    expect(mocks.tx.profile.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.tx.preScreeningDraft.deleteMany).toHaveBeenCalledTimes(1);
    await flushAfter();
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.audit).toHaveBeenCalledTimes(1);
    expect(mocks.event).toHaveBeenCalledTimes(1);
  });

  it('recovers the unique-row race only after the other submission has saved a response', async () => {
    waitForBothPreflightReads();
    const responses = await Promise.all([POST(request()), POST(request())]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    expect(bodies).toContainEqual({ ok: true });
    expect(bodies).toContainEqual({ ok: true, alreadySubmitted: true });
    expect(mocks.tx.user.update).toHaveBeenCalledTimes(1);
    expect(mocks.tx.profile.upsert).toHaveBeenCalledTimes(1);
    await flushAfter();
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.audit).toHaveBeenCalledTimes(1);
    expect(mocks.event).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['answers', { barrier: 'Changed in another tab' }],
    ['contact details', { phone: '5125550199' }],
  ])('refuses a concurrent unique-row retry with different %s', async (_label, changed) => {
    waitForBothPreflightReads();
    const responses = await Promise.all([POST(request()), POST(request({ ...answers, ...changed }))]);
    expect(responses.map((response) => response.status)).toEqual([200, 400]);
    expect(await responses[1].json()).toEqual({ error: 'Pre-screening already submitted.' });
    expect(stored).toMatchObject({ barrier: answers.barrier, userId: 'member-1' });
    expect(contacts).toEqual({ phone: answers.phone, address: answers.address });
    expect(mocks.tx.user.update).toHaveBeenCalledTimes(1);
    expect(mocks.tx.profile.upsert).toHaveBeenCalledTimes(1);
    await flushAfter();
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.audit).toHaveBeenCalledTimes(1);
    expect(mocks.event).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['an unrelated database failure', Object.assign(new Error('Unavailable'), { code: 'P2024' })],
    ['a unique failure with no saved response', duplicate()],
  ])('does not claim success for %s', async (_name, error) => {
    mocks.tx.preScreeningResponse.create.mockRejectedValue(error);
    expect((await POST(request())).status).toBe(500);
    expect(stored).toBeNull();
    await flushAfter();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('refuses changed or invalid post-completion answers without overwriting the saved response', async () => {
    await POST(request());
    expect((await POST(request({ ...answers, barrier: 'Changed after submit' }))).status).toBe(400);
    expect((await POST(request({ ...answers, phone: '1' }))).status).toBe(400);
    expect(stored).toMatchObject({ barrier: answers.barrier });
    expect(mocks.tx.preScreeningResponse.create).toHaveBeenCalledTimes(1);
    await flushAfter();
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it('compares normalized values and treats omitted optional answers as null', async () => {
    await POST(request({ ...answers, barrier: ` ${answers.barrier} `, phone: ` ${answers.phone} `, address: ` ${answers.address} ` }));
    const retry = await POST(request({ ...answers, hearAboutOther: null }));
    expect(retry.status).toBe(200);
    expect(stored).toMatchObject({ barrier: answers.barrier, hearAboutOther: null });
    expect(mocks.tx.preScreeningResponse.create).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['missing phone', { phone: null }],
    ['missing address', { address: null }],
    ['changed phone', { phone: '5125550199' }],
    ['changed address', { address: '200 Other Street, Austin, TX' }],
  ])('conservatively refuses a retry after %s', async (_label, change) => {
    await POST(request());
    contacts = { ...contacts, ...change };
    expect((await POST(request())).status).toBe(400);
    expect(mocks.tx.user.update).toHaveBeenCalledTimes(1);
    expect(mocks.tx.profile.upsert).toHaveBeenCalledTimes(1);
    await flushAfter();
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it('does not acknowledge an unrelated unique constraint even when a matching response is readable', async () => {
    await POST(request());
    const existing = responseRow();
    mocks.tx.preScreeningResponse.findUnique.mockResolvedValueOnce(null).mockResolvedValue(existing);
    mocks.tx.preScreeningResponse.create.mockRejectedValue(duplicate('id'));
    expect((await POST(request())).status).toBe(500);
    await flushAfter();
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it('does not acknowledge a profile unique failure as a response insert race', async () => {
    await POST(request());
    const readsBefore = mocks.tx.preScreeningResponse.findUnique.mock.calls.length;
    mocks.tx.preScreeningResponse.findUnique.mockResolvedValueOnce(null);
    mocks.tx.preScreeningResponse.create.mockResolvedValueOnce({ id: 'response-2' });
    mocks.tx.profile.upsert.mockRejectedValueOnce(duplicate());
    expect((await POST(request())).status).toBe(500);
    expect(mocks.tx.preScreeningResponse.findUnique).toHaveBeenCalledTimes(readsBefore + 1);
    await flushAfter();
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.audit).toHaveBeenCalledTimes(1);
    expect(mocks.event).toHaveBeenCalledTimes(1);
  });

  it('uses the signed-in member for lookup and writes despite caller-supplied identity fields', async () => {
    const body = { ...answers, userId: 'member-other', organizationId: 'org-other' };
    expect((await POST(request(body))).status).toBe(200);
    expect((await POST(request(body))).status).toBe(200);
    for (const [query] of mocks.tx.preScreeningResponse.findUnique.mock.calls) {
      expect(query.where).toEqual({ userId: 'member-1' });
    }
    expect(stored).toMatchObject({ userId: 'member-1', organizationId: 'org-a' });
    expect(mocks.tx.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'member-1' } }));
    expect(mocks.tx.profile.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'member-1' } }));
    expect(mocks.tx.preScreeningDraft.deleteMany).toHaveBeenCalledWith({ where: { userId: 'member-1' } });
    await flushAfter();
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.audit).toHaveBeenCalledTimes(1);
    expect(mocks.event).toHaveBeenCalledTimes(1);
  });

  it('keeps the completed-preassessment requirement for a new submission', async () => {
    mocks.tx.user.findUnique.mockResolvedValue({ assessmentCompleted: false, organizationId: 'org-a' });
    expect((await POST(request())).status).toBe(400);
    expect(mocks.tx.preScreeningResponse.create).not.toHaveBeenCalled();
  });

  it('keeps validation and authentication ahead of writes', async () => {
    expect((await POST(request({ ...answers, phone: '1' }))).status).toBe(400);
    mocks.getUser.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    expect(mocks.tx.preScreeningResponse.create).not.toHaveBeenCalled();
    await flushAfter();
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
