import { NextRequest, NextResponse } from 'next/server';
import { checkContactRateLimit } from '@/lib/rate-limit';
import { verifyTurnstileResponse } from '@/lib/turnstile/verifyTurnstile';
import { brandedEmailLayout } from '@/lib/email/template';
import { escapeHtml } from '@/lib/email/escapeHtml';
import { getResend } from '@/lib/email';
import { sendBrandedEmailOrThrowOnSkip } from '@/lib/email/send';
import { validateCareersLeadPayload } from '@/lib/validation/careersLead';

const CAREERS_EMAIL_TO = 'careers@workforceap.org';

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const { success: rateOk } = await checkContactRateLimit(ip);
    if (!rateOk) {
      return NextResponse.json(
        { error: 'Too many submissions. Please try again in an hour.' },
        { status: 429 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const parsed = validateCareersLeadPayload(body);
    if (!parsed.ok) {
      if (parsed.fieldErrors.email === 'invalid_email') {
        return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
      }
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { firstName, lastName, email, interestArea, message, roleTitle, turnstileToken } = parsed.data;

    const captchaEnabled = process.env.NEXT_PUBLIC_CAPTCHA_ENABLED === 'true';
    if (captchaEnabled) {
      const secret = process.env.TURNSTILE_SECRET_KEY;
      if (!secret?.trim()) {
        console.error('TURNSTILE_SECRET_KEY missing while NEXT_PUBLIC_CAPTCHA_ENABLED=true');
        return NextResponse.json(
          { error: 'Form is temporarily unavailable. Please try again later.' },
          { status: 503 },
        );
      }
      // Clients only render the Turnstile widget when the SITE key is set, so
      // 'enabled + missing site key' means no request can ever carry a token —
      // fail closed as a config error, not an unpassable 400.
      if (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()) {
        console.error('NEXT_PUBLIC_TURNSTILE_SITE_KEY missing while NEXT_PUBLIC_CAPTCHA_ENABLED=true');
        return NextResponse.json(
          { error: 'Form is temporarily unavailable. Please try again later.' },
          { status: 503 },
        );
      }
      const tok = turnstileToken?.trim() ?? '';
      if (!tok) {
        return NextResponse.json({ error: 'Please complete the security check.' }, { status: 400 });
      }
      const ok = await verifyTurnstileResponse(secret, tok, ip !== 'unknown' ? ip : undefined);
      if (!ok) {
        return NextResponse.json({ error: 'Security check failed. Please try again.' }, { status: 400 });
      }
    }

    const resend = getResend();
    const emailFrom = process.env.EMAIL_FROM || 'noreply@workforceap.org';

    if (!resend) {
      console.error('RESEND_API_KEY not configured');
      return NextResponse.json(
        { error: 'Email service is not configured. Please try again later.' },
        { status: 503 },
      );
    }

    const interestLabel = formatInterestArea(interestArea);
    const subjectParts = [
      `Careers interest: ${firstName} ${lastName}`,
      roleTitle || null,
      interestLabel || null,
    ].filter(Boolean);
    const subject = subjectParts.join(' — ');
    const text = [
      `From: ${firstName} ${lastName}`,
      `Email: ${email}`,
      `Role of interest: ${roleTitle || 'Not specified'}`,
      `Interest area: ${interestLabel || 'Not specified'}`,
      '',
      'Message:',
      message,
      '',
      `Submitted: ${new Date().toISOString()}`,
    ].join('\n');

    const html = brandedEmailLayout({
      title: 'Careers interest form',
      bodyHtml: `
        <p><strong>From:</strong> ${escapeHtml(firstName)} ${escapeHtml(lastName)}</p>
        <p><strong>Email:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>
        <p><strong>Role of interest:</strong> ${escapeHtml(roleTitle || 'Not specified')}</p>
        <p><strong>Interest area:</strong> ${escapeHtml(interestLabel || 'Not specified')}</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 1rem 0;" />
        <p><strong>Message:</strong></p>
        <p style="white-space: pre-wrap;">${escapeHtml(message)}</p>
        <p style="color: #888; font-size: 0.85rem; margin-top: 1.5rem;">Submitted: ${new Date().toISOString()}</p>
      `,
    });

    try {
      await sendBrandedEmailOrThrowOnSkip(resend, {
        from: emailFrom,
        to: CAREERS_EMAIL_TO,
        replyTo: email,
        subject,
        text,
        html,
      });
    } catch (err) {
      console.error('Careers lead email failed:', err);
      return NextResponse.json(
        { error: 'Failed to send message. Please try again later.' },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('/api/leads/careers:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function formatInterestArea(value?: string): string {
  switch (value) {
    case 'counselor':
      return 'Counseling / member success';
    case 'engineering':
      return 'Engineering / product';
    case 'operations':
      return 'Operations';
    case 'other':
      return 'Other';
    default:
      return '';
  }
}
