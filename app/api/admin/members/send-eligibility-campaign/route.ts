import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { checkBulkEmailRateLimit } from '@/lib/rate-limit';
import { sendEligibilityLink } from '@/lib/email';
import { auditLog } from '@/lib/audit';
import { auditRequestMeta, logAuditEvent } from '@/lib/audit/log';
import {
  buildEligibilityCampaignWhere,
  eligibilityCampaignSelect,
  ELIGIBILITY_SOFT_DEADLINE_LABEL,
} from '@/lib/admin/eligibilityDatasheet';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.workforceap.org';
/** Cap per request — same order as bulk-email to protect Resend reputation. */
const MAX_SEND = 100;

const bodySchema = z.object({
  /** Dry-run: return recipient count without sending. */
  dryRun: z.boolean().optional().default(false),
  /** Default true: only members missing ApplyEligibilityScreening. */
  missingScreeningOnly: z.boolean().optional().default(true),
  /** Optional hard cap (≤ MAX_SEND). */
  limit: z.number().int().min(1).max(MAX_SEND).optional().default(MAX_SEND),
});

/**
 * POST /api/admin/members/send-eligibility-campaign
 *
 * WS5 non-CHS campaign: email eligibility questionnaire links to existing
 * members excluding Concordia High School (CHS) partner referrals.
 * Copy includes a soft Sept 14 reminder — NO account lockout / disable.
 * Reuses sendEligibilityLink (same path as AdminMemberSendLinks).
 */
async function _POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isAdmin(user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { success: bulkRateOk } = await checkBulkEmailRateLimit(user.id);
    if (!bulkRateOk) {
      return NextResponse.json(
        { error: 'Bulk-email rate limit reached. Please wait an hour before sending another.' },
        { status: 429, headers: { 'Retry-After': '3600' } },
      );
    }

    let rawBody: unknown = {};
    try {
      rawBody = await request.json();
    } catch {
      rawBody = {};
    }
    const parsed = bodySchema.safeParse(rawBody ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { dryRun, missingScreeningOnly, limit } = parsed.data;
    const orgId = await getActorOrganizationId(user.id);
    const where = buildEligibilityCampaignWhere({ missingScreeningOnly });

    const recipients = await withTenantScope(orgId, (db) =>
      db.user.findMany({
        where,
        take: limit,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: eligibilityCampaignSelect,
      }),
    );

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        softDeadline: ELIGIBILITY_SOFT_DEADLINE_LABEL,
        lockout: false,
        recipientCount: recipients.length,
        recipients: recipients.map((r) => ({
          id: r.id,
          email: r.email,
          fullName: r.fullName,
        })),
      });
    }

    const url = `${SITE_URL}/dashboard/eligibility`;
    let sent = 0;
    const errors: string[] = [];

    for (const member of recipients) {
      if (!member.email) continue;
      const result = await sendEligibilityLink({
        to: member.email,
        recipientUserId: member.id,
        name: member.fullName,
        url,
        orgId: member.organizationId,
        softDeadlineReminder: true,
      });
      if (result.ok) {
        sent += 1;
      } else {
        errors.push(`${member.email}: ${result.error ?? 'send failed'}`);
      }
    }

    auditLog({
      actorUserId: user.id,
      action: 'admin_eligibility_campaign_sent',
      targetType: 'EligibilityCampaign',
      targetId: orgId,
      metadata: {
        sent,
        attempted: recipients.length,
        missingScreeningOnly,
        softDeadline: ELIGIBILITY_SOFT_DEADLINE_LABEL,
        lockout: false,
        errorCount: errors.length,
      },
    }).catch(() => {});
    logAuditEvent({
      user: { id: user.id, role: 'admin' },
      verb: 'sent',
      object: { type: 'EligibilityCampaign', id: orgId ?? 'default' },
      result: { success: true, extensions: { sent, attempted: recipients.length } },
      request: auditRequestMeta(request),
      orgId,
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      dryRun: false,
      softDeadline: ELIGIBILITY_SOFT_DEADLINE_LABEL,
      lockout: false,
      sent,
      attempted: recipients.length,
      errors: errors.slice(0, 20),
    });
  } catch (error) {
    console.error('/admin/members/send-eligibility-campaign error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withApiGuc(_POST);
