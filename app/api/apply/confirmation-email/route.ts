import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { sendApplicationConfirmationEmail } from '@/lib/email';
import {
  checkConfirmationEmailRateLimit,
  checkConfirmationEmailEmailRateLimit,
} from '@/lib/rate-limit';
import { z } from 'zod';
import { withApiGuc } from '@/lib/db/withRequestGuc';

const schema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1),
});

function getClientIp(request: NextRequest) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-vercel-forwarded-for') ??
    'unknown'
  );
}

async function _POST(request: NextRequest) {
  try {
    const { success } = await checkConfirmationEmailRateLimit(getClientIp(request));
    if (!success) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    }

    // Block IP-rotating spray against a target inbox. Without this, the
    // per-IP cap alone lets a botnet send our branded confirmation email
    // to any attacker-chosen address — domain abuse for phishing pretext.
    const { success: emailWithinLimit } = await checkConfirmationEmailEmailRateLimit(parsed.data.email);
    if (!emailWithinLimit) {
      return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
    }

    // Close the open-relay vector (AUDIT §H-S8): only send to addresses that
    // have a recent application or user record. An attacker rotating IPs can
    // no longer spray arbitrary inboxes with our branded confirmation email.
    // Application has no `email` column; the applicant's email lives on the
    // related User row (User.email is @unique). Filter through the relation
    // so the open-relay guard still anchors on a real recent application.
    const recentApplication = await prisma.application.findFirst({
      where: {
        user: { is: { email: parsed.data.email } },
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, userId: true },
      take: 1,
    });
    if (!recentApplication) {
      // Same body and status as the sent path so the response does not reveal
      // whether an application exists for this address. Nothing is sent; the
      // client only uses `ok` to stop retrying, which is the right outcome here.
      return NextResponse.json({ ok: true });
    }

    const result = await sendApplicationConfirmationEmail({
      to: parsed.data.email,
      recipientUserId: recentApplication.userId,
      fullName: parsed.data.fullName,
      applicationId: recentApplication.id,
    });
    if (!result.ok) {
      // `result.error` is the provider's raw exception text; log it, never echo it.
      console.error('[app/api/apply/confirmation-email] send failed:', result.error ?? 'unknown');
      return NextResponse.json(
        { error: 'We could not send the confirmation email right now. Please try again later.' },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[app/api/apply/confirmation-email] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const POST = withApiGuc(_POST);
