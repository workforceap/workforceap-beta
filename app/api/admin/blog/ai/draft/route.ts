import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { chatCompletion, isAIConfigured } from '@/lib/ai/groq';
import { webSearch, isWebSearchConfigured } from '@/lib/ai/blogAI';
import { checkAIToolRateLimit } from '@/lib/rate-limit';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
export const POST = withApiGuc(async (request: Request) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isAdmin(user.id)))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (!isAIConfigured())
      return NextResponse.json({ error: 'AI service not configured' }, { status: 503 });

    const { success: withinLimit } = await checkAIToolRateLimit(user.id);
    if (!withinLimit) return NextResponse.json({ error: 'Rate limit exceeded. Please try again later.' }, { status: 429 });

    let body: unknown;
    try {
      body = await request.json();
      if (!body || typeof body !== 'object') throw new Error('Body must be a JSON object');
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
  
    const parsed = parseBody(body);
    if (!parsed) {
      return NextResponse.json({ error: 'Missing topic data' }, { status: 400 });
    }
  
    const { title, slug, excerpt, category, reasoning } = parsed;
  
    let webContext = '';
    if (isWebSearchConfigured()) {
      webContext = await webSearch(`${title} workforce development career 2025`, 4);
      if (webContext) {
        webContext = `\n\nRecent web context (use for current stats, trends):\n---\n${webContext}\n---`;
      }
    }
  
    const systemPrompt = `You are a blog writer for WorkforceAP, a workforce development organization in Austin TX. We offer 20 career programs (tech, healthcare, business, skilled trades). Our blog is warm, practical, and aimed at job seekers considering career change.
  
  Write a full blog post in Markdown. Requirements:
  - 350-450 words
  - Use **bold** for emphasis, ## for subheadings
  - Include practical advice, stats, or examples when relevant
  - End with a brief CTA to apply or explore programs
  - Tone: encouraging, professional, not salesy
  - Do not invent specific salary numbers unless from provided context
  - Do not use placeholder text like [insert X]`;
  
    const userPrompt = `Topic: ${title}
  Category: ${category}
  Excerpt/angle: ${excerpt}
  Reasoning: ${reasoning}` + webContext + `
  
  Write the full blog post in Markdown.`;
  
    try {
      const content = await chatCompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { maxTokens: 2000, temperature: 0.7 }
      );
  
      if (!content) return NextResponse.json({ error: 'No response from AI' }, { status: 500 });
  
      const slugClean = slug
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const slugFinal = slugClean || `blog-${Date.now()}`;
  
      const existing = await prisma.$transaction((tx) => tx.blogPost.findUnique({ where: { slug: slugFinal } }));
      const slugUnique = existing ? `${slugFinal}-${Date.now().toString(36)}` : slugFinal;
  
      const post = await prisma.$transaction((tx) => tx.blogPost.create({
        data: {
          slug: slugUnique,
          title: title.trim(),
          excerpt: excerpt?.trim() || null,
          content: content.trim(),
          coverImage: null,
          authorName: 'WorkforceAP Team',
          category: category?.trim() || null,
          published: false,
        },
      }));

      void auditLog({
        actorUserId: user.id,
        action: 'admin_blog_ai_draft_create',
        targetType: 'blog_post',
        targetId: post.id,
        metadata: { slug: post.slug, source: 'ai_draft' },
      }).catch(() => {});

      return NextResponse.json({ post: { id: post.id, slug: post.slug } });
    } catch (err) {
      console.error('Blog AI draft error:', err);
      return NextResponse.json(
        { error: 'Failed to create draft. Please try again.' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('/admin/blog/ai/draft:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

function parseBody(body: unknown): {
  title: string;
  slug: string;
  excerpt: string;
  category: string;
  reasoning: string;
} | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  const title = typeof o.title === 'string' ? o.title.trim() : null;
  const slug = typeof o.slug === 'string' ? o.slug.trim() : '';
  const excerpt = typeof o.excerpt === 'string' ? o.excerpt.trim() : '';
  const category = typeof o.category === 'string' ? o.category.trim() : '';
  const reasoning = typeof o.reasoning === 'string' ? o.reasoning.trim() : '';
  if (!title) return null;
  return { title, slug, excerpt, category, reasoning };
}
