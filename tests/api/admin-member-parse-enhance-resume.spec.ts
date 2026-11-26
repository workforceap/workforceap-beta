// @vitest-environment node
/**
 * POST /api/admin/members/parse-resume and /enhance-resume send resume PII
 * to the chat model. Auth, AI-config and rate-limit must fail before the
 * prompt is built. Resume text is untrusted data wrapped in <resume_data>
 * and truncated to 8k; invalid model JSON must not be applied.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  isAIConfigured: vi.fn(),
  checkAIToolRateLimit: vi.fn(),
  chatCompletion: vi.fn(),
  auditLog: vi.fn(),
  logAuditEvent: vi.fn(),
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
  withApiGuc: (handler: unknown) => handler,
}));

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(),
  getUser: h.getUser,
}));

vi.mock('@/lib/auth/roles', () => ({
  isAdmin: h.isAdmin,
}));

vi.mock('@/lib/ai/groq', () => ({
  isAIConfigured: h.isAIConfigured,
  chatCompletion: h.chatCompletion,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkAIToolRateLimit: h.checkAIToolRateLimit,
}));

vi.mock('@/lib/audit', () => ({
  auditLog: h.auditLog,
}));

vi.mock('@/lib/audit/log', () => ({
  auditRequestMeta: () => ({}),
  logAuditEvent: h.logAuditEvent,
}));

const { POST: parseResume } = await import('@/app/api/admin/members/parse-resume/route');
const { POST: enhanceResume } = await import('@/app/api/admin/members/enhance-resume/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const RESUME = 'Pat Lee\nNetwork technician supporting campus users and backups.';

function post(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('POST /api/admin/members/parse-resume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.isAIConfigured.mockReturnValue(true);
    h.checkAIToolRateLimit.mockResolvedValue({ success: true });
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
    h.chatCompletion.mockResolvedValue(
      JSON.stringify({
        extracted_name: 'Pat Lee',
        extracted_email: 'pat@example.test',
        extracted_phone: '',
        extracted_jobs: [{ title: 'Technician', employer: 'Acme', dates: '2020-2024' }],
        extracted_skills: ['SQL'],
        extracted_education: [],
      }),
    );
  });

  it('returns 401 before the model when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await parseResume(post('/api/admin/members/parse-resume', { resume: RESUME }) as never);
    expect(res.status).toBe(401);
    expect(h.isAIConfigured).not.toHaveBeenCalled();
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 403 before the model when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await parseResume(post('/api/admin/members/parse-resume', { resume: RESUME }) as never);
    expect(res.status).toBe(403);
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 503 before rate-limit when AI is not configured', async () => {
    h.isAIConfigured.mockReturnValue(false);
    const res = await parseResume(post('/api/admin/members/parse-resume', { resume: RESUME }) as never);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'AI not configured' });
    expect(h.checkAIToolRateLimit).not.toHaveBeenCalled();
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 429 before the prompt when the AI tool limiter refuses', async () => {
    h.checkAIToolRateLimit.mockResolvedValue({ success: false });
    const res = await parseResume(post('/api/admin/members/parse-resume', { resume: RESUME }) as never);
    expect(res.status).toBe(429);
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 400 without a model call when resume text is missing', async () => {
    const res = await parseResume(post('/api/admin/members/parse-resume', { resume: '   ' }) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Resume text is required' });
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('wraps untrusted resume text in resume_data tags and truncates to 8000 characters', async () => {
    const longResume = `${'A'.repeat(8000)}SECRET`;
    const res = await parseResume(post('/api/admin/members/parse-resume', { resume: longResume }) as never);
    expect(res.status).toBe(200);
    const messages = h.chatCompletion.mock.calls[0][0] as Array<{ role: string; content: string }>;
    expect(messages[1].content.startsWith('<resume_data>\n')).toBe(true);
    expect(messages[1].content.endsWith('\n</resume_data>')).toBe(true);
    expect(messages[1].content).toContain('A'.repeat(8000));
    expect(messages[1].content).not.toContain('SECRET');
    expect(await res.json()).toEqual({
      extracted: {
        extracted_name: 'Pat Lee',
        extracted_email: 'pat@example.test',
        extracted_phone: '',
        extracted_jobs: [{ title: 'Technician', employer: 'Acme', dates: '2020-2024' }],
        extracted_skills: ['SQL'],
        extracted_education: [],
      },
      reviewRequired: true,
    });
  });

  it('returns 422 without applying extra model fields', async () => {
    h.chatCompletion.mockResolvedValue(JSON.stringify({ extracted_name: 'Pat', extra: true }));
    const res = await parseResume(post('/api/admin/members/parse-resume', { resume: RESUME }) as never);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: 'Resume extraction returned an invalid structure. Nothing was applied.',
    });
    expect(h.auditLog).not.toHaveBeenCalled();
  });

  it('returns 500 Failed to parse resume when the model output is not JSON', async () => {
    h.chatCompletion.mockResolvedValue('not json');
    const res = await parseResume(post('/api/admin/members/parse-resume', { resume: RESUME }) as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to parse resume' });
  });
});

describe('POST /api/admin/members/enhance-resume', () => {
  const improved = 'Professional summary. Experience supporting campus networks and users for several years.';

  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.isAIConfigured.mockReturnValue(true);
    h.checkAIToolRateLimit.mockResolvedValue({ success: true });
    h.auditLog.mockResolvedValue(undefined);
    h.logAuditEvent.mockResolvedValue(undefined);
    h.chatCompletion.mockResolvedValue(
      `IMPROVED RESUME:\n${improved}\nIMPROVEMENT SUMMARY:\n- Stronger verbs`,
    );
  });

  it('returns 401 before the model when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await enhanceResume(
      post('/api/admin/members/enhance-resume', { resume: RESUME }) as never,
    );
    expect(res.status).toBe(401);
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 403 before the model when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await enhanceResume(
      post('/api/admin/members/enhance-resume', { resume: RESUME }) as never,
    );
    expect(res.status).toBe(403);
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('interpolates programTitle into the system prompt and wraps the resume', async () => {
    const res = await enhanceResume(
      post('/api/admin/members/enhance-resume', {
        resume: RESUME,
        programTitle: 'Cyber <script>',
      }) as never,
    );
    expect(res.status).toBe(200);
    const messages = h.chatCompletion.mock.calls[0][0] as Array<{ role: string; content: string }>;
    expect(messages[0].content).toContain('Cyber <script>');
    expect(messages[1].content).toContain(`<resume_data>\n${RESUME}\n</resume_data>`);
    const body = await res.json();
    expect(body.enhancedResume).toContain('Professional summary');
    expect(body.improvementSummary.some((line: string) => line.includes('Stronger verbs'))).toBe(true);
  });

  it('returns 422 and keeps the original when the model returns unreadable text', async () => {
    h.chatCompletion.mockResolvedValue('IMPROVED RESUME:\nshort\nIMPROVEMENT SUMMARY:\n- x');
    const res = await enhanceResume(
      post('/api/admin/members/enhance-resume', { resume: RESUME }) as never,
    );
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: 'AI did not return a readable resume. The original was kept.',
    });
    expect(h.auditLog).not.toHaveBeenCalled();
  });
});
