import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { computeWioaSignal, parseWioaAnswers, type WioaQualificationSnapshot } from '@/lib/wioa/wioaQualification';
import { sendWioaScreeningNotification } from '@/lib/wioa/wioaNotification';
import { checkPublicWioaQualificationRateLimit } from '@/lib/rate-limit';
import { getClientIpFromRequest } from '@/lib/http/clientIp';
import { prisma } from '@/lib/db/prisma';
import { getDefaultOrganizationId } from '@/lib/tenant/organization';
import { withApiGuc } from '@/lib/db/withRequestGuc';

const publicLeadSchema = z.object({
  fullName: z.string().trim().min(2, 'Please enter your full name').max(120),
  email: z.string().trim().email('Please enter a valid email').max(200),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
});

async function _POST(request: NextRequest) {
  try {
    const ip = getClientIpFromRequest(request);
    const { success: withinLimit } = await checkPublicWioaQualificationRateLimit(ip);
    if (!withinLimit) {
      return NextResponse.json(
        { error: 'Too many submissions. Please try again later.', errorCode: 'rate_limited' },
        { status: 429, headers: { 'Retry-After': '3600' } }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON', errorCode: 'invalid_json' }, { status: 400 });
    }

    const contact = publicLeadSchema.safeParse((body as Record<string, unknown> | null)?.contact ?? null);
    if (!contact.success) {
      return NextResponse.json({ error: contact.error.errors[0]?.message ?? 'Invalid contact info', errorCode: 'contact' }, { status: 400 });
    }

    const answers = parseWioaAnswers(body);
    if (!answers) {
      return NextResponse.json({ error: 'Invalid answers', errorCode: 'invalid_answers' }, { status: 400 });
    }

    const { signal, reasons } = computeWioaSignal(answers);
    const snapshot: WioaQualificationSnapshot = {
      version: 2,
      submittedAt: new Date().toISOString(),
      answers,
      signal,
      reasons,
    };

    // A successful response means the screening is durably available to staff.
    // Persist before sending email so provider delivery can never mask a failed write.
    let screeningId: string;
    try {
      const organizationId = await getDefaultOrganizationId();
      const screening = await prisma.publicWioaScreening.create({
        data: {
          organizationId,
          fullName: contact.data.fullName,
          email: contact.data.email,
          phone: contact.data.phone || null,
          snapshot,
          emailSent: false,
        },
        select: { id: true },
      });
      screeningId = screening.id;
    } catch (dbErr) {
      console.error('PublicWioaScreening persist error:', dbErr);
      return NextResponse.json(
        { error: 'We could not save your screening. Please try again.', errorCode: 'save_failed' },
        { status: 503 }
      );
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://www.workforceap.org');

    const emailSent = await sendWioaScreeningNotification({
      source: 'public_page',
      contact: {
        fullName: contact.data.fullName,
        email: contact.data.email,
        phone: contact.data.phone || null,
      },
      snapshot,
      adminUrl: `${siteUrl}/admin/wioa-screening`,
    });

    if (emailSent) {
      try {
        await prisma.publicWioaScreening.update({
          where: { id: screeningId },
          data: { emailSent: true },
        });
      } catch (dbErr) {
        // The screening is already durable and the provider confirmed delivery.
        // Keep the user-facing truth while logging the bookkeeping failure.
        console.error('PublicWioaScreening email status update error:', dbErr);
      }
    }

    return NextResponse.json({ ok: true, snapshot, emailSent });
  } catch (error) {
    console.error('/public/wioa-qualification error:', error);
    return NextResponse.json({ error: 'Internal server error', errorCode: 'save_failed' }, { status: 500 });
  }
}
export const POST = withApiGuc(_POST);
