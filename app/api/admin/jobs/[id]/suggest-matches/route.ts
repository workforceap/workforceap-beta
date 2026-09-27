import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { sendMatchActionEmail } from '@/lib/email';
import { recordWorkflowDiagnostic } from '@/lib/diagnostics';
import { getMatchSuggestionsTestRecipient, isMatchSuggestionsDryRun } from '@/lib/admin/matchSuggestionsConfig';

import { getActorOrganizationId } from '@/lib/tenant/organization';
import { withTenantScope } from '@/lib/tenant/withTenantScope';

import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';

async function recordSuggestAudit(input: {
  actorUserId: string;
  jobId: string;
  summary: string;
  status: 'started' | 'success' | 'fallback' | 'error' | 'inspection';
  httpStatus: number;
  metadata: Record<string, unknown>;
}) {
  try {
    await recordWorkflowDiagnostic({
      workflow: 'admin_match_suggestions',
      actorUserId: input.actorUserId,
      entityType: 'job',
      entityId: input.jobId,
      status: input.status,
      summary: input.summary,
      method: 'email',
      metadata: {
        ...input.metadata,
        httpStatus: input.httpStatus,
        actorUserId: input.actorUserId,
        jobId: input.jobId,
        at: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[admin_match_suggestions] recordSuggestAudit failed', {
      jobId: input.jobId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

class MatchSuggestionsHoldConflict extends Error {}

export const POST = withApiGuc(async (
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { id } = await params;
    const orgId = await getActorOrganizationId(user.id);

    const job = await withTenantScope(orgId, (db) =>
      db.job.findUnique({
        where: { id },
        include: {
          employer: { select: { contactEmail: true, companyName: true } },
          aiMatches: {
            // Filter before take: an erased top-ranked candidate must not
            // keep active candidates out of the batch on every retry.
            where: {
              status: 'suggested',
              student: {
                deletedAt: null,
                billingDeletionPendingAt: null,
                billingDeletionOperationId: null,
              },
            },
            include: {
              student: { select: { id: true, fullName: true, enrolledProgram: true } },
            },
            orderBy: { matchScore: 'desc' },
            take: 5,
          },
        },
      })
    );

    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    if (job.status !== 'live') {
      return NextResponse.json({ error: 'Match suggestions can only be sent for live jobs' }, { status: 400 });
    }
    if (job.matchSuggestionsLastStatus === 'needs_reconciliation') {
      return NextResponse.json({ error: 'A prior match email needs reconciliation before another send.' }, { status: 409 });
    }
    if (job.aiMatches.length === 0) {
      await recordSuggestAudit({
        actorUserId: user.id,
        jobId: id,
        summary: 'Attempted to send match suggestions with zero suggested matches',
        status: 'fallback',
        httpStatus: 400,
        metadata: { outcome: 'no_suggested_matches', matchCount: 0 },
      });
      return NextResponse.json({ error: 'No matches to suggest. Run AI matching first.' }, { status: 400 });
    }

    const intendedRecipient = job.employer.contactEmail;
    const testRecipient = getMatchSuggestionsTestRecipient();
    const actualRecipient = testRecipient ?? intendedRecipient;
    const testMode = Boolean(testRecipient);
    const dryRun = isMatchSuggestionsDryRun();
    const now = new Date();
    let matchCount = job.aiMatches.length;

    if (dryRun) {
      await withTenantScope(orgId, (db) =>
        db.job.update({
          where: { id },
          data: {
            matchSuggestionsLastSentAt: now,
            matchSuggestionsLastStatus: 'dry_run',
            matchSuggestionsLastError: null,
          },
        })
      );
      await recordSuggestAudit({
        actorUserId: user.id,
        jobId: id,
        summary: `Dry run - skipped Resend (${matchCount} match row(s))`,
        status: 'success',
        httpStatus: 200,
        metadata: {
          outcome: 'dry_run',
          dryRun: true,
          testMode,
          intendedRecipient,
          actualRecipient,
          matchCount,
        },
      });
      return NextResponse.json({ ok: true, dryRun: true, count: matchCount, testMode });
    }

    const candidateMatchIds = job.aiMatches.map((m) => m.id);
    // Both writes commit together. A crash after claiming rows but before
    // reserving the hold must leave neither change behind.
    let claimedRows: { id: string }[];
    try {
      claimedRows = await prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
          UPDATE ai_job_matches
          SET status = 'employer_notified'::ai_job_match_status, status_updated_at = ${now}
          WHERE id IN (${Prisma.join(candidateMatchIds)})
            AND job_id = ${id}
            AND status = 'suggested'::ai_job_match_status
            AND EXISTS (
              SELECT 1 FROM jobs
              WHERE jobs.id = ai_job_matches.job_id
                AND jobs.organization_id = ${orgId}
            )
          RETURNING id
        `);
        if (rows.length === 0) return rows;

        const reserved = await tx.job.updateMany({
          where: {
            id,
            organizationId: orgId,
            status: 'live',
            OR: [
              { matchSuggestionsLastStatus: null },
              { matchSuggestionsLastStatus: { not: 'needs_reconciliation' } },
            ],
          },
          data: {
            matchSuggestionsLastSentAt: now,
            matchSuggestionsLastStatus: 'needs_reconciliation',
            matchSuggestionsLastError: 'Provider outcome not yet confirmed',
          },
        });
        if (reserved.count !== 1) throw new MatchSuggestionsHoldConflict();
        return rows;
      });
    } catch (error) {
      if (error instanceof MatchSuggestionsHoldConflict) {
        return NextResponse.json({ error: 'A prior match email needs reconciliation before another send.' }, { status: 409 });
      }
      throw error;
    }
    const claimedIds = new Set(claimedRows.map((row) => row.id));
    const claimedMatches = job.aiMatches.filter((match) => claimedIds.has(match.id));
    matchCount = claimedMatches.length;

    if (matchCount === 0) {
      await recordSuggestAudit({
        actorUserId: user.id,
        jobId: id,
        summary: 'Attempted to send match suggestions but rows were already claimed',
        status: 'fallback',
        httpStatus: 409,
        metadata: { outcome: 'no_claimed_matches', matchCount: 0 },
      });
      return NextResponse.json({ error: 'Match suggestions are already being sent or were sent.' }, { status: 409 });
    }

    const releaseClaimedMatches = () => prisma.$transaction((tx) => tx.aIJobMatch.updateMany({
      where: { id: { in: Array.from(claimedIds) }, status: 'employer_notified' },
      data: { status: 'suggested', statusUpdatedAt: now },
    }));
    // The hold is durable before provider I/O. An unknown outcome leaves it
    // in place for operator reconciliation.
    const emailPayload = {
      to: actualRecipient,
      jobTitle: job.title,
      companyName: job.employer.companyName,
      subjectMemberIds: claimedMatches.map((m) => m.studentId),
      matches: claimedMatches.map((m) => ({
        name: m.student.fullName,
        program: m.student.enrolledProgram ?? '-',
        score: m.matchScore,
      })),
    };

    const sent = await sendMatchActionEmail(emailPayload);
    if (sent.uncertain) {
      await recordSuggestAudit({
        actorUserId: user.id,
        jobId: id,
        summary: 'Match email provider outcome needs reconciliation',
        status: 'fallback',
        httpStatus: 409,
        metadata: { outcome: 'needs_reconciliation', matchCount, testMode },
      });
      return NextResponse.json({ error: 'Match email outcome needs reconciliation before another send.' }, { status: 409 });
    }
    if (!sent.ok) {
      await releaseClaimedMatches();
      await withTenantScope(orgId, (db) =>
        db.job.update({
          where: { id },
          data: {
            matchSuggestionsLastSentAt: now,
            matchSuggestionsLastStatus: 'failed',
            matchSuggestionsLastError: sent.error ?? 'send failed',
          },
        })
      );
      await recordSuggestAudit({
        actorUserId: user.id,
        jobId: id,
        summary: `Match suggestion email failed: ${sent.error ?? 'unknown'}`,
        status: 'error',
        httpStatus: 502,
        metadata: {
          outcome: 'send_failed',
          error: sent.error ?? null,
          intendedRecipient,
          actualRecipient,
          testMode,
          matchCount,
        },
      });
      return NextResponse.json({ error: sent.error ?? 'Failed to send employer email' }, { status: 502 });
    }

    const lastStatus = testMode ? 'test_sent' : 'success';
    await withTenantScope(orgId, (db) =>
      db.job.update({
        where: { id },
        data: {
          matchSuggestionsLastSentAt: now,
          matchSuggestionsLastStatus: lastStatus,
          matchSuggestionsLastError: null,
        },
      })
    );

    const notifyResult = 'ok';

    await recordSuggestAudit({
      actorUserId: user.id,
      jobId: id,
      summary:
        notifyResult === 'ok'
          ? `Sent ${matchCount} AI match suggestion(s)${testMode ? ' (test inbox)' : ''}`
          : `Email delivered but employer_notified DB update failed (${notifyResult})`,
      status: notifyResult === 'ok' ? 'success' : 'fallback',
      httpStatus: 200,
      metadata: {
        outcome: notifyResult === 'ok' ? 'sent' : 'sent_db_notify_failed',
        intendedRecipient,
        actualRecipient,
        testMode,
        dryRun: false,
        matchCount,
        notifyResult,
      },
    });

    void auditLog({ actorUserId: user.id, action: 'admin_job_match_suggestions_sent', targetType: 'User', targetId: user.id, metadata: { jobId: id, count: matchCount } }).catch(() => {});
    logAuditEvent({ user: { id: user.id, role: 'admin' }, verb: 'created', object: { type: 'JobMatchSuggestions', id }, result: { success: true } }).catch(() => {});
    return NextResponse.json({
      ok: true,
      count: matchCount,
      testMode,
      employerNotifiedUpdate: notifyResult,
    });
  } catch (error) {
    console.error('/admin/jobs/[id]/suggest-matches:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
