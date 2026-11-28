import { getClientIpFromRequest } from '@/lib/http/clientIp';
import { NextRequest, NextResponse } from 'next/server';
import { checkCareersRecommendRateLimit } from '@/lib/rate-limit';
import { buildCareerMatchResult } from '@/lib/onet/recommend';
import { quizAnswersSchema } from '@/lib/onet/quizSchema';

export async function POST(request: NextRequest) {
  try {
  const ip = getClientIpFromRequest(request);
  const { success: rateOk } = await checkCareersRecommendRateLimit(ip);
  if (!rateOk) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment and try again.' },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = quizAnswersSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid quiz answers' }, { status: 400 });
  }

  const { ipRiasec, ...answers } = parsed.data;
  const result = await buildCareerMatchResult(answers, { ipRiasec: ipRiasec ?? null });
  return NextResponse.json(result);

  } catch (error) {
    console.error('/careers/recommend error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

