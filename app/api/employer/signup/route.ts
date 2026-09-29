import { createEmployerUser } from '@/lib/employer/service';
import { after, NextRequest, NextResponse } from 'next/server';
import { employerSignupSchema } from '@/lib/validation/employer';
import { checkPartnerSignupRateLimit, checkSignupEmailRateLimit } from '@/lib/rate-limit';
import { verifyTurnstileResponse } from '@/lib/turnstile/verifyTurnstile';
import {
  sendEmployerWelcomeEmail,
  sendEmployerSignupAdminAlertEmail,
  sendEmployerVerificationEmail,
} from '@/lib/email';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { stampCreatedAuthUserProvisionIntent } from '@/lib/auth/provisionIntent';
import { resolveProvisionOrganizationId } from '@/lib/tenant/resolveProvisionOrg';
import { cleanupCreatedEmployerSignupAuthUser } from './_signupCleanup';
import { notifyDiscord } from '@/lib/notify/discord';

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

    const { success: rateOk } = await checkPartnerSignupRateLimit(ip);
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

    const parsed = employerSignupSchema.safeParse(body);
    if (!parsed.success) {
      const messages = parsed.error.errors.map((e) => e.message).filter(Boolean);
      const error =
        messages.length <= 1
          ? (messages[0] ?? 'Validation failed')
          : messages.slice(0, 6).join(' · ');
      return NextResponse.json({ error }, { status: 400 });
    }

    const data = parsed.data;

    // Per-email rate limit (3/hr) — caps target-mail spam from IP-rotators.
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
    const databaseUrl =
      process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        {
          error:
            'Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your Vercel project settings.',
        },
        { status: 500 }
      );
    }

    if (!databaseUrl) {
      return NextResponse.json(
        {
          error:
            'Database is not configured. Add POSTGRES_PRISMA_URL in your Vercel project settings.',
        },
        { status: 500 }
      );
    }

    // Create the auth user unconfirmed; public signup must not grant a session
    // until the contact proves control of the mailbox.
    const admin = getSupabaseAdmin();
    const createResult = await admin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      user_metadata: {
        full_name: data.contactName,
        phone: data.phone,
      },
    });
    const { data: createData, error: createError } = createResult;

    if (createError) {
      if (
        createError.message.includes('already registered') ||
        createError.message.includes('already exists') ||
        createError.message.includes('User already registered')
      ) {
        return NextResponse.json(
          { error: 'An account with this email may already exist. Try logging in or resetting your password.' },
          { status: 400 }
        );
      }
      if (
        createError.message.toLowerCase().includes('rate limit') ||
        createError.message.toLowerCase().includes('email rate limit')
      ) {
        return NextResponse.json(
          {
            error:
              'Too many signup emails sent. Please try again in an hour, or use a different email.',
          },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { error: 'We could not create your account. Please try again or contact us at (512) 777-1808.' },
        { status: 400 }
      );
    }

    const user = createData.user;
    if (!user) {
      return NextResponse.json(
        { error: 'Account creation failed. Please try again.' },
        { status: 500 }
      );
    }

    try {
      const organizationId = await resolveProvisionOrganizationId({ headers: request.headers });
      await stampCreatedAuthUserProvisionIntent(admin, createResult, {
        role: 'employer', organizationId, source: 'employer_signup',
      });
      await createEmployerUser(user.id, data, { organizationId });
    } catch (err) {
      console.error('Employer signup creation error:', err);
      await cleanupCreatedEmployerSignupAuthUser(admin, user.id);
      return NextResponse.json(
        { error: 'Account creation failed. Please try again.' },
        { status: 500 }
      );
    }

    // Verification email is load-bearing: the unconfirmed account cannot log
    // in until the link is clicked. Generate the Supabase confirmation link
    // and send it through our own mailer.
    let verificationSent = false;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.workforceap.org';
    try {
      const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: 'signup',
        email: data.email,
        password: data.password,
        options: { redirectTo: `${siteUrl}/login?verified=1` },
      });
      const verifyUrl = linkData?.properties?.action_link;
      if (linkError || !verifyUrl) {
        console.error('Employer signup: verification link generation failed:', linkError);
      } else {
        const sent = await sendEmployerVerificationEmail({
          to: data.email,
          contactName: data.contactName,
          verifyUrl,
        });
        verificationSent = sent.ok;
        if (!sent.ok) {
          console.error('Employer signup: verification email send failed:', sent.error);
        }
      }
    } catch (err) {
      console.error('Employer signup: verification email error:', err);
    }

    // Best-effort welcome + admin alert via `after()` so Vercel keeps the
    // invocation alive until Resend finishes (same pattern as apply signup).
    after(() =>
      sendEmployerWelcomeEmail({
        to: data.email,
        companyName: data.companyName,
        contactName: data.contactName,
      }).catch((err) => console.error('Employer welcome email failed:', err))
    );

    after(() =>
      sendEmployerSignupAdminAlertEmail({
        companyName: data.companyName,
        contactName: data.contactName,
        contactEmail: data.email,
        contactPhone: data.phone,
      }).catch((err) => console.error('Employer admin alert failed:', err))
    );

    // Operator visibility bridge — new employer signup is high-signal
    after(() => notifyDiscord({
      title: `New employer signup: ${data.companyName}`,
      body: `Contact: ${data.contactName} (${data.email})`,
      category: 'employer_signup',
      level: 'success',
      fields: [
        { name: 'company', value: data.companyName },
        { name: 'contact', value: data.contactName },
        { name: 'email', value: data.email },
        ...(data.phone ? [{ name: 'phone', value: data.phone }] : []),
        { name: 'industry', value: data.industry || '—' },
        { name: 'size', value: data.companySize || '—' },
      ],
    }));

    return NextResponse.json({
      success: true,
      message: verificationSent
        ? 'Account created. Please check your email to verify your account before logging in.'
        : 'Account created, but we could not send the verification email. Contact us at (512) 777-1808 and we will activate your account.',
    });
  } catch (error) {
    console.error('/employer/signup:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
