import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { chatCompletion, isAIConfigured } from '@/lib/ai/groq';
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
  
    const ideas = typeof (body as { ideas?: unknown }).ideas === 'string'
      ? (body as { ideas: string }).ideas.trim()
      : '';
    const mode = (body as { mode?: string }).mode === 'draft' ? 'draft' : 'topics';
  
    if (!ideas) {
      return NextResponse.json({ error: 'Ideas are required' }, { status: 400 });
    }
  
    if (mode === 'topics') {
      const systemPrompt = `You are a content strategist for WorkforceAP, a workforce development organization in Austin TX. Based on the counselor's ideas below, suggest exactly 3 blog post topics.
  
  Output a JSON array of 3 objects. Each object must have:
  - title: string
  - slug: string (URL-friendly, lowercase, hyphens)
  - excerpt: string (1-2 sentences)
  - category: string (Career Tips, Program Spotlight, Success Stories, or Local)
  - suggestedDate: string (YYYY-MM-DD, within next 30 days)
  - reasoning: string (1 sentence)
  
  Output ONLY the JSON array, no other text.`;
  
      try {
        const output = await chatCompletion(
          [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Ideas:\n${ideas}` },
          ],
          { maxTokens: 1200, temperature: 0.8 }
        );
  
        if (!output) return NextResponse.json({ error: 'No response from AI' }, { status: 500 });
  
        const cleaned = output.replace(/```json?\s*/g, '').replace(/```\s*$/g, '').trim();
        const parsed = JSON.parse(cleaned) as Array<{
          title: string;
          slug: string;
          excerpt: string;
          category: string;
          suggestedDate?: string;
          reasoning: string;
        }>;
  
        if (!Array.isArray(parsed) || parsed.length === 0) {
          return NextResponse.json({ error: 'Invalid AI response format' }, { status: 500 });
        }
  
        return NextResponse.json({ suggestions: parsed.slice(0, 3) });
      } catch (err) {
        console.error('Blog from-ideas topics error:', err);
        return NextResponse.json(
          { error: 'Failed to generate topics. Please try again.' },
          { status: 500 }
        );
      }
    }
  
    // mode === 'draft'
    const systemPrompt = `You are a blog writer for WorkforceAP, a no-cost career training program in Austin TX. Based on the ideas below, write a full blog post.
  
  Return a JSON object with: title, slug (URL-friendly), excerpt, category, content (markdown, 350-450 words).
  Use "no-cost training for members" if relevant. Be authentic and specific.`;
  
    try {
      const output = await chatCompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Ideas:\n${ideas}` },
        ],
        { maxTokens: 2000, temperature: 0.7 }
      );
  
      if (!output) return NextResponse.json({ error: 'No response from AI' }, { status: 500 });
  
      const cleaned = output.replace(/```json?\s*/g, '').replace(/```\s*$/g, '').trim();
      const parsed = JSON.parse(cleaned) as {
        title?: string;
        slug?: string;
        excerpt?: string;
        category?: string;
        content?: string;
      };
  
      const title = parsed.title?.trim() || 'Untitled Post';
      const slugRaw = parsed.slug?.trim() || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const slugUnique = await uniqueSlug(slugRaw);
      const content = parsed.content?.trim() || '';
  
      const post = await prisma.$transaction((tx) => tx.blogPost.create({
        data: {
          slug: slugUnique,
          title,
          excerpt: parsed.excerpt?.trim() || null,
          content: content || '(Content to be added)',
          authorName: 'WorkforceAP Team',
          category: parsed.category?.trim() || null,
          published: false,
        },
      }));

      void auditLog({
        actorUserId: user.id,
        action: 'admin_blog_ai_draft_create',
        targetType: 'blog_post',
        targetId: post.id,
        metadata: { slug: post.slug, source: 'ai_from_ideas' },
      }).catch(() => {});

      return NextResponse.json({ post: { id: post.id, slug: post.slug } });
    } catch (err) {
      console.error('Blog from-ideas draft error:', err);
      return NextResponse.json(
        { error: 'Failed to create draft. Please try again.' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('/admin/blog/ai/from-ideas:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

async function uniqueSlug(base: string): Promise<string> {
  const existing = await prisma.$transaction((tx) => tx.blogPost.findUnique({ where: { slug: base } }));
  if (!existing) return base;
  return `${base}-${Date.now().toString(36)}`;
}
