import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { chatCompletion, isAIConfigured } from '@/lib/ai/groq';
import { PROGRAMS } from '@/lib/content/programs';
import { captureApiError } from '@/lib/observability/captureApiError';
import { checkAIToolRateLimit } from '@/lib/rate-limit';

import { withApiGuc } from '@/lib/db/withRequestGuc';
export const POST = withApiGuc(async () => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isAdmin(user.id)))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (!isAIConfigured())
      return NextResponse.json({ error: 'AI service not configured' }, { status: 503 });

    const { success: withinLimit } = await checkAIToolRateLimit(user.id);
    if (!withinLimit) return NextResponse.json({ error: 'Rate limit exceeded. Please try again later.' }, { status: 429 });
  
    const posts = await prisma.$transaction((tx) => tx.blogPost.findMany({
      where: { published: true },
      select: { title: true, category: true, excerpt: true, publishedAt: true },
      orderBy: { publishedAt: 'desc' },
      take: 20,
    }));
  
    const programSummary = PROGRAMS.slice(0, 15).map(
      (p) => `${p.title} (${p.category}) — ${p.duration}`
    ).join('\n');
  
    const blogSummary = posts
      .map((p) => `${p.title} (${p.category}) — ${p.publishedAt?.toISOString().slice(0, 10)}`)
      .join('\n');
  
    const systemPrompt = `You are a content strategist for WorkforceAP, a workforce development organization in Austin TX. We offer 20 career programs (tech, healthcare, business, skilled trades). Our blog covers career tips, program spotlights, success stories, and local Austin job market insights.
  
  Output exactly 3 JSON objects in a JSON array. Each object must have:
  - title: string (blog post title)
  - slug: string (URL-friendly, lowercase, hyphens)
  - excerpt: string (1-2 sentences for listing)
  - category: string (one of: Career Tips, Program Spotlight, Success Stories, Local)
  - suggestedDate: string (YYYY-MM-DD, within next 30 days)
  - reasoning: string (1 sentence why this topic fits our audience)
  
  Suggest topics that:
  - Fill gaps or extend existing content
  - Are timely and relevant to job seekers
  - Highlight programs or certifications we offer
  - Include local Austin/Texas angle when appropriate
  - Avoid duplicating existing post titles
  
  Output ONLY the JSON array, no other text.`;
  
    const userPrompt = `Existing programs (sample):
  ${programSummary}
  
  Existing published posts:
  ${blogSummary || 'None yet.'}
  
  Suggest 3 new blog post topics.`;
  
    try {
      const output = await chatCompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
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
        suggestedDate: string;
        reasoning: string;
      }>;
  
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return NextResponse.json({ error: 'Invalid AI response format' }, { status: 500 });
      }
  
      return NextResponse.json({ suggestions: parsed.slice(0, 3) });
    } catch (err) {
      captureApiError(err, { route: 'admin/blog/ai/suggest-topics' });
      return NextResponse.json(
        { error: 'Failed to generate suggestions. Please try again.' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('/admin/blog/ai/suggest-topics:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
