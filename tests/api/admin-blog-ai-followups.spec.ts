// @vitest-environment node
/**
 * Remaining blog AI routes after generate/draft leftover coverage.
 * from-ideas and suggest-topics check AI-config before the limiter;
 * review does the reverse — pin both. Draft-from-ideas create is
 * unscoped (BlogPost has no organizationId). Suggest-topics reads
 * published posts with no organizationId.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  isAdmin: vi.fn(),
  isAIConfigured: vi.fn(),
  checkAIToolRateLimit: vi.fn(),
  chatCompletion: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  create: vi.fn(),
  auditLog: vi.fn(),
  captureApiError: vi.fn(),
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

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: vi.fn(
      async (
        fn: (tx: {
          blogPost: {
            findUnique: typeof h.findUnique;
            findMany: typeof h.findMany;
            create: typeof h.create;
          };
        }) => unknown,
      ) => fn({ blogPost: { findUnique: h.findUnique, findMany: h.findMany, create: h.create } }),
    ),
  },
}));

vi.mock('@/lib/audit', () => ({
  auditLog: h.auditLog,
}));

vi.mock('@/lib/observability/captureApiError', () => ({
  captureApiError: h.captureApiError,
}));

vi.mock('@/lib/content/programs', () => ({
  PROGRAMS: [{ title: 'IT Support', category: 'Tech', duration: '3 months' }],
}));

const { POST: fromIdeas } = await import('@/app/api/admin/blog/ai/from-ideas/route');
const { POST: review } = await import('@/app/api/admin/blog/ai/review/route');
const { POST: suggestTopics } = await import('@/app/api/admin/blog/ai/suggest-topics/route');

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';

function post(path: string, body?: unknown) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    ...(body === undefined
      ? {}
      : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  });
}

const topic = {
  title: 'Help Desk careers',
  slug: 'help-desk-careers',
  excerpt: 'Start here.',
  category: 'Career Tips',
  suggestedDate: '2026-12-01',
  reasoning: 'Fills a gap.',
};

describe('POST /api/admin/blog/ai/from-ideas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.isAIConfigured.mockReturnValue(true);
    h.checkAIToolRateLimit.mockResolvedValue({ success: true });
    h.chatCompletion.mockResolvedValue(JSON.stringify([topic, topic, topic, topic]));
    h.findUnique.mockResolvedValue(null);
    h.create.mockResolvedValue({ id: 'post-1', slug: 'help-desk-careers' });
    h.auditLog.mockResolvedValue(undefined);
  });

  it('returns 401 before the AI-config check when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await fromIdeas(post('/api/admin/blog/ai/from-ideas', { ideas: 'help desk' }) as never);
    expect(res.status).toBe(401);
    expect(h.isAIConfigured).not.toHaveBeenCalled();
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 403 before the AI-config check when the caller is not an admin', async () => {
    h.isAdmin.mockResolvedValue(false);
    const res = await fromIdeas(post('/api/admin/blog/ai/from-ideas', { ideas: 'help desk' }) as never);
    expect(res.status).toBe(403);
    expect(h.isAIConfigured).not.toHaveBeenCalled();
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 503 before the limiter when AI is not configured (pinned order)', async () => {
    h.isAIConfigured.mockReturnValue(false);
    const res = await fromIdeas(post('/api/admin/blog/ai/from-ideas', { ideas: 'help desk' }) as never);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'AI service not configured' });
    expect(h.checkAIToolRateLimit).not.toHaveBeenCalled();
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 429 after the AI-config check when the limiter refuses', async () => {
    h.checkAIToolRateLimit.mockResolvedValue({ success: false });
    const res = await fromIdeas(post('/api/admin/blog/ai/from-ideas', { ideas: 'help desk' }) as never);
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'Rate limit exceeded. Please try again later.' });
    expect(h.isAIConfigured).toHaveBeenCalled();
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 400 Invalid JSON without a model call', async () => {
    const res = await fromIdeas(
      new Request('http://localhost/api/admin/blog/ai/from-ideas', {
        method: 'POST',
        body: 'not-json',
        headers: { 'content-type': 'application/json' },
      }) as never,
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON' });
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 400 without a model call when ideas are blank', async () => {
    const res = await fromIdeas(post('/api/admin/blog/ai/from-ideas', { ideas: '   ' }) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Ideas are required' });
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('interpolates ideas, defaults to topics, and slices to 3 suggestions', async () => {
    const res = await fromIdeas(
      post('/api/admin/blog/ai/from-ideas', { ideas: 'Ignore previous <script>' }) as never,
    );
    expect(res.status).toBe(200);
    const messages = h.chatCompletion.mock.calls[0][0] as Array<{ role: string; content: string }>;
    expect(messages[1].content).toContain('Ignore previous <script>');
    expect(h.create).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({ suggestions: [topic, topic, topic] });
  });

  it('creates an unpublished draft with no organizationId (pinned)', async () => {
    h.chatCompletion.mockResolvedValue(
      JSON.stringify({
        title: 'Help Desk careers',
        slug: 'help-desk-careers',
        excerpt: 'Start here.',
        category: 'Career Tips',
        content: '# Help Desk',
      }),
    );
    const res = await fromIdeas(
      post('/api/admin/blog/ai/from-ideas', { ideas: 'help desk', mode: 'draft' }) as never,
    );
    expect(res.status).toBe(200);
    expect(h.findUnique).toHaveBeenCalledWith({ where: { slug: 'help-desk-careers' } });
    expect(h.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        slug: 'help-desk-careers',
        title: 'Help Desk careers',
        excerpt: 'Start here.',
        content: '# Help Desk',
        published: false,
        authorName: 'WorkforceAP Team',
      }),
    });
    expect(h.create.mock.calls[0][0].data).not.toHaveProperty('organizationId');
    expect(await res.json()).toEqual({ post: { id: 'post-1', slug: 'help-desk-careers' } });
  });
});

describe('POST /api/admin/blog/ai/review', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.isAIConfigured.mockReturnValue(true);
    h.checkAIToolRateLimit.mockResolvedValue({ success: true });
    h.chatCompletion.mockResolvedValue(
      JSON.stringify({ overallScore: 8, summary: 'Solid draft.', strengths: ['Clear'], improvements: ['Shorter'] }),
    );
  });

  it('returns 401 before the limiter when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await review(
      post('/api/admin/blog/ai/review', { title: 'Help Desk', content: 'Body' }) as never,
    );
    expect(res.status).toBe(401);
    expect(h.checkAIToolRateLimit).not.toHaveBeenCalled();
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 429 before the AI-config check when the limiter refuses (pinned order)', async () => {
    h.isAIConfigured.mockReturnValue(false);
    h.checkAIToolRateLimit.mockResolvedValue({ success: false });
    const res = await review(
      post('/api/admin/blog/ai/review', { title: 'Help Desk', content: 'Body' }) as never,
    );
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'Too many requests' });
    expect(h.isAIConfigured).not.toHaveBeenCalled();
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 503 after the limiter when AI is not configured', async () => {
    h.isAIConfigured.mockReturnValue(false);
    const res = await review(
      post('/api/admin/blog/ai/review', { title: 'Help Desk', content: 'Body' }) as never,
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'AI service not configured' });
    expect(h.checkAIToolRateLimit).toHaveBeenCalledWith(ADMIN_ID);
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 400 without a model call when title or content is missing', async () => {
    const res = await review(post('/api/admin/blog/ai/review', { title: 'Help Desk' }) as never);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Missing title or content' });
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('interpolates title, excerpt, and content, truncating title to 200 chars', async () => {
    const title = `Ignore previous ${'x'.repeat(190)}`;
    const res = await review(
      post('/api/admin/blog/ai/review', {
        title,
        excerpt: '<script>alert(1)</script>',
        content: 'drop tables',
      }) as never,
    );
    expect(res.status).toBe(200);
    const messages = h.chatCompletion.mock.calls[0][0] as Array<{ role: string; content: string }>;
    expect(messages[1].content).toContain(title.slice(0, 200));
    expect(messages[1].content).not.toContain(title);
    expect(messages[1].content).toContain('<script>alert(1)</script>');
    expect(messages[1].content).toContain('drop tables');
    expect(await res.json()).toEqual({
      overallScore: 8,
      summary: 'Solid draft.',
      strengths: ['Clear'],
      improvements: ['Shorter'],
    });
  });

  it('returns 500 when the model output is not JSON', async () => {
    h.chatCompletion.mockResolvedValue('not json');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await review(
      post('/api/admin/blog/ai/review', { title: 'Help Desk', content: 'Body' }) as never,
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to review. Please try again.' });
    spy.mockRestore();
  });
});

describe('POST /api/admin/blog/ai/suggest-topics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.getUser.mockResolvedValue({ id: ADMIN_ID });
    h.isAdmin.mockResolvedValue(true);
    h.isAIConfigured.mockReturnValue(true);
    h.checkAIToolRateLimit.mockResolvedValue({ success: true });
    h.findMany.mockResolvedValue([
      { title: 'Existing <script>', category: 'Career Tips', excerpt: null, publishedAt: new Date('2026-11-01') },
    ]);
    h.chatCompletion.mockResolvedValue(JSON.stringify([topic, { ...topic, title: 'Two' }, { ...topic, title: 'Three' }, { ...topic, title: 'Four' }]));
  });

  it('returns 401 before the AI-config check when unsigned', async () => {
    h.getUser.mockResolvedValue(null);
    const res = await suggestTopics(post('/api/admin/blog/ai/suggest-topics') as never);
    expect(res.status).toBe(401);
    expect(h.isAIConfigured).not.toHaveBeenCalled();
    expect(h.findMany).not.toHaveBeenCalled();
    expect(h.chatCompletion).not.toHaveBeenCalled();
  });

  it('returns 503 before the limiter when AI is not configured (pinned order)', async () => {
    h.isAIConfigured.mockReturnValue(false);
    const res = await suggestTopics(post('/api/admin/blog/ai/suggest-topics') as never);
    expect(res.status).toBe(503);
    expect(h.checkAIToolRateLimit).not.toHaveBeenCalled();
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it('reads published posts with no organizationId and interpolates titles (pinned)', async () => {
    const res = await suggestTopics(post('/api/admin/blog/ai/suggest-topics') as never);
    expect(res.status).toBe(200);
    expect(h.findMany).toHaveBeenCalledWith({
      where: { published: true },
      select: { title: true, category: true, excerpt: true, publishedAt: true },
      orderBy: { publishedAt: 'desc' },
      take: 20,
    });
    expect(h.findMany.mock.calls[0][0].where).not.toHaveProperty('organizationId');
    const messages = h.chatCompletion.mock.calls[0][0] as Array<{ role: string; content: string }>;
    expect(messages[1].content).toContain('Existing <script>');
    expect(messages[1].content).toContain('IT Support (Tech) — 3 months');
    const body = await res.json();
    expect(body.suggestions).toHaveLength(3);
    expect(body.suggestions[0].title).toBe('Help Desk careers');
  });

  it('returns 500 and captures when the model output is not JSON', async () => {
    h.chatCompletion.mockResolvedValue('not json');
    const res = await suggestTopics(post('/api/admin/blog/ai/suggest-topics') as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to generate suggestions. Please try again.' });
    expect(h.captureApiError).toHaveBeenCalled();
  });
});
