import { describe, expect, it, vi } from 'vitest';
import type { Resend } from 'resend';
vi.mock('@/lib/email/unsubscribeToken', () => ({ buildUnsubscribeUrl: () => 'https://www.workforceap.org/api/unsubscribe?t=x' }));
import { MemberEmailOutcomeUncertainError, sendBrandedEmail } from '@/lib/email/send';
import { MemberUploadLifecycleError } from '@/lib/member/uploadLifecycle';

const args = {
  from: 'WorkforceAP <hello@workforceap.org>',
  to: 'employer@workforceap.org',
  subject: 'Candidate matches',
  html: '<p>Candidate details</p>',
  subjectMemberIds: ['member-z', 'member-a'],
  memberEffectClaim: true,
};

function claimSeam() {
  const held = new Set<string>();
  const keys = new Map<string, string>();
  return {
    held,
    keys,
    begin: vi.fn(async (id: string, key: string) => { held.add(id); keys.set(id, key); return `token-${id}`; }),
    release: vi.fn(async (id: string) => { held.delete(id); }),
  };
}

function options(memberClaim: ReturnType<typeof claimSeam>) {
  return {
    memberClaim,
    subjectIsActive: async () => true,
    sendLogStore: { record: async () => {} },
  };
}

describe('durable member email claims', () => {
  it('acquires every subject before provider I/O and accepts even if claim release fails', async () => {
    const claim = claimSeam();
    claim.release.mockImplementationOnce(async () => { throw new Error('release unavailable'); });
    const provider = vi.fn(async (_payload: unknown, options: { idempotencyKey: string }) => {
      expect([...claim.held].sort()).toEqual(['member-a', 'member-z']);
      expect([...claim.keys.values()]).toEqual([options.idempotencyKey, options.idempotencyKey]);
      expect(options.idempotencyKey).toMatch(/^email\/[0-9a-f]{64}$/);
      return { data: { id: 'accepted' }, error: null };
    });
    const resend = { emails: { send: provider } } as unknown as Resend;
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const result = await sendBrandedEmail(resend, args, options(claim));
      expect(result.data?.id).toBe('accepted');
      expect(claim.begin.mock.calls.map(([id]) => id)).toEqual(['member-a', 'member-z']);
      expect(claim.release).toHaveBeenCalledTimes(2);
      expect(errorLog).toHaveBeenCalled();
    } finally {
      errorLog.mockRestore();
    }
  });

  it('records a caller-supplied exact provider key in every claim before egress', async () => {
    const claim = claimSeam();
    const key = 'match-job/synthetic-attempt-1';
    const provider = vi.fn(async (_payload: unknown, options: { idempotencyKey: string }) => {
      expect(options.idempotencyKey).toBe(key);
      expect([...claim.keys.entries()]).toEqual([['member-a', key], ['member-z', key]]);
      return { data: { id: 'accepted' }, error: null };
    });
    const resend = { emails: { send: provider } } as unknown as Resend;
    await sendBrandedEmail(resend, { ...args, idempotencyKey: key }, options(claim));
    expect(provider).toHaveBeenCalledOnce();
  });

  it('skips an inactive subject and releases an earlier claim before provider I/O', async () => {
    const claim = claimSeam();
    claim.begin.mockImplementation(async (id: string) => {
      if (id === 'member-z') throw new MemberUploadLifecycleError();
      claim.held.add(id);
      return `token-${id}`;
    });
    const provider = vi.fn();
    const resend = { emails: { send: provider } } as unknown as Resend;

    const result = await sendBrandedEmail(resend, args, options(claim));
    expect(result).toMatchObject({ skipped: true, reason: 'inactive_member' });
    expect(provider).not.toHaveBeenCalled();
    expect(claim.release).toHaveBeenCalledWith('member-a', 'token-member-a');
    expect(claim.held.size).toBe(0);
  });

  it('fails closed on claim database errors and never enters the provider', async () => {
    const claim = claimSeam();
    claim.begin.mockRejectedValueOnce(new Error('claim database unavailable'));
    const provider = vi.fn();
    const resend = { emails: { send: provider } } as unknown as Resend;

    await expect(sendBrandedEmail(resend, args, options(claim))).rejects.toThrow('claim database unavailable');
    expect(provider).not.toHaveBeenCalled();
  });

  it('does not turn unavailable interactive transactions into an inactive-member skip', async () => {
    const claim = claimSeam();
    claim.begin.mockRejectedValueOnce(new MemberUploadLifecycleError('transactions_unavailable'));
    const provider = vi.fn();
    const resend = { emails: { send: provider } } as unknown as Resend;

    await expect(sendBrandedEmail(resend, args, options(claim)))
      .rejects.toMatchObject({ name: 'MemberUploadLifecycleError', reason: 'transactions_unavailable' });
    expect(provider).not.toHaveBeenCalled();
  });

  it('reports a prior ambiguous provider attempt while releasing settled claims', async () => {
    const claim = claimSeam();
    const statuses: string[] = [];
    let activeChecks = 0;
    const provider = vi.fn(async () => ({
      data: null,
      error: { name: 'application_error', message: 'Upstream timeout', statusCode: 503 },
    }));
    const resend = { emails: { send: provider } } as unknown as Resend;

    await expect(sendBrandedEmail(resend, args, {
      ...options(claim),
      subjectIsActive: async () => ++activeChecks <= 2,
      sleep: async () => {},
      sendLogStore: { record: async (entry) => { statuses.push(entry.status); } },
    })).rejects.toBeInstanceOf(MemberEmailOutcomeUncertainError);

    expect(provider).toHaveBeenCalledTimes(1);
    expect(statuses.at(-1)).toBe('failed');
    expect(statuses).not.toContain('skipped');
    expect(claim.release).toHaveBeenCalledTimes(2);
    expect(claim.held.size).toBe(0);
  });

  it('releases claims on a definite validation rejection', async () => {
    const claim = claimSeam();
    const provider = vi.fn(async () => ({
      data: null,
      error: { name: 'validation_error', message: 'Bad recipient', statusCode: 422 },
    }));
    const resend = { emails: { send: provider } } as unknown as Resend;

    await expect(sendBrandedEmail(resend, args, options(claim))).rejects.toThrow('Bad recipient');
    expect(claim.release).toHaveBeenCalledTimes(2);
  });

  it('treats a first-attempt 429 with status_code as a definite rejection', async () => {
    const claim = claimSeam();
    const provider = vi.fn(async () => ({
      data: null,
      error: { name: 'rate_limit_exceeded', message: 'Too many requests', status_code: 429 },
    }));
    const resend = { emails: { send: provider } } as unknown as Resend;

    await expect(sendBrandedEmail(resend, args, { ...options(claim), deadlineAtMs: 0 }))
      .rejects.toThrow('Too many requests');
    expect(claim.release).toHaveBeenCalledTimes(2);
  });
});
