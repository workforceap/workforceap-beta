import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { brandedEmailLayout } from '@/lib/email/template';
import { escapeHtml, sanitizeEmailSubjectLine } from '@/lib/email/escapeHtml';
import { getResend } from '@/lib/email';
import { sendBrandedEmailOrThrowOnSkip } from '@/lib/email/send';
import { checkContactRateLimit } from '@/lib/rate-limit';

import { withApiGuc } from '@/lib/db/withRequestGuc';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.workforceap.org';
const FALLBACK_EMAIL = 'info@workforceap.org';

export const POST = withApiGuc(async (request: NextRequest) => {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1';
    const { success: withinLimit } = await checkContactRateLimit(ip);
    if (!withinLimit) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }
  
    const dbUser = await prisma.$transaction((tx) => tx.user.findUnique({
      where: { id: user.id },
      select: {
        fullName: true,
        email: true,
        enrolledProgram: true,
      },
    }));
    if (!dbUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
  
    // Find assigned counselor
    const assignment = await prisma.$transaction((tx) => tx.counselorAssignment.findFirst({
      where: { memberId: user.id, active: true },
      include: {
        counselor: {
          select: {
            user: { select: { email: true, fullName: true } },
          },
        },
      },
    }));
  
    const counselorEmail = assignment?.counselor?.user?.email ?? FALLBACK_EMAIL;
    const counselorName = assignment?.counselor?.user?.fullName ?? 'Counselor';
  
    const resend = getResend();
    if (!resend) {
      return NextResponse.json({ error: 'Email not configured' }, { status: 500 });
    }
  
    const from = process.env.EMAIL_FROM || 'WorkforceAP <hello@workforceap.org>';
    const memberName = dbUser.fullName ?? 'A member';
  
    const html = brandedEmailLayout({
      title: `Help request from ${memberName}`,
      bodyHtml: `
        <p><strong>${escapeHtml(memberName)}</strong> is requesting help or a call.</p>
        <ul>
          <li><strong>Email:</strong> ${escapeHtml(dbUser.email ?? '')}</li>
          <li><strong>Program:</strong> ${escapeHtml(dbUser.enrolledProgram ?? 'Not enrolled')}</li>
        </ul>
        <p>Please reach out to them at your earliest convenience.</p>
      `,
      ctaText: 'View member',
      ctaUrl: `${SITE_URL}/counselor/students/${user.id}`,
    });
  
    try {
      await sendBrandedEmailOrThrowOnSkip(resend, {
        from,
        to: counselorEmail,
        subject: sanitizeEmailSubjectLine(`Help request from ${memberName}`),
        html,
      });
      return NextResponse.json({ ok: true });
    } catch (err) {
      console.error('request-help email failed:', err);
      return NextResponse.json({ error: 'Failed to send' }, { status: 500 });
    }
  } catch (error) {
    console.error('/member/request-help:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
