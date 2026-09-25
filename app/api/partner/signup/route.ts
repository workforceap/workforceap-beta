import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { checkPartnerSignupRateLimit, checkSignupEmailRateLimit } from '@/lib/rate-limit';
import { verifyTurnstileResponse } from '@/lib/turnstile/verifyTurnstile';
import { sanitizeEmailSubjectLine } from '@/lib/email/escapeHtml';
import { getResend } from '@/lib/email';
import { plainTextEmailHtml } from '@/lib/email/plainTextEmail';
import { sendBrandedEmailOrThrowOnSkip } from '@/lib/email/send';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { stampNewAuthUserProvisionIntent } from '@/lib/auth/provisionIntent';
import { resolveProvisionOrganizationId } from '@/lib/tenant/resolveProvisionOrg';
import { withApiGuc } from '@/lib/db/withRequestGuc';

const ADMIN_EMAIL = 'info@workforceap.org';

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function generateUniqueSlug(base: string): Promise<string> {
  let slug = slugify(base);
  if (!slug) slug = 'partner';
  let candidate = slug;
  let suffix = 0;
  while (await prisma.$transaction((tx) => tx.partner.findUnique({ where: { slug: candidate }, select: { id: true } }))) {
    suffix++;
    candidate = `${slug}-${suffix}`;
  }
  return candidate;
}

async function generateUniqueReferralCode(base: string): Promise<string> {
  let code = slugify(base);
  if (!code) code = 'partner';
  let candidate = code;
  let suffix = 0;
  while (
    await prisma.$transaction((tx) => tx.partner.findFirst({
      where: { OR: [{ referralCode: candidate }, { slug: candidate }] },
      select: { id: true },
    }))
  ) {
    suffix++;
    candidate = `${code}-${suffix}`;
  }
  return candidate;
}

const signupSchema = z.object({
  organizationName: z.string().min(1).max(200).trim(),
  contactName: z.string().min(1).max(200).trim(),
  contactEmail: z.string().email().max(320).toLowerCase().trim(),
  contactPhone: z.string().max(50).optional().nullable(),
  orgType: z.string().min(1).max(120).trim(),
  serveArea: z.string().min(1).max(200).trim(),
  expectedMonthly: z.string().min(1).max(40).trim(),
  hearAbout: z.string().max(2000).optional().nullable(),
  password: z.string().min(8).max(128),
  /** Cloudflare Turnstile token, verified server-side when NEXT_PUBLIC_CAPTCHA_ENABLED=true. */
  turnstileToken: z.string().optional().nullable(),
});

export const POST = withApiGuc(async (request: NextRequest) => {
  try {
    const ip = getClientIp(request);
    const { success: rateOk } = await checkPartnerSignupRateLimit(ip);
    if (!rateOk) {
      return NextResponse.json(
        { error: 'Too many submissions. Please try again in an hour.' },
        { status: 429 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? 'Invalid input' },
        { status: 400 }
      );
    }

    const d = parsed.data;
    const phone = d.contactPhone?.trim() || null;
    const hear = d.hearAbout?.trim() || null;

    // Per-email rate limit (3/hr) — caps target-mail spam from IP-rotators.
    const { success: emailRateOk } = await checkSignupEmailRateLimit(d.contactEmail);
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
      const tok = d.turnstileToken?.trim() ?? '';
      if (!tok) {
        return NextResponse.json({ error: 'Please complete the security check.' }, { status: 400 });
      }
      const ok = await verifyTurnstileResponse(secret, tok, ip !== 'unknown' ? ip : undefined);
      if (!ok) {
        return NextResponse.json({ error: 'Security check failed. Please try again.' }, { status: 400 });
      }
    }

    // Check if email already exists in our DB
    const existingUser = await prisma.$transaction((tx) => tx.user.findUnique({
      where: { email: d.contactEmail },
      select: { id: true },
    }));
    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Try logging in or resetting your password.' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
      return NextResponse.json(
        { error: 'Server configuration error. Please try again later.' },
        { status: 500 }
      );
    }

    // Create the auth user unconfirmed; public signup must not grant a
    // usable account until the contact proves control of the mailbox.
    const supabaseAdmin = getSupabaseAdmin();
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: d.contactEmail,
      password: d.password,
      user_metadata: {
        full_name: d.contactName,
        phone: phone ?? undefined,
      },
    });

    if (authError) {
      if (authError.message.includes('already') || authError.code === 'user_already_exists') {
        return NextResponse.json(
          { error: 'An account with this email already exists. Try logging in or resetting your password.' },
          { status: 400 }
        );
      }
      console.error('Partner signup auth error:', authError);
      return NextResponse.json(
        { error: 'We could not create your account. Please try again.' },
        { status: 500 }
      );
    }

    const authUser = authData.user;
    if (!authUser) {
      return NextResponse.json(
        { error: 'Account creation failed. Please try again.' },
        { status: 500 }
      );
    }

    const organizationId = await resolveProvisionOrganizationId({ headers: request.headers });
    await stampNewAuthUserProvisionIntent(supabaseAdmin, authUser, {
      role: 'partner', organizationId, source: 'partner_signup',
    });
    const slug = await generateUniqueSlug(d.organizationName);
    const referralCode = await generateUniqueReferralCode(d.organizationName);

    // Create DB records in transaction
    try {
      await prisma.$transaction(async (tx) => {
        // Create User row
        await tx.user.create({
          data: {
            id: authUser.id,
            organizationId,
            email: d.contactEmail,
            fullName: d.contactName,
            phone,
          },
        });

        // Create Profile with partner role
        await tx.profile.create({
          data: {
            userId: authUser.id,
            role: 'partner',
            consentTerms: true,
          },
        });

        // Create Partner row (pending approval)
        const partner = await tx.partner.create({
          data: {
            organizationId,
            name: d.organizationName,
            slug,
            referralCode,
            contactName: d.contactName,
            contactEmail: d.contactEmail,
            contactPhone: phone,
            organizationType: d.orgType,
            status: 'pending_approval',
            active: false,
          },
        });

        // Link PartnerUser
        await tx.partnerUser.create({
          data: {
            partnerId: partner.id,
            userId: authUser.id,
          },
        });

        // Keep audit record
        await tx.partnerSignupRequest.create({
          data: {
            organizationName: d.organizationName,
            contactName: d.contactName,
            contactEmail: d.contactEmail,
            contactPhone: phone,
            orgType: d.orgType,
            expectedMonthly: d.expectedMonthly,
            serveArea: d.serveArea,
            hearAbout: hear,
            status: 'self_service_created',
          },
        });
      });
    } catch (dbErr) {
      console.error('Partner signup DB error:', dbErr);
      // Attempt to clean up auth user so they can retry
      await supabaseAdmin.auth.admin.deleteUser(authUser.id).catch((e) => {
        console.error('Failed to clean up auth user after DB error:', e);
      });
      return NextResponse.json(
        { error: 'Account creation failed. Please try again.' },
        { status: 500 }
      );
    }

    // Verification email is load-bearing: the unconfirmed account cannot log
    // in until the link is clicked. Generate the Supabase confirmation link
    // and send it through our own mailer.
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.workforceap.org';
    let verificationSent = false;
    try {
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'signup',
        email: d.contactEmail,
        password: d.password,
        options: { redirectTo: `${siteUrl}/login?verified=1&redirectTo=/partner` },
      });
      const verifyUrl = linkData?.properties?.action_link;
      if (linkError || !verifyUrl) {
        console.error('Partner signup: verification link generation failed:', linkError);
      } else {
        const resendVerify = getResend();
        if (resendVerify) {
          const verifyText = [
              `Hi ${d.contactName},`,
              '',
              'Thanks for signing up as a WorkforceAP partner. One quick step before you can log in: confirm this email address.',
              '',
              `Verify your email: ${verifyUrl}`,
              '',
              "If you didn't create this account, you can ignore this email — the account cannot be used until the email is verified.",
              '',
              'Questions? Reply to this email or contact us at info@workforceap.org.',
              '',
              '— WorkforceAP Team',
            ].join('\n');
          // One-time link: no `template` ref, so it can never be replayed from a stored row.
          await sendBrandedEmailOrThrowOnSkip(resendVerify, {
            from: process.env.EMAIL_FROM || 'noreply@workforceap.org',
            to: d.contactEmail,
            subject: sanitizeEmailSubjectLine('Verify your email — WorkforceAP Partner Portal'),
            html: plainTextEmailHtml(verifyText),
            text: verifyText,
          });
          verificationSent = true;
        } else {
          console.error('Partner signup: RESEND_API_KEY not set, verification email not sent');
        }
      }
    } catch (err) {
      console.error('Partner signup: verification email error:', err);
    }

    const response = NextResponse.json({
      ok: true,
      message: verificationSent
        ? 'Your partner account has been created. Check your email to verify your address before logging in.'
        : 'Your partner account has been created, but we could not send the verification email. Contact info@workforceap.org and we will activate your account.',
    });

    // Send welcome email
    const resend = getResend();
    const emailFrom = process.env.EMAIL_FROM || 'noreply@workforceap.org';
    if (resend) {
      // Welcome email to partner
      try {
        const welcomeText = [
            `Hi ${d.contactName},`,
            '',
            'Thank you for signing up as a WorkforceAP partner!',
            '',
            'Your account is currently pending approval. Once you verify your email address (see the verification email we just sent), you can log in to explore onboarding materials.',
            '',
            `Portal URL: ${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.workforceap.org'}/partner`,
            '',
            'Once approved, you will be able to start referring members and tracking outcomes.',
            '',
            'Questions? Reply to this email or contact us at info@workforceap.org.',
            '',
            '— WorkforceAP Team',
          ].join('\n');
        await sendBrandedEmailOrThrowOnSkip(resend, {
          from: emailFrom,
          to: d.contactEmail,
          subject: sanitizeEmailSubjectLine('Welcome to WorkforceAP Partner Portal'),
          html: plainTextEmailHtml(welcomeText),
          text: welcomeText,
        });
      } catch (e) {
        console.error('Partner welcome email failed:', e);
      }

      // Notify admin
      try {
        const adminText = [
          'New partner self-signup (pending approval)',
          '',
          `Organization: ${d.organizationName}`,
          `Contact: ${d.contactName}`,
          `Email: ${d.contactEmail}`,
          `Phone: ${phone ?? '—'}`,
          `Type: ${d.orgType}`,
          `Serve area: ${d.serveArea}`,
          `Expected monthly referrals: ${d.expectedMonthly}`,
          hear ? `How they heard about us: ${hear}` : '',
          `Slug: ${slug}`,
          `Referral code: ${referralCode}`,
          '',
          `Approve: ${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.workforceap.org'}/admin/partners`,
        ]
          .filter(Boolean)
          .join('\n');

        await sendBrandedEmailOrThrowOnSkip(resend, {
          from: emailFrom,
          to: ADMIN_EMAIL,
          replyTo: d.contactEmail,
          subject: sanitizeEmailSubjectLine(`[Action needed] Partner signup: ${d.organizationName}`),
          html: plainTextEmailHtml(adminText),
          text: adminText,
        });
      } catch (e) {
        console.error('Partner signup admin email failed:', e);
      }
    }

    return response;
  } catch (error) {
    console.error('/api/partner/signup:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
