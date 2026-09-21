import 'server-only';

import { prisma } from '@/lib/db/prisma';
import { withSystemGuc } from '@/lib/db/withRequestGuc';
import { crossTenantOK } from '@/lib/tenant/withTenantScope';
import { EXACT_EMAIL_CANDIDATE_LIMIT, pickExactEmailMatch } from '@/lib/db/exactEmailMatch';
import { handleInboundParsedStatement } from '@/lib/xapi/inboundStatementPipeline';
import { parseXapiStatement } from '@/lib/xapi/statements';
import { mapCourseraIdentityAndProgress } from '@/lib/coursera/mapIdentityAndProgress.server';
import {
  replayPendingXapiStatements,
  type ReplayPendingXapiResult,
} from '@/lib/coursera/replayPendingXapi';
import { normalizePersistedXapiOrganizationId } from '@/lib/xapi/persistedOrganization';

type PersistedXapiEvent = {
  statement_id: string | null;
  actor_email: string | null;
  actor_identifier: string | null;
  organization_id: string | null;
  raw_payload: unknown;
};

export type ReprocessResult = {
  processed: number;
  matched: number;
  errors: number;
  details: Array<{
    statementId: string | null;
    actorEmail: string | null;
    result: 'matched' | 'already_processed' | 'no_payload' | 'parse_error' | 'error' | 'no_match';
    error?: string;
  }>;
  /**
   * Drained `xapi_statements.processed=false` rows in the same pass. Captured
   * here so the admin "Auto-heal all" button can report a single number that
   * covers both ingest paths in one click. Optional for callers that only
   * care about `coursera_xapi_events`.
   */
  pendingReplay?: ReplayPendingXapiResult;
};

/**
 * Re-process unmatched xAPI events that now might match with a newly saved mapping.
 * Queries `coursera_xapi_events` with completion_status IN ('unmatched', 'error')
 * that have a non-null raw_payload.
 */
export async function reprocessUnmatchedXapiEvents(args: {
  userId?: string;
  courseraEmail?: string | null;
  actorIdentifier?: string | null;
  limit?: number;
}): Promise<ReprocessResult> {
  const limit = Math.min(args.limit ?? 50, 200);
  const normalizedEmail = args.courseraEmail?.trim().toLowerCase() || null;
  const normalizedActor = args.actorIdentifier?.trim() || null;
  // The mbox probe below is a deliberate substring match (the stored mbox is
  // `mailto:<address>`), so it stays a LIKE. But `_`/`%` in the address are
  // otherwise wildcards inside that pattern, which would let one member's
  // address sweep in another's rows. Escape them so only the literal address
  // matches; ordinary addresses are unaffected. The surrounding `userId`
  // filter still bounds which rows can be credited.
  const mboxLikePattern =
    normalizedEmail === null ? null : `%${normalizedEmail.replace(/([!%_])/g, '!$1')}%`;

  // Find unmatched coursera_xapi_events that have raw_payload
  const unmatchedEvents = await prisma.$queryRaw<PersistedXapiEvent[]>`
    SELECT
      statement_id,
      actor_email,
      actor_identifier,
      organization_id,
      raw_payload
    FROM coursera_xapi_events
    WHERE completion_status IN ('unmatched', 'error')
      AND raw_payload IS NOT NULL
      AND (
        (${normalizedEmail}::text IS NOT NULL AND LOWER(actor_email) = ${normalizedEmail}::text)
        OR (${normalizedActor}::text IS NOT NULL AND actor_identifier = ${normalizedActor}::text)
        OR (
          ${normalizedEmail}::text IS NOT NULL
          AND actor_email IS NULL
          AND raw_payload->'actor'->>'mbox' ILIKE ${mboxLikePattern}::text ESCAPE '!'
        )
      )
    ORDER BY received_at DESC
    LIMIT ${limit}
  `;

  return runReprocessPipeline(unmatchedEvents, args.userId);
}

/**
 * Auto-heal: attempt to resolve any unmatched OR errored xAPI events by
 * re-running the inbound pipeline. This covers two cases the old narrower
 * implementation missed:
 *
 *   1. The actor already has a saved mapping in `coursera_identity_mappings`
 *      (e.g. Drew Harris) but the event landed BEFORE the mapping existed
 *      and was permanently flagged `unmatched`. The previous query had a
 *      `NOT EXISTS` clause that explicitly excluded those rows — so they
 *      stayed stuck forever and the dashboard kept reporting "needs
 *      attention" with `processed: yes`.
 *   2. Status `'error'` rows (resolver matched, downstream processing
 *      threw) were not picked up at all.
 *
 * For each candidate we re-parse the stored payload and re-run
 * `handleInboundParsedStatement`. That delegates to `resolveXapiUser`,
 * which already prefers the manual mapping table, then actor identifier,
 * then a direct `User.email` match (and auto-creates a mapping when a
 * direct match is found). On a successful resolve, the pipeline writes
 * `CourseProgress` (driving the dashboard %) and updates the
 * `coursera_xapi_events` row's `completion_status`, so the row drops out
 * of the "needs attention" queue.
 */
export async function autoHealUnmatchedXapiEvents(limit = 50): Promise<ReprocessResult> {
  const events = await prisma.$queryRaw<PersistedXapiEvent[]>`
    SELECT
      cxe.statement_id,
      cxe.actor_email,
      cxe.actor_identifier,
      cxe.organization_id,
      cxe.raw_payload
    FROM coursera_xapi_events cxe
    WHERE cxe.completion_status IN ('unmatched', 'error')
      AND cxe.raw_payload IS NOT NULL
      AND cxe.statement_id IS NOT NULL
    ORDER BY cxe.received_at DESC
    LIMIT ${limit}
  `;

  const result: ReprocessResult = {
    processed: 0,
    matched: 0,
    errors: 0,
    details: [],
  };

  for (const event of events) {
    try {
      const rawPayload =
        typeof event.raw_payload === 'string'
          ? JSON.parse(event.raw_payload)
          : event.raw_payload;

      const parsed = parseXapiStatement(rawPayload as Record<string, unknown>);
      if (!parsed) {
        result.details.push({
          statementId: event.statement_id,
          actorEmail: event.actor_email,
          result: 'parse_error',
        });
        result.errors += 1;
        continue;
      }

      const organizationId = normalizePersistedXapiOrganizationId(event.organization_id);
      if (!organizationId) {
        result.details.push({
          statementId: event.statement_id,
          actorEmail: event.actor_email,
          result: 'error',
          error: 'Persisted xAPI event has no trustworthy organization',
        });
        result.errors += 1;
        continue;
      }

      // If we have an actor email but the saved mapping table has no row
      // for it, optimistically auto-link any matching portal user so the
      // pipeline's direct-email branch resolves on the first try. (The
      // pipeline does this itself, but doing it up front keeps the
      // mapping table in sync for events that lack mbox but share an
      // actor identifier with another mapped row.)
      const actorEmail = event.actor_email?.trim().toLowerCase();
      if (actorEmail) {
        // `mode: 'insensitive'` compiles to ILIKE, so `_`/`%` in the stored
        // actor email are wildcards: `m_johnson@x.org` also matches
        // `mrjohnson@x.org`. The address came off a caller-supplied xAPI
        // statement, and this branch writes a permanent Coursera identity
        // link with no `expectedUserId` review — the `coursera-auto-heal`
        // cron calls it unattended. Collect the ILIKE candidates, then link
        // only a genuine case-insensitive equality. See
        // lib/db/exactEmailMatch.ts.
        // WAP-24: identity resolution is cross-tenant by nature, so the read
        // runs under the system GUC inside $transaction and is marked for
        // scripts/audit-tenant-scoping.cjs (see lib/xapi/mappings.ts). The
        // persisted event's organization still narrows the candidates.
        const directCandidates = await crossTenantOK(() =>
          withSystemGuc(() =>
            prisma.$transaction((tx) =>
              tx.user.findMany({
                where: {
                  organizationId,
                  deletedAt: null,
                  email: { equals: actorEmail, mode: 'insensitive' },
                },
                select: { id: true, email: true, organizationId: true },
                take: EXACT_EMAIL_CANDIDATE_LIMIT,
              }),
            ),
          ),
        );
        const directUser = pickExactEmailMatch(directCandidates, actorEmail);
        if (directUser) {
          await mapCourseraIdentityAndProgress({
            userId: directUser.id,
            organizationId,
            courseraEmail: actorEmail,
            actorIdentifier: parsed.actorIdentifier ?? event.actor_identifier ?? null,
            actorHomePage: parsed.actorHomePage ?? null,
            source: 'auto-healed',
          });
        }
      }

      const { completions } = await handleInboundParsedStatement(parsed, {
        organizationId,
        requireOrganizationId: true,
      });
      result.processed += 1;

      // After replay, read the canonical event status to decide whether the
      // resolver actually bound this statement to a user (matched) or it
      // stayed unmatched. Don't trust `completions` alone — non-completion
      // verbs (item-level progress) emit no completions even when matched,
      // and the row already updated `CourseProgress`.
      let matchedStatus: 'matched' | 'no_match' = 'no_match';
      if (parsed.statementId) {
        const eventRow = await prisma.$queryRaw<Array<{ status: string }>>`
          SELECT completion_status AS status
          FROM coursera_xapi_events
          WHERE statement_id = ${parsed.statementId}
          LIMIT 1
        `;
        const status = eventRow[0]?.status ?? 'unmatched';
        if (status === 'completed' || status === 'ignored') {
          matchedStatus = 'matched';
        }
      } else if (completions.some((c) => (c as { ok?: boolean }).ok === true)) {
        matchedStatus = 'matched';
      }

      if (matchedStatus === 'matched') result.matched += 1;

      result.details.push({
        statementId: event.statement_id,
        actorEmail: event.actor_email,
        result: matchedStatus,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Auto-heal failed';
      result.errors += 1;
      result.details.push({
        statementId: event.statement_id,
        actorEmail: event.actor_email,
        result: 'error',
        error: message,
      });
    }
  }

  // Also drain `xapi_statements.processed = false` rows. The attention queue
  // surfaces these as `reason = 'unprocessed'` (e.g. webhook arrived before
  // any identity mapping existed, or the pipeline crashed mid-flight before
  // calling `markXapiStatementProcessed`). These never wrote a
  // `coursera_xapi_events` row, so the SQL above misses them entirely. Run
  // the same pipeline against them so a single "Auto-heal all" click clears
  // both reasons.
  try {
    const pendingReplay = await replayPendingXapiStatements(limit);
    result.pendingReplay = pendingReplay;
    result.processed += pendingReplay.replayed;
    result.matched += pendingReplay.breakdown.completedOk + pendingReplay.breakdown.ignored;
    result.errors += pendingReplay.breakdown.errored;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Pending replay failed';
    result.errors += 1;
    result.details.push({
      statementId: null,
      actorEmail: null,
      result: 'error',
      error: `pending-replay: ${message}`,
    });
  }

  return result;
}

/**
 * Sister to `autoHealUnmatchedXapiEvents` that drains `'ignored'` events
 * whose `course_slug` now has a canonical mapping. The "ignored" bucket
 * holds events where the actor was bound to a user but the course slug
 * couldn't translate into our program/course slugs — typically because
 * `coursera_canonical_course_mappings` was empty for that program at
 * ingest time. Once the B4B-driven seeder fills the gap, those events
 * can promote to `course_progress` if we re-run them.
 *
 * Filters to only ignored events whose `course_slug` is now mapped, so
 * dead events (system telemetry, unmappable test slugs) don't churn on
 * every cron tick.
 */
export async function reprocessIgnoredXapiEventsWithMappings(
  limit = 100,
): Promise<ReprocessResult> {
  const events = await prisma.$queryRaw<PersistedXapiEvent[]>`
    SELECT
      cxe.statement_id,
      cxe.actor_email,
      cxe.actor_identifier,
      cxe.organization_id,
      cxe.raw_payload
    FROM coursera_xapi_events cxe
    WHERE cxe.completion_status = 'ignored'
      AND cxe.raw_payload IS NOT NULL
      AND cxe.statement_id IS NOT NULL
      AND cxe.course_slug IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM coursera_canonical_course_mappings m
        WHERE m.coursera_course_slug = cxe.course_slug
           OR m.canonical_course_slug = cxe.course_slug
      )
    ORDER BY cxe.received_at DESC
    LIMIT ${limit}
  `;

  return runReprocessPipeline(events);
}

async function runReprocessPipeline(
  events: PersistedXapiEvent[],
  expectedUserId?: string
): Promise<ReprocessResult> {
  const result: ReprocessResult = {
    processed: 0,
    matched: 0,
    errors: 0,
    details: [],
  };

  for (const event of events) {
    const statementId = event.statement_id;
    if (!statementId) {
      result.details.push({
        statementId: null,
        actorEmail: event.actor_email,
        result: 'no_payload',
      });
      continue;
    }

    try {
      const rawPayload =
        typeof event.raw_payload === 'string'
          ? JSON.parse(event.raw_payload)
          : event.raw_payload;

      const parsed = parseXapiStatement(rawPayload as Record<string, unknown>);
      if (!parsed) {
        result.details.push({
          statementId,
          actorEmail: event.actor_email,
          result: 'parse_error',
        });
        result.errors += 1;
        continue;
      }

      const organizationId = normalizePersistedXapiOrganizationId(event.organization_id);
      if (!organizationId) {
        result.details.push({
          statementId,
          actorEmail: event.actor_email,
          result: 'error',
          error: 'Persisted xAPI event has no trustworthy organization',
        });
        result.errors += 1;
        continue;
      }

      const { completions } = await handleInboundParsedStatement(parsed, {
        organizationId,
        expectedUserId,
        requireOrganizationId: true,
      });
      result.processed += 1;

      const wasMatched = completions.some((c) => (c as { ok?: boolean }).ok === true);
      if (wasMatched) {
        result.matched += 1;
      }

      result.details.push({
        statementId,
        actorEmail: event.actor_email,
        result: wasMatched ? 'matched' : 'no_match',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Re-process failed';
      result.errors += 1;
      result.details.push({
        statementId,
        actorEmail: event.actor_email,
        result: 'error',
        error: message,
      });
    }
  }

  return result;
}
