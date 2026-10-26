import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth/server';
import { checkInterestProfilerRateLimit } from '@/lib/rate-limit';
import { isOnetConfigured } from '@/lib/onet/client';
import { getInterestProfilerCareers, getInterestProfilerResults } from '@/lib/onet/interestProfiler';
import { applyRiasecCareerFallback } from '@/lib/onet/interestProfilerCareerFallback';
import { riasecFromResultRows } from '@/lib/content/quizIpMerge';
import { mapIpCareerRowsToProgramSlugs } from '@/lib/onet/ipMapToPrograms';
import { saveAIToolResult } from '@/lib/ai/saveResult';
import { ensureUserInDb } from '@/lib/auth/ensureUser';

import { withApiGuc } from '@/lib/db/withRequestGuc';

const bodySchema = z.object({
  answers: z
    .string()
    .length(30)
    .regex(/^[1-5]{30}$/, 'Each answer must be a digit from 1 (strongly dislike) to 5 (strongly like).'),
});export const POST = withApiGuc(async (request: NextRequest) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
    const { success: rateOk } = await checkInterestProfilerRateLimit(user.id);
    if (!rateOk) {
      return NextResponse.json({ error: 'Too many requests. Please try again in a little while.' }, { status: 429 });
    }
  
    if (!isOnetConfigured()) {
      return NextResponse.json(
        { error: 'Career matching tools are not configured. Ask your administrator to set ONET_API_KEY.' },
        { status: 503 }
      );
    }
  
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
  
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? 'Invalid answers string';
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  
    const { answers } = parsed.data;
  
    try {
      const results = await getInterestProfilerResults(answers);
      if (results.error) {
        return NextResponse.json({ error: String(results.error) }, { status: 422 });
      }
      const careersResp = await getInterestProfilerCareers(answers, { start: 1, end: 40 });
      const riasec = riasecFromResultRows(results.result ?? []);
      const careerRows = applyRiasecCareerFallback(careersResp.career ?? [], results.result ?? []);
      const programSlugs = await mapIpCareerRowsToProgramSlugs(
        careerRows.map((c) => ({ code: c.code, fit: c.fit }))
      );
  
      // Persist to AIToolResult so /api/member/skill-profile can read it
      // and blend RIASEC scores into the member's radar skill profile.
      let resultId: string | null = null;
      try {
        await ensureUserInDb(user);
        resultId = await saveAIToolResult(
          user.id,
          'skill_assessment',
          'Interest Profiler (30 questions)',
          JSON.stringify({
            source: 'interest_profiler',
            answers,
            riasec,
            topCareers: careerRows.slice(0, 10).map((c) => ({ code: c.code, title: c.title, fit: c.fit })),
            programSlugs,
            completedAt: new Date().toISOString(),
          })
        );
      } catch (saveErr) {
        console.error('[interest-profiler/score] failed to save result', saveErr);
      }
  
      return NextResponse.json({
        result: results.result ?? [],
        careers: careerRows,
        careersTotal: careersResp.total ?? careerRows.length,
        riasec,
        programSlugs,
        resultId,
      });
    } catch (e) {
      // Keep the O*NET error text (URL, credentials hint) in the server log.
      console.error('[member/interest-profiler/score] O*NET request failed:', e);
      return NextResponse.json(
        { error: 'Unable to score your interest profile right now. Please try again in a few minutes.' },
        { status: 502 },
      );
    }
  } catch (error) {
    console.error('/member/interest-profiler/score:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
