import { createClient } from '@supabase/supabase-js';
import { getOrganizationBranding } from '@/lib/tenant/organizationBranding';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { reenableAuthUserAfterRestore } from '@/lib/admin/authUserLifecycle';
import { prisma } from '@/lib/db/prisma';
import { getResend } from '@/lib/email';
import { sendBrandedEmailOrThrowOnSkip as sendBrandedEmail } from '@/lib/email/send';
import { brandedEmailLayout } from '@/lib/email/template';
import { EMAIL_TEMPLATE_KEYS } from '@/lib/email/templateKeys';
import { recordWorkflowDiagnostic } from '@/lib/diagnostics';
import { logger } from '@/lib/observability/logger';
import { beginMemberUpload, MemberUploadLifecycleError, releaseMemberUpload } from '@/lib/member/uploadLifecycle';
import { classifyEmailSendFailure } from '@/lib/email/failureRecord';
import { interactiveTransactionsGuaranteed } from '@/lib/db/transactionPolicy';

export type PasswordResetSendResult = {
  error: { message: string } | null;
  /** Provider handling the request; acceptance is not proof of inbox delivery. */
  via: 'resend' | 'supabase' | 'skipped';
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isUserNotFound(error: { message: string; code?: string }): boolean {
  return error.code === 'user_not_found' || /user.*not.*found|no user/i.test(error.message);
}

/**
 * Find the exact active app identity for a reset request.
 *
 * Ops (9/5/26): an admin's reset link never arrived and the login answered
 * "Incorrect email or password" for every password. Before 9/2 the admin
 * soft-delete hard-deleted the Supabase auth user (see
 * `disableAuthUserForSoftDelete`), and `docs/auth-troubleshooting.md` lists
 * seeds/manual inserts as another source of Prisma-only accounts. GoTrue then
 * reports "user not found" to `generateLink`, which this module used to treat
 * as an unknown address and silently skip — so the member could neither sign
 * in nor recover.
 *
 * `ILIKE` treats `%` and `_` as wildcards. The exact comparison below prevents
 * an unauthenticated caller from binding a different identity to its address.
 */
async function activePrismaUserForReset(normalizedEmail: string) {
  let row: { id: string; email: string; fullName: string | null; phone: string | null } | null = null;
  // Explicit $transaction: admin reset-password callers run under a GUC
  // context, where a bare query is flagged by the Prisma middleware.
  // `mode: 'insensitive'` compiles to ILIKE on PostgreSQL, so `%` and `_` in
  // the caller-supplied address are wildcards, not literals. Keep only an
  // exact match; this also preserves real addresses containing underscores.
  const candidates = await prisma.$transaction((tx) => tx.user.findMany({
    where: { email: { equals: normalizedEmail, mode: 'insensitive' }, deletedAt: null,
      billingDeletionPendingAt: null, billingDeletionOperationId: null },
    select: { id: true, email: true, fullName: true, phone: true },
    take: 25,
  }));
  row = candidates.find((candidate) => candidate.email.trim().toLowerCase() === normalizedEmail) ?? null;
  if (!row && candidates.length) {
    logger.warn('passwordReset: reset lookup matched rows that are not the requested address; refusing self-heal', {
      candidateCount: candidates.length,
    });
  }
  return row;
}

/** Restore a missing Auth identity only while the caller owns the lifecycle claim. */
async function recreateAuthUserFromPrismaRow(
  admin: ReturnType<typeof getSupabaseAdmin>,
  row: NonNullable<Awaited<ReturnType<typeof activePrismaUserForReset>>>,
): Promise<boolean> {
  const result = await reenableAuthUserAfterRestore(admin, {
    id: row.id,
    // The matched row's own address, never the request string: the two can
    // differ (see above), and this value is what gets bound to `row.id` as a
    // Supabase auth identity.
    email: row.email,
    fullName: row.fullName,
    phone: row.phone,
  });
  if (!result.ok) {
    logger.error('passwordReset: auth user missing for an active users row and could not be re-created', {
      userId: row.id,
      reason: result.message,
    });
    return false;
  }
  logger.warn('passwordReset: re-created missing Supabase auth user for an active account', {
    userId: row.id,
    action: result.action,
  });
  return true;
}

/**
 * Send a password-reset email.
 *
 * Ops (9/2/26): the "Reset password" button was not delivering mail. The
 * previous implementation relied entirely on Supabase Auth's built-in mailer
 * (`resetPasswordForEmail`), which depends on the project's SMTP settings and
 * its redirect-URL allowlist — neither of which this codebase controls, and
 * both of which fail silently. We now mint the recovery token ourselves with
 * the service role (`auth.admin.generateLink`) and deliver it through Resend,
 * the same provider every other WorkforceAP email uses. The link carries the
 * `token_hash` that `/reset-password` already knows how to verify, so it does
 * not depend on the Supabase redirect allowlist at all.
 *
 * Track E (Sprint E.1 PR 2) — when `orgId` is supplied, the link's origin is
 * the org's `customDomain` (or default), so AAUL users land on AAUL's host.
 *
 * Falls back to the Supabase mailer when the branded provider is unavailable
 * or rejects delivery. This server-created fallback deliberately uses implicit
 * recovery: no browser PKCE verifier cookie exists for this server request.
 */
export async function sendPasswordResetEmail(
  email: string,
  redirectPath = '/reset-password',
  options: { orgId?: string | null } = {},
): Promise<PasswordResetSendResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Password reset is temporarily unavailable.');
  }

  // Preview flattens transactions and cannot hold the member lifecycle claim.
  // Fail identically for known and unknown addresses before looking up either.
  if (!interactiveTransactionsGuaranteed()) {
    throw new Error('Password reset is temporarily unavailable.');
  }

  const normalizedEmail = email.trim().toLowerCase();
  const branding = await getOrganizationBranding(options.orgId);
  const baseUrl = branding.domain;
  const resetPageUrl = `${baseUrl}${redirectPath}`;

  // Own the same durable lifecycle barrier as erasure and identity edits before
  // Auth can recreate a missing user or either mail provider can send a link.
  // A second exact read after claiming closes the lookup-to-claim email-edit
  // race; the claim then prevents erasure/edit until every provider call ends.
  const account = await activePrismaUserForReset(normalizedEmail);
  if (!account) return { error: { message: 'User not found' }, via: 'skipped' };
  let claimId: string;
  try {
    claimId = await beginMemberUpload(account.id, 'notification');
  } catch (error) {
    if (error instanceof MemberUploadLifecycleError && error.reason === 'member_inactive') {
      return { error: { message: 'User not found' }, via: 'skipped' };
    }
    throw error;
  }
  try {
    const current = await activePrismaUserForReset(normalizedEmail);
    if (!current || current.id !== account.id) {
      return { error: { message: 'User not found' }, via: 'skipped' };
    }
    return await sendPasswordResetEmailClaimed(normalizedEmail, resetPageUrl, branding, current, supabaseUrl, supabaseAnonKey);
  } finally {
    try {
      await releaseMemberUpload(account.id, claimId);
    } catch (error) {
      // A completed provider call must not become a retryable 503. The durable
      // row stays held for operator reconciliation if its release failed.
      logger.error('passwordReset: lifecycle claim release requires reconciliation', {
        errorClass: error instanceof Error ? error.name : 'unknown',
      });
    }
  }
}

async function sendPasswordResetEmailClaimed(
  normalizedEmail: string,
  resetPageUrl: string,
  branding: Awaited<ReturnType<typeof getOrganizationBranding>>,
  account: NonNullable<Awaited<ReturnType<typeof activePrismaUserForReset>>>,
  supabaseUrl: string,
  supabaseAnonKey: string,
): Promise<PasswordResetSendResult> {
  const resend = getResend();
  const canMintOwnLink = !!resend && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (canMintOwnLink) {
    try {
      const admin = getSupabaseAdmin();
      const mintRecoveryLink = () =>
        admin.auth.admin.generateLink({
          type: 'recovery',
          email: normalizedEmail,
          options: { redirectTo: resetPageUrl },
        });

      let { data, error } = await mintRecoveryLink();

      if (error && isUserNotFound(error)) {
        // No auth user — but is there an active app account? If so, bring the
        // login back under the same id and mint the link again.
        if (await recreateAuthUserFromPrismaRow(admin, account)) {
          ({ data, error } = await mintRecoveryLink());
        }
      }

      if (error) {
        // Unknown address: report as skipped so callers keep their uniform
        // "if an account exists" response without revealing anything.
        if (isUserNotFound(error)) {
          return { error: { message: error.message }, via: 'skipped' };
        }
        throw new Error(error.message);
      }

      const hashedToken = data?.properties?.hashed_token;
      const recoveryUrl = new URL(resetPageUrl);
      if (hashedToken) {
        recoveryUrl.searchParams.set('token_hash', hashedToken);
        recoveryUrl.searchParams.set('type', 'recovery');
      }
      const resetLink = hashedToken
        ? recoveryUrl.href
        : data?.properties?.action_link;
      if (!resetLink) {
        throw new Error('Supabase did not return a recovery link.');
      }

      const from = process.env.EMAIL_FROM || `${branding.name} <hello@workforceap.org>`;
      const html = brandedEmailLayout({
        title: 'Reset your password',
        bodyHtml: `
          <p>We received a request to reset the password for <strong>${escapeHtml(normalizedEmail)}</strong>.</p>
          <p>Click the button below to choose a new password. The link works once and expires in about an hour.</p>
          <p style="font-size:13px;color:#6b6b6b;">If you did not ask for this, you can ignore this email — your password will not change. Questions? Email <a href="mailto:${escapeHtml(branding.supportEmail)}">${escapeHtml(branding.supportEmail)}</a>.</p>
        `,
        ctaText: 'Reset password',
        ctaUrl: resetLink,
        branding,
      });

      await sendBrandedEmail(resend, {
        from,
        templateKey: EMAIL_TEMPLATE_KEYS.password_reset,
        to: normalizedEmail,
        recipientUserId: account.id,
        memberEffectClaim: true,
        subject: `Reset your ${branding.name} password`,
        html,
        text: `Reset your ${branding.name} password: ${resetLink}\n\nIf you did not request this, ignore this email. Your password will not change.`,
        replyTo: branding.supportEmail,
      });
      logger.info('passwordReset: recovery email accepted by provider', { via: 'resend' });
      return { error: null, via: 'resend' };
    } catch (err) {
      const errorClass = classifyEmailSendFailure(err).errorClass;
      logger.warn('passwordReset: branded delivery failed; trying Supabase mailer', { errorClass });
      // Recorded, not just logged: the Supabase mailer is unbranded and capped at
      // 30/h, so every fallback is a delivery-quality event operators should see.
      void recordWorkflowDiagnostic({
        workflow: 'password_reset',
        status: 'fallback',
        provider: 'resend',
        method: 'branded_email',
        fallbackPath: 'supabase_auth_mailer',
        summary: 'Branded password reset failed; fell back to the Supabase mailer',
        failureReason: `password_reset_${errorClass}`,
      });
    }
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      flowType: 'implicit',
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: resetPageUrl,
    });
    if (!error) logger.info('passwordReset: recovery request accepted by provider', { via: 'supabase' });
    return {
      error: error ? { message: error.message } : null,
      via: error && isUserNotFound(error) ? 'skipped' : 'supabase',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Password reset email could not be sent.';
    return { error: { message }, via: 'supabase' };
  }
}
