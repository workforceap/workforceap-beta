import { NextRequest, NextResponse } from 'next/server';
import { checkContactRateLimit } from '@/lib/rate-limit';
import { verifyTurnstileResponse } from '@/lib/turnstile/verifyTurnstile';
import { submitPublicInquiry } from '@/lib/publicInquiries/submit';
import { contactFormDataToBody, isNativeFormPost } from '@/lib/contact/nativeFormPost';
import { validateCareersLeadPayload } from '@/lib/validation/careersLead';


function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function POST(request: NextRequest) {
  const nativeForm = isNativeFormPost(request);
  const respond = (body: Record<string, unknown>, init: { status?: number } = {}) => nativeForm
    ? new NextResponse(null, { status: 303, headers: { Location: (init.status ?? 200) < 400 ? '/careers/thank-you' : '/careers#careers-form-error' } })
    : NextResponse.json(body, init);
  try {
    const ip = getClientIp(request);
    const { success: rateOk } = await checkContactRateLimit(ip);
    if (!rateOk) {
      return respond(
        { error: 'Too many submissions. Please try again in an hour.' },
        { status: 429 },
      );
    }

    let body: unknown;
    try {
      body = nativeForm ? contactFormDataToBody(await request.formData()) : await request.json();
    } catch {
      return respond({ error: 'Invalid request' }, { status: 400 });
    }

    const parsed = validateCareersLeadPayload(body);
    if (!parsed.ok) {
      if (parsed.fieldErrors.email === 'invalid_email') {
        return respond({ error: 'Enter a valid email address.' }, { status: 400 });
      }
      return respond({ error: 'Missing required fields' }, { status: 400 });
    }

    const { turnstileToken } = parsed.data;

    const captchaEnabled = process.env.NEXT_PUBLIC_CAPTCHA_ENABLED === 'true';
    if (captchaEnabled) {
      const secret = process.env.TURNSTILE_SECRET_KEY;
      if (!secret?.trim()) {
        console.error('TURNSTILE_SECRET_KEY missing while NEXT_PUBLIC_CAPTCHA_ENABLED=true');
        return respond(
          { error: 'Form is temporarily unavailable. Please try again later.' },
          { status: 503 },
        );
      }
      // Clients only render the Turnstile widget when the SITE key is set, so
      // 'enabled + missing site key' means no request can ever carry a token —
      // fail closed as a config error, not an unpassable 400.
      if (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()) {
        console.error('NEXT_PUBLIC_TURNSTILE_SITE_KEY missing while NEXT_PUBLIC_CAPTCHA_ENABLED=true');
        return respond(
          { error: 'Form is temporarily unavailable. Please try again later.' },
          { status: 503 },
        );
      }
      const tok = turnstileToken?.trim() ?? '';
      if (!tok) {
        return respond({ error: 'Please complete the security check.' }, { status: 400 });
      }
      const ok = await verifyTurnstileResponse(secret, tok, ip !== 'unknown' ? ip : undefined);
      if (!ok) {
        return respond({ error: 'Security check failed. Please try again.' }, { status: 400 });
      }
    }

    const result = await submitPublicInquiry(request.headers, {
      ...parsed.data,
      kind: 'careers', topic: 'Careers interest', smsPreferred: false,
    });
    if (!result.ok) {
      const { status, ok: _ok, ...failure } = result;
      return respond(failure, { status });
    }

    return respond({ ok: true });
  } catch {
    console.error('Public careers inquiry could not be processed');
    return respond({ error: 'Internal server error' }, { status: 500 });
  }
}
