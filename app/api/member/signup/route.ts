import { pickExactEmailMatch, normalizeEmail, EXACT_EMAIL_CANDIDATE_LIMIT } from '@/lib/db/exactEmailMatch';
import { crossTenantOK } from '@/lib/tenant/withTenantScope';
import { withSystemGuc } from '@/lib/db/withRequestGuc';
import { createMember } from '@/lib/member/service';
import { NextRequest, NextResponse } from 'next/server';
import { WEAK_PASSWORD_MESSAGE, WEAK_PASSWORD_REASON, isWeakPasswordError } from '@/lib/auth/authProviderError';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseCookieOptions } from '@/lib/supabaseCookieOptions';
import { memberSignupSchema } from '@/lib/validation/member';
import { checkSignupRateLimit, checkSignupEmailRateLimit } from '@/lib/rate-limit';
import { verifyTurnstileResponse } from '@/lib/turnstile/verifyTurnstile';
import { trackEvent } from '@/lib/events/track';
import { getConversionValuePayload } from '@/lib/analytics/conversionValue';
import { prisma } from '@/lib/db/prisma';

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
  
    const { success: rateOk } = await checkSignupRateLimit(ip);
    if (!rateOk) {
      return NextResponse.json(
        { error: 'Too many signup attempts. Please try again later.' },
        { status: 429 }
      );
    }
  
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
  
    const parsed = memberSignupSchema.safeParse(body);
    if (!parsed.success) {
      const messages = parsed.error.errors.map((e) => e.message).filter(Boolean);
      const error =
        messages.length <= 1
          ? (messages[0] ?? 'Validation failed')
          : messages.slice(0, 6).join(' · ');
      return NextResponse.json({ error }, { status: 400 });
    }
  
    const data = parsed.data;

    // Per-email rate limit. The per-IP limit above lets an attacker
    // rotating IPs spam verification mail at the same target address;
    // this caps requests at 3/hr/email.
    const { success: emailRateOk } = await checkSignupEmailRateLimit(data.email);
    if (!emailRateOk) {
      return NextResponse.json(
        { error: 'Too many signup attempts for this email. Please try again later.' },
        { status: 429 }
      );
    }

    const captchaEnabled = process.env.NEXT_PUBLIC_CAPTCHA_ENABLED === 'true';
    if (captchaEnabled) {
      const secret = process.env.TURNSTILE_SECRET_KEY;
      if (!secret?.trim()) {
        console.error('TURNSTILE_SECRET_KEY missing while NEXT_PUBLIC_CAPTCHA_ENABLED=true');
        return NextResponse.json(
          { error: 'Signup is temporarily unavailable. Please try again later.' },
          { status: 503 }
        );
      }
      // Clients only render the Turnstile widget when the SITE key is set, so
      // 'enabled + missing site key' means no request can ever carry a token —
      // fail closed as a config error, not an unpassable 400.
      if (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim()) {
        console.error('NEXT_PUBLIC_TURNSTILE_SITE_KEY missing while NEXT_PUBLIC_CAPTCHA_ENABLED=true');
        return NextResponse.json(
          { error: 'Signup is temporarily unavailable. Please try again later.' },
          { status: 503 }
        );
      }
      const tok = data.turnstileToken?.trim() ?? '';
      if (!tok) {
        return NextResponse.json({ error: 'Please complete the security check.' }, { status: 400 });
      }
      const ok = await verifyTurnstileResponse(secret, tok, ip !== 'unknown' ? ip : undefined);
      if (!ok) {
        return NextResponse.json({ error: 'Security check failed. Please try again.' }, { status: 400 });
      }
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const databaseUrl =
      process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL;
  
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        {
          error:
            'Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your Vercel project settings (from Supabase Dashboard → Project Settings → API).',
        },
        { status: 500 }
      );
    }
  
    if (!databaseUrl) {
      return NextResponse.json(
        {
          error:
            'Database is not configured. The Supabase integration should add POSTGRES_PRISMA_URL. If missing, add it in Vercel (from Supabase Dashboard → Project Settings → Database).',
        },
        { status: 500 }
      );
    }

    if (!supabaseServiceRoleKey) {
      return NextResponse.json(
        {
          error:
            'Supabase admin operations are not configured. Add SUPABASE_SERVICE_ROLE_KEY in your Vercel project settings.',
        },
        { status: 500 }
      );
    }
  
    // An existing app identity may have no Auth row after a legacy delete.
    // Never create another identity or transfer its roles/records through signup.
    //
    // `mode: 'insensitive'` compiles to ILIKE, so `data.email` is used as a
    // PATTERN and an address containing `_` matches same-shaped rows belonging
    // to other people. A false positive here blocks a real person from signing
    // up with a 409 they cannot self-resolve, so keep only a genuine equality.
    // See lib/db/exactEmailMatch.ts.
    const existingCandidates = await crossTenantOK(() => withSystemGuc(() => prisma.$transaction((tx) => tx.user.findMany({
      where: { email: { equals: normalizeEmail(data.email), mode: 'insensitive' } },
      select: { id: true, email: true },
      take: EXACT_EMAIL_CANDIDATE_LIMIT,
    }))));
    if (pickExactEmailMatch(existingCandidates, data.email)) {
      return NextResponse.json(
        {
          code: 'ACCOUNT_RECOVERY_REQUIRED',
          error: 'An account with this email already exists. If you cannot sign in, contact WorkforceAP at (512) 777-1808 for staff-assisted account recovery.',
        },
        { status: 409 },
      );
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookieOptions: getSupabaseCookieOptions(),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // Route handler - cookies set by middleware on redirect
        },
      },
    });
  
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        data: {
          full_name: data.fullName,
          phone: data.phone,
        },
        emailRedirectTo: `${request.nextUrl.origin}/auth/callback`,
      },
    });
  
    if (authError) {
      if (authError.message.includes('already registered') || authError.code === 'user_already_exists') {
        return NextResponse.json(
          { error: 'An account with this email may already exist. Try logging in or resetting your password.' },
          { status: 400 }
        );
      }
      if (isWeakPasswordError(authError)) {
        // WAP-26: say what to fix instead of the generic "could not create".
        return NextResponse.json(
          { error: WEAK_PASSWORD_MESSAGE, reason: WEAK_PASSWORD_REASON },
          { status: 400 }
        );
      }
      if (
        authError.message.toLowerCase().includes('rate limit') ||
        authError.message.toLowerCase().includes('email rate limit') ||
        authError.code === 'over_email_send_limit'
      ) {
        return NextResponse.json(
          {
            error:
              'Too many signup emails sent. Please try again in an hour, or use a different email. For testing, you can disable "Confirm email" in Supabase Dashboard → Auth → Providers → Email.',
          },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { error: 'We could not create your account. Please try again or contact us at (512) 777-1808.' },
        { status: 400 }
      );
    }
  
    const user = authData.user;
    if (!user) {
      return NextResponse.json(
        { error: 'Account creation failed. Please try again.' },
        { status: 500 }
      );
    }

    // With "Confirm email" on, Supabase answers a signUp for an existing
    // address with HTTP 200 and an obfuscated user whose `identities` is
    // empty. Surface it as "already exists" rather than crashing on the
    // users.email unique constraint below.
    if (Array.isArray(user.identities) && user.identities.length === 0) {
      return NextResponse.json(
        { error: 'An account with this email may already exist. Try logging in or resetting your password.' },
        { status: 400 }
      );
    }

    // Never roll back an auth user that already had an app row: that is a
    // returning member, and deleting their Supabase account would lock them
    // out for good.
    const priorMember = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true } });
    if (priorMember) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Log in to continue, or use password reset.' },
        { status: 400 }
      );
    }
  
    try {
      await createMember(user.id, data);
    } catch (err) {
      console.error('Signup member creation error:', err);
      // signUp may return a pre-existing unconfirmed/orphan Auth identity.
      // No app row is not proof this request created it. Preserve the login
      // for recovery instead of destructively deleting an unproven identity.
      return NextResponse.json(
        { error: 'Account creation failed. Please try again.' },
        { status: 500 }
      );
    }

    // Persist marketing attribution + signup conversion before the client
    // clears its sessionStorage. Mirrors /api/apply/signup so the attribution
    // surface is the same for both signup paths.
    const attributionMetadata: Record<string, string> = {};
    if (data.utmSource) attributionMetadata.utm_source = data.utmSource;
    if (data.utmMedium) attributionMetadata.utm_medium = data.utmMedium;
    if (data.utmCampaign) attributionMetadata.utm_campaign = data.utmCampaign;
    if (data.utmContent) attributionMetadata.utm_content = data.utmContent;
    if (data.utmTerm) attributionMetadata.utm_term = data.utmTerm;
    if (data.referrer) attributionMetadata.referrer = data.referrer;

    try {
      await trackEvent({
        userId: user.id,
        eventName: 'apply_signup_completed',
        metadata: {
          program_interest: data.programInterest,
          ...getConversionValuePayload('apply_signup_completed'),
          ...attributionMetadata,
        },
        sourcePage: '/signup',
      });
    } catch (err) {
      // Don't block signup on telemetry failures.
      console.error('Signup event tracking failed:', err);
    }

    return NextResponse.json({
      success: true,
      message: 'Check your email to verify your account.',
    });
  } catch (error) {
    console.error('/member/signup:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
