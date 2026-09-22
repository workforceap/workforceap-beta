import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { checkAuthRateLimit } from '@/lib/rate-limit';
import { captureApiError } from '@/lib/observability/captureApiError';

import { withApiGuc } from '@/lib/db/withRequestGuc';

const bodySchema = z.object({
  email: z.string().email().max(320).toLowerCase().trim(),
});

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

// This endpoint does not look up applications (anti-enumeration, AUDIT §H-S4),
// so the copy must not imply one happened. There is no SMS sender in this
// codebase; decisions go out by email only.
const genericMessage =
  'This page cannot look up application status. If you applied, your decision will be sent by email to the address you applied with. To ask about your application now, contact the team at workforceap.org/contact, or submit a new application at workforceap.org/apply.';

const genericResponse = {
  found: false,
  message: genericMessage,
};

export const POST = withApiGuc(async (request: NextRequest) => {
  try {
    const ip = getClientIp(request);
    const { success: rateOk } = await checkAuthRateLimit(`apply-status:${ip}`);
    if (!rateOk) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }

    // Anti-enumeration: return identical generic response regardless of
    // whether the email exists or has an application (AUDIT §H-S4).
    return NextResponse.json(genericResponse);
  } catch (err) {
    captureApiError(err, { route: 'apply/status-lookup' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
