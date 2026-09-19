import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createScreening: vi.fn(),
  updateScreening: vi.fn(),
  getDefaultOrganizationId: vi.fn(),
  sendNotification: vi.fn(),
  qualificationLimit: vi.fn(),
  voiceLimit: vi.fn(),
  startVoiceSession: vi.fn(),
}));

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      }),
  },
}));

vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: (request: Request) => Promise<Response>) => handler,
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    publicWioaScreening: {
      create: mocks.createScreening,
      update: mocks.updateScreening,
    },
  },
}));

vi.mock('@/lib/tenant/organization', () => ({
  getDefaultOrganizationId: mocks.getDefaultOrganizationId,
}));

vi.mock('@/lib/wioa/wioaNotification', () => ({
  sendWioaScreeningNotification: mocks.sendNotification,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkPublicWioaQualificationRateLimit: mocks.qualificationLimit,
  checkPublicVoiceSessionRateLimit: mocks.voiceLimit,
}));

vi.mock('@/lib/ai/elevenlabsAgents', () => ({
  startElevenLabsPortalSession: mocks.startVoiceSession,
}));

vi.mock('@/lib/ai/elevenlabsPortalContext', () => ({
  buildPublicWioaPortalDynamicVariables: vi.fn((payload) => payload),
}));

import { POST as submitQualification } from '@/app/api/public/wioa-qualification/route';
import { POST as startVoiceSession } from '@/app/api/public/wioa-qualification/voice-session/route';

const validQualification = {
  contact: {
    fullName: 'Jamie Student',
    email: 'jamie@example.com',
    phone: '512-555-0100',
  },
  ageBracket: '25_54',
  countyOrZip: '78701',
  primaryBarrier: 'transportation',
  dislocatedWorker: true,
  lowIncomeSelfReport: false,
  trainingInterest: true,
  completedIntakeSelfReport: false,
};

function jsonRequest(path: string, body: unknown, headers: HeadersInit = {}) {
  return new Request(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('public WIOA qualification persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.qualificationLimit.mockResolvedValue({ success: true });
    mocks.voiceLimit.mockResolvedValue({ success: true });
    mocks.getDefaultOrganizationId.mockResolvedValue('org-1');
    mocks.createScreening.mockResolvedValue({ id: 'screening-1' });
    mocks.updateScreening.mockResolvedValue({ id: 'screening-1' });
    mocks.sendNotification.mockResolvedValue(true);
    mocks.startVoiceSession.mockResolvedValue({
      signedUrl: 'wss://example.test/session',
      expiresAt: '2026-08-29T18:00:00.000Z',
      dynamicVariables: {},
    });
  });

  it('fails closed and does not notify staff when the screening cannot be saved', async () => {
    mocks.createScreening.mockRejectedValueOnce(new Error('database unavailable'));

    const response = await submitQualification(
      jsonRequest('/api/public/wioa-qualification', validQualification)
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: 'We could not save your screening. Please try again.', errorCode: 'save_failed' });
    expect(mocks.sendNotification).not.toHaveBeenCalled();
    expect(mocks.updateScreening).not.toHaveBeenCalled();
  });

  it('persists before notifying and records confirmed email delivery', async () => {
    const response = await submitQualification(
      jsonRequest('/api/public/wioa-qualification', validQualification)
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.emailSent).toBe(true);
    expect(body.snapshot.version).toBe(2);
    expect(body.snapshot.reasons).toEqual([{ code: 'dislocated_worker' }, { code: 'barrier', params: { barrier: 'transportation' } }, { code: 'training_interest' }]);
    expect(mocks.createScreening.mock.calls[0][0].data.snapshot).toEqual(body.snapshot);
    expect(mocks.createScreening).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: 'jamie@example.com', emailSent: false }),
        select: { id: true },
      })
    );
    expect(mocks.createScreening.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.sendNotification.mock.invocationCallOrder[0]
    );
    expect(mocks.updateScreening).toHaveBeenCalledWith({
      where: { id: 'screening-1' },
      data: { emailSent: true },
    });
  });

  it('keeps a saved screening reviewable when staff email delivery fails', async () => {
    mocks.sendNotification.mockResolvedValueOnce(false);

    const response = await submitQualification(
      jsonRequest('/api/public/wioa-qualification', validQualification)
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.emailSent).toBe(false);
    expect(mocks.createScreening).toHaveBeenCalledTimes(1);
    expect(mocks.updateScreening).not.toHaveBeenCalled();
  });

  it('does not trust a caller-controlled X-Forwarded-For value for voice throttling', async () => {
    const response = await startVoiceSession(
      jsonRequest(
        '/api/public/wioa-qualification/voice-session',
        { fullName: 'Jamie Student' },
        { 'x-forwarded-for': '203.0.113.10' }
      ) as Parameters<typeof startVoiceSession>[0]
    );

    expect(response.status).toBe(200);
    expect(mocks.voiceLimit).toHaveBeenCalledWith('public-wioa-voice:unknown');
  });

  it('uses Vercel trusted client identity for voice throttling', async () => {
    const response = await startVoiceSession(
      jsonRequest(
        '/api/public/wioa-qualification/voice-session',
        {},
        {
          'x-forwarded-for': '203.0.113.10',
          'x-vercel-forwarded-for': '198.51.100.25',
        }
      ) as Parameters<typeof startVoiceSession>[0]
    );

    expect(response.status).toBe(200);
    expect(mocks.voiceLimit).toHaveBeenCalledWith('public-wioa-voice:198.51.100.25');
  });
});
