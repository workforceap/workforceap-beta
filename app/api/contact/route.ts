import { NextRequest, NextResponse } from 'next/server';
import { checkContactRateLimit } from '@/lib/rate-limit';
import { verifyTurnstileResponse } from '@/lib/turnstile/verifyTurnstile';
import {
  CONTACT_FORM_ERROR_PATH,
  CONTACT_FORM_THANKS_PATH,
  contactFormDataToBody,
  isNativeFormPost,
} from '@/lib/contact/nativeFormPost';
import { parseContactInquiry } from '@/lib/publicInquiries/validation';
import { submitPublicInquiry } from '@/lib/publicInquiries/submit';

/** JSON for fetch clients; a 303 to the confirmation or error anchor for native form posts. */
function respond(request: NextRequest, body: Record<string, unknown>, status: number): NextResponse {
  if (isNativeFormPost(request)) {
    return new NextResponse(null, {
      status: 303,
      headers: { Location: status < 400 ? CONTACT_FORM_THANKS_PATH : (new URL(request.url).searchParams.get('source') === 'sponsorship' ? '/donate#sponsorship-form-error' : CONTACT_FORM_ERROR_PATH) },
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
      return respond(request, { error: 'Too many submissions. Please try again in an hour.' }, 429);
    }
  
    let body: unknown;
    try {
      body = nativeForm ? contactFormDataToBody(await request.formData()) : await request.json();
    } catch {
      return respond(request, { error: 'Invalid request' }, 400);
    }
  
    const parsed = parseContactInquiry(body);
    if (!parsed) {
      return respond(request, { error: 'Missing required fields' }, 400);
    }
  
    const { turnstileToken } = parsed;
  
    const captchaEnabled = process.env.NEXT_PUBLIC_CAPTCHA_ENABLED === 'true';
    if (captchaEnabled) {
      const secret = process.env.TURNSTILE_SECRET_KEY;
      if (!secret?.trim()) {
        console.error('TURNSTILE_SECRET_KEY missing while NEXT_PUBLIC_CAPTCHA_ENABLED=true');
        return respond(request, { error: 'Contact form is temporarily unavailable. Please try again later.' }, 503);
      }
      // Clients only render the Turnstile widget when the SITE key is set, so
      // 'enabled + missing site key' means no request can ever carry a token —
      // fail closed as a config error, not an unpassable 400.
      if (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()) {
        console.error('NEXT_PUBLIC_TURNSTILE_SITE_KEY missing while NEXT_PUBLIC_CAPTCHA_ENABLED=true');
        return respond(request, { error: 'Contact form is temporarily unavailable. Please try again later.' }, 503);
      }
      const tok = turnstileToken?.trim() ?? '';
      if (!tok) {
        return respond(request, { error: 'Please complete the security check.' }, 400);
      }
      const ok = await verifyTurnstileResponse(secret, tok, ip !== 'unknown' ? ip : undefined);
      if (!ok) {
        return respond(request, { error: 'Security check failed. Please try again.' }, 400);
      }
    }
  
    const result = await submitPublicInquiry(request.headers, parsed);
    if (!result.ok) {
      const { status, ok: _ok, ...failure } = result;
      return respond(request, failure, status);
    }

    return respond(request, { ok: true }, 200);
  } catch {
    console.error('Public contact inquiry could not be processed');
    return respond(request, { error: 'Internal server error' }, 500);
  }
}
