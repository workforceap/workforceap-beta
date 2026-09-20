import { NextRequest, NextResponse } from 'next/server';
import { checkContactRateLimit } from '@/lib/rate-limit';
import { verifyTurnstileResponse } from '@/lib/turnstile/verifyTurnstile';
import { brandedEmailLayout } from '@/lib/email/template';
import { escapeHtml } from '@/lib/email/escapeHtml';
import {
  CONTACT_FORM_ERROR_PATH,
  CONTACT_FORM_THANKS_PATH,
  contactFormDataToBody,
  isNativeFormPost,
} from '@/lib/contact/nativeFormPost';
import { getResend } from '@/lib/email';
import { sendBrandedEmailOrThrowOnSkip } from '@/lib/email/send';

const CONTACT_EMAIL_TO = 'info@workforceap.org';

/** JSON for fetch clients; a 303 to the confirmation or error anchor for native form posts. */
function respond(nativeForm: boolean, body: Record<string, unknown>, status: number): NextResponse {
  if (nativeForm) {
    return new NextResponse(null, {
      status: 303,
      headers: { Location: status < 400 ? CONTACT_FORM_THANKS_PATH : CONTACT_FORM_ERROR_PATH },
    });
  }
  return NextResponse.json(body, { status });
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function POST(request: NextRequest) {
  const nativeForm = isNativeFormPost(request);
  try {
    const ip = getClientIp(request);
    const { success: rateOk } = await checkContactRateLimit(ip);
    if (!rateOk) {
      return respond(nativeForm, { error: 'Too many submissions. Please try again in an hour.' }, 429);
    }
  
    let body: unknown;
    try {
      body = nativeForm ? contactFormDataToBody(await request.formData()) : await request.json();
    } catch {
      return respond(nativeForm, { error: 'Invalid request' }, 400);
    }
  
    const parsed = parseBody(body);
    if (!parsed) {
      return respond(nativeForm, { error: 'Missing required fields' }, 400);
    }
  
    const { firstName, lastName, email, phone, topic, message, smsPreferred, turnstileToken } = parsed;
  
    const captchaEnabled = process.env.NEXT_PUBLIC_CAPTCHA_ENABLED === 'true';
    if (captchaEnabled) {
      const secret = process.env.TURNSTILE_SECRET_KEY;
      if (!secret?.trim()) {
        console.error('TURNSTILE_SECRET_KEY missing while NEXT_PUBLIC_CAPTCHA_ENABLED=true');
        return respond(nativeForm, { error: 'Contact form is temporarily unavailable. Please try again later.' }, 503);
      }
      // Clients only render the Turnstile widget when the SITE key is set, so
      // 'enabled + missing site key' means no request can ever carry a token —
      // fail closed as a config error, not an unpassable 400.
      if (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()) {
        console.error('NEXT_PUBLIC_TURNSTILE_SITE_KEY missing while NEXT_PUBLIC_CAPTCHA_ENABLED=true');
        return respond(nativeForm, { error: 'Contact form is temporarily unavailable. Please try again later.' }, 503);
      }
      const tok = turnstileToken?.trim() ?? '';
      if (!tok) {
        return respond(nativeForm, { error: 'Please complete the security check.' }, 400);
      }
      const ok = await verifyTurnstileResponse(secret, tok, ip !== 'unknown' ? ip : undefined);
      if (!ok) {
        return respond(nativeForm, { error: 'Security check failed. Please try again.' }, 400);
      }
    }
  
    const resend = getResend();
    const emailFrom = process.env.EMAIL_FROM || 'noreply@workforceap.org';
  
    if (!resend) {
      console.error('RESEND_API_KEY not configured');
      return respond(nativeForm, { error: 'Email service is not configured. Please try again later.' }, 503);
    }
  
    const subject = `Contact Form: ${topic} — ${firstName} ${lastName}`;
    const text = [
      `From: ${firstName} ${lastName}`,
      `Email: ${email}`,
      `Phone: ${phone || 'Not provided'}`,
      `Prefer SMS: ${smsPreferred ? 'Yes' : 'No'}`,
      `Topic: ${topic}`,
      '',
      'Message:',
      message,
      '',
      `Submitted: ${new Date().toISOString()}`,
    ].join('\n');
  
    const html = brandedEmailLayout({
      title: `Contact: ${topic}`,
      bodyHtml: `
        <p><strong>From:</strong> ${escapeHtml(firstName)} ${escapeHtml(lastName)}</p>
        <p><strong>Email:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>
        <p><strong>Phone:</strong> ${escapeHtml(phone || 'Not provided')}</p>
        <p><strong>Prefer SMS:</strong> ${smsPreferred ? 'Yes' : 'No'}</p>
        <p><strong>Topic:</strong> ${escapeHtml(topic)}</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 1rem 0;" />
        <p><strong>Message:</strong></p>
        <p style="white-space: pre-wrap;">${escapeHtml(message)}</p>
        <p style="color: #888; font-size: 0.85rem; margin-top: 1.5rem;">Submitted: ${new Date().toISOString()}</p>
      `,
    });
  
    try {
      await sendBrandedEmailOrThrowOnSkip(resend, {
        from: emailFrom,
        to: CONTACT_EMAIL_TO,
        replyTo: email,
        subject,
        text,
        html,
      });
    } catch (err) {
      console.error('Contact form email failed:', err);
      return respond(nativeForm, { error: 'Failed to send message. Please try again later.' }, 500);
    }
  
    return respond(nativeForm, { ok: true }, 200);
  } catch (error) {
    console.error('/contact:', error);
    return respond(nativeForm, { error: 'Internal server error' }, 500);
  }
}

function parseBody(body: unknown): {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  topic: string;
  message: string;
  smsPreferred?: boolean;
  turnstileToken?: string;
} | null {
  if (!body || typeof body !== 'object') return null;
  const o = body as Record<string, unknown>;
  const firstName = typeof o.first_name === 'string' ? o.first_name.trim() : null;
  const lastName = typeof o.last_name === 'string' ? o.last_name.trim() : null;
  const email = typeof o.email === 'string' ? o.email.trim() : null;
  const phone = typeof o.phone === 'string' ? o.phone.trim() || undefined : undefined;
  const topic = typeof o.topic === 'string' ? o.topic.trim() : null;
  const message = typeof o.message === 'string' ? o.message.trim() : null;
  const smsPreferred = o.sms_preferred === true || o.sms_preferred === 'true';
  const turnstileToken =
    typeof o.cf_turnstile_response === 'string' ? o.cf_turnstile_response.trim() || undefined : undefined;
  if (!firstName || !lastName || !email || !topic || !message) return null;
  return { firstName, lastName, email, phone, topic, message, smsPreferred, turnstileToken };
}
