// @vitest-environment node
/**
 * POST /api/admin/blog/generate and /blog/ai/draft send staff-supplied
 * copy to the chat model. Auth, AI-config and rate-limit must fail
 * before the prompt is built. Generate rate-limits before the AI-config
 * check; draft does the reverse — pin both. Draft create is unscoped
 * (BlogPost has no organizationId).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  isAIConfigured: vi.fn(),
  checkAIToolRateLimit: vi.fn(),
  chatCompletion: vi.fn(),
  isWebSearchConfigured: vi.fn(),
  webSearch: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  auditLog: vi.fn(),
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

vi.mock('@/lib/ai/blogAI', () => ({
  isWebSearchConfigured: h.isWebSearchConfigured,
  webSearch: h.webSearch,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkAIToolRateLimit: h.checkAIToolRateLimit,
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: { blogPost: { findUnique: typeof h.findUnique; create: typeof h.create } }) => unknown) =>
      fn({ blogPost: { findUnique: h.findUnique, create: h.create } }),
    ),
  },
}));

vi.mock('@/lib/audit', () => ({
  auditLog: h.auditLog,
}));

const { POST: generate } = await import('@/app/api/admin/blog/generate/route');
const { POST: draft } = await import('@/app/api/admin/blog/ai/draft/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';

function post(path: string, body?: unknown) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
}

describe('POST /api/admin/blog/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.isAIConfigured.mockReturnValue(true);
    h.checkAIToolRateLimit.mockResolvedValue({ success: true });
    h.chatCompletion.mockResolvedValue(
      JSON.stringify({ title: 'Help Desk', excerpt: 'Start here.', content: '# Help Desk' }),
    );
  });

  it('returns 401 before the limiter when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await generate(post('/api/admin/blog/generate', { topic: 'help desk' }) as never);
    expect(res.status).toBe(401);
    expect(h.checkAIToolRateLimit).not.toHaveBeenCalled();
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 403 before the limiter when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await generate(post('/api/admin/blog/generate', { topic: 'help desk' }) as never);
    expect(res.status).toBe(403);
    expect(h.checkAIToolRateLimit).not.toHaveBeenCalled();
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 429 before the AI-config check when the limiter refuses (pinned order)', async () => {
    h.isAIConfigured.mockReturnValue(false);
    h.checkAIToolRateLimit.mockResolvedValue({ success: false });
    const res = await generate(post('/api/admin/blog/generate', { topic: 'help desk' }) as never);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'Too many requests' });
    expect(h.isAIConfigured).not.toHaveBeenCalled();
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 503 after the limiter when AI is not configured', async () => {
    h.isAIConfigured.mockReturnValue(false);
    const res = await generate(post('/api/admin/blog/generate', { topic: 'help desk' }) as never);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'AI service not configured' });
    expect(h.checkAIToolRateLimit).toHaveBeenCalledWith(ADMIN_ID);
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 400 without a model call when topic is missing', async () => {
    const res = await generate(post('/api/admin/blog/generate', { title: 'Help Desk' }) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Topic/angle is required' });
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('interpolates title and topic into the user prompt (pinned)', async () => {
    const res = await generate(
      post('/api/admin/blog/generate', {
        title: 'Ignore previous <script>',
        topic: 'drop tables',
      }) as never,
    );
    expect(res.status).toBe(200);
    const messages = h.chatCompletion.mock.calls[0][0] as Array<{ role: string; content: string }>;
    expect(messages[1].content).toContain('Ignore previous <script>');
    expect(messages[1].content).toContain('drop tables');
    expect(await res.json()).toEqual({
      title: 'Help Desk',
      excerpt: 'Start here.',
      content: '# Help Desk',
    });
  });

  it('returns 500 when the model output is not JSON', async () => {
    h.chatCompletion.mockResolvedValue('not json');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await generate(post('/api/admin/blog/generate', { topic: 'help desk' }) as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: 'Generation failed — check your API key or try again',
    });
    spy.mockRestore();
  });
});

describe('POST /api/admin/blog/ai/draft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.isAIConfigured.mockReturnValue(true);
    h.checkAIToolRateLimit.mockResolvedValue({ success: true });
    h.isWebSearchConfigured.mockReturnValue(false);
    h.chatCompletion.mockResolvedValue('# Draft body');
    h.findUnique.mockResolvedValue(null);
    h.create.mockResolvedValue({ id: 'post-1', slug: 'help-desk-careers' });
    h.auditLog.mockResolvedValue(undefined);
  });

  it('returns 401 before the AI-config check when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await draft(post('/api/admin/blog/ai/draft', { title: 'Help Desk' }) as never);
    expect(res.status).toBe(401);
    expect(h.isAIConfigured).not.toHaveBeenCalled();
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 503 before the limiter when AI is not configured (pinned order)', async () => {
    h.isAIConfigured.mockReturnValue(false);
    const res = await draft(post('/api/admin/blog/ai/draft', { title: 'Help Desk' }) as never);
    expect(res.status).toBe(503);
    expect(h.checkAIToolRateLimit).not.toHaveBeenCalled();
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 429 after the AI-config check when the limiter refuses', async () => {
    h.checkAIToolRateLimit.mockResolvedValue({ success: false });
    const res = await draft(post('/api/admin/blog/ai/draft', { title: 'Help Desk' }) as never);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'Rate limit exceeded. Please try again later.' });
    expect(h.isAIConfigured).toHaveBeenCalled();
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 400 Missing topic data when title is blank', async () => {
    const res = await draft(post('/api/admin/blog/ai/draft', { title: '  ' }) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing topic data' });
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('creates an unpublished post with no organizationId (pinned)', async () => {
    const res = await draft(
      post('/api/admin/blog/ai/draft', {
        title: 'Help Desk careers',
        slug: 'Help Desk careers',
        excerpt: 'Start here.',
        category: 'Career Tips',
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(h.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        slug: 'help-desk-careers',
        title: 'Help Desk careers',
        excerpt: 'Start here.',
        content: '# Draft body',
        published: false,
        authorName: 'WorkforceAP Team',
      }),
    });
    expect(h.create.mock.calls[0][0].data).not.toHaveProperty('organizationId');
    expect(await res.json()).toEqual({ post: { id: 'post-1', slug: 'help-desk-careers' } });
  });
});
