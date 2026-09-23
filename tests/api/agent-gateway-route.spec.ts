import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeAgentGatewaySession: vi.fn(),
  createMemberAgentGatewayForPrincipal: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('@/lib/agents/gateway/sessionStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agents/gateway/sessionStore')>();
  return {
    ...actual,
    authorizeAgentGatewaySession: mocks.authorizeAgentGatewaySession,
  };
});

vi.mock('@/lib/agents/gateway/server', () => ({
  createMemberAgentGatewayForPrincipal: mocks.createMemberAgentGatewayForPrincipal,
}));

import { POST } from '@/app/api/agent-tools/v1/[tool]/route';

function request(body: unknown = {}, authorization = 'Bearer wap_ag_test') {
  return new Request('https://www.workforceap.org/api/agent-tools/v1/get_training_status', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization,
    },
    body: JSON.stringify(body),
  });
}

const context = (tool: string) => ({ params: Promise.resolve({ tool }) });

describe('agent gateway provider route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeAgentGatewaySession.mockResolvedValue({
      version: 1,
      userId: 'member-1',
      organizationId: 'org-1',
      role: 'admin',
      issuer: 'vercel:project:production',
      agentKey: 'counselor',
      allowedTools: ['get_training_status'],
      issuedAt: '2026-08-31T12:00:00.000Z',
      expiresAt: '2026-08-31T12:30:00.000Z',
    });
    mocks.invoke.mockResolvedValue({
      status: 'ok',
      asOf: '2026-08-31T12:01:00.000Z',
      source: { system: 'workforceap', records: ['course_progress'], mode: 'read_only', freshThrough: null },
      data: { progressPercent: 25 },
      memberFacingMessage: 'Your training is 25% complete.',
      handoff: { recommended: false, destination: 'portal', href: '/dashboard/program', reason: null },
    });
    mocks.createMemberAgentGatewayForPrincipal.mockResolvedValue({ invoke: mocks.invoke });
  });

  it('uses only the token-owned member and organization principal', async () => {
    const response = await POST(request(), context('get_training_status'));

    expect(response.status).toBe(200);
    expect(mocks.authorizeAgentGatewaySession).toHaveBeenCalledWith(
      'wap_ag_test',
      'get_training_status',
    );
    expect(mocks.createMemberAgentGatewayForPrincipal).toHaveBeenCalledWith({
      userId: 'member-1',
      organizationId: 'org-1',
      role: 'admin',
    });
    expect(mocks.invoke).toHaveBeenCalledWith({ tool: 'get_training_status' });
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('rejects model-supplied identity or any other arguments before authorization', async () => {
    const response = await POST(
      request({ userId: 'victim', organizationId: 'other-org' }),
      context('get_training_status'),
    );

    expect(response.status).toBe(400);
    expect(mocks.authorizeAgentGatewaySession).not.toHaveBeenCalled();
    expect(mocks.createMemberAgentGatewayForPrincipal).not.toHaveBeenCalled();
  });

  it('rejects an oversized request body before authorization', async () => {
    const response = await POST(
      request({ padding: 'x'.repeat(5_000) }),
      context('get_training_status'),
    );

    expect(response.status).toBe(400);
    expect(mocks.authorizeAgentGatewaySession).not.toHaveBeenCalled();
    expect(mocks.createMemberAgentGatewayForPrincipal).not.toHaveBeenCalled();
  });

  it('rejects missing bearer authentication and unknown tools', async () => {
    const unauthorized = await POST(request({}, ''), context('get_training_status'));
    const unknown = await POST(request(), context('delete_member'));

    expect(unauthorized.status).toBe(401);
    expect(unknown.status).toBe(404);
    expect(mocks.createMemberAgentGatewayForPrincipal).not.toHaveBeenCalled();
  });

  it('fails closed when the token principal is no longer in tenant scope', async () => {
    mocks.createMemberAgentGatewayForPrincipal.mockResolvedValue(null);
    const response = await POST(request(), context('get_training_status'));

    expect(response.status).toBe(403);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
});
