import 'server-only';

import { prisma } from '@/lib/db/prisma';
import { handleInboundParsedStatement } from '@/lib/xapi/inboundStatementPipeline';
import { parseXapiStatement } from '@/lib/xapi/statements';
import { markXapiStatementProcessed } from '@/lib/xapi/storage';
import { xapiStatementRowToRawStatement } from '@/lib/xapi/xapiStatementRowToRaw';
import { normalizePersistedXapiOrganizationId } from '@/lib/xapi/persistedOrganization';

export type ReplayPendingXapiResult = {
  scanned: number;
  replayed: number;
  skippedUnparsed: number;
  /** Rows retained for retry because their persisted tenant is unresolved. */
  skippedUnresolvedOrganization: number;
  /** Total per-completion-verb side effects emitted (may include failures). */
  completionsEmitted: number;
  /** Sentinel 'unresolved-%' organization_ids repaired before this replay. */
  orgsRepaired?: number;
  /** Per-outcome breakdown so admin UIs can distinguish "0 matched" (no events
   *  resolved to a user) from "0 succeeded but 34 errored on course resolution"
   *  — different bugs, different fixes. */
  breakdown: {
    completedOk: number;
    /** Resolver matched, but downstream processing threw (e.g. course not found in catalog). */
    errored: number;
    /** Resolver matched, but the verb isn't a course completion (item-level, progressed, etc.). */
    ignored: number;
    /** Resolver couldn't bind the actor identity to a WAP user. */
    unmatched: number;
  };
};

/**
 * Drain `xapi_statements` rows still marked unprocessed (e.g. webhook arrived
 * before identity mapping existed, or transient failure after persist).
 */
export async function replayPendingXapiStatements(limit = 150): Promise<ReplayPendingXapiResult> {
  const orgsRepaired = await reconcileBeforeReplay();
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const rows = await prisma.$transaction((tx) =>
    tx.xapiStatement.findMany({
      where: { processed: false, createdAt: { gte: ninetyDaysAgo } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    }),
  );

  return _replayRows(rows, orgsRepaired);
}

/**
 * Replay all pending xAPI statements for a specific actor email.
 * Called immediately after mapping an unmatched Coursera learner so their
 * progress is reflected without waiting for the next hourly cron run.
 */
export async function replayPendingXapiStatementsForEmail(
  actorEmail: string,
): Promise<ReplayPendingXapiResult> {
  const orgsRepaired = await reconcileBeforeReplay();
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const rows = await prisma.$transaction((tx) =>
    tx.xapiStatement.findMany({
      take: 500,
      where: { processed: false, actorEmail, createdAt: { gte: ninetyDaysAgo } },
      orderBy: { createdAt: 'asc' },
    }),
  );

  return _replayRows(rows, orgsRepaired);
}


/**
 * Replay xAPI statements that previously landed as unmatched/error for an identity.
 * These rows may already be marked processed, so this intentionally queries the
 * authoritative coursera_xapi_events table instead of only processed=false rows.
 */
export async function replayUnresolvedXapiStatementsForIdentity(args: {
  courseraEmail?: string | null;
  actorIdentifier?: string | null;
  organizationId?: string | null;
  expectedUserId?: string | null;
  sinceDays?: number;
}): Promise<ReplayPendingXapiResult> {
  const email = args.courseraEmail?.trim().toLowerCase() || null;
  const actor = args.actorIdentifier?.trim() || null;
  const organizationId = normalizePersistedXapiOrganizationId(args.organizationId);
  const expectedUserId = args.expectedUserId?.trim() || null;
  if (!email && !actor) {
    return _replayRows([], 0);
  }

  const orgsRepaired = await reconcileBeforeReplay();
  const sinceDays = args.sinceDays ?? 30;
  const cutoff = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

  const rows = await prisma.$transaction(async (tx) => {
    const matchingStatementIds = await tx.$queryRaw<Array<{ statementId: string }>>`
      SELECT statement_id AS "statementId"
      FROM coursera_xapi_events
      WHERE completion_status IN ('unmatched', 'error')
        AND statement_id IS NOT NULL
        AND (
          (${email}::text IS NOT NULL AND LOWER(actor_email) = ${email}::text)
          OR (${actor}::text IS NOT NULL AND actor_identifier = ${actor}::text)
        )
        AND (${organizationId}::text IS NULL OR organization_id = ${organizationId}::text)
    `.then((result) => result.map((row) => row.statementId));

    return tx.xapiStatement.findMany({
      take: 500,
      where: {
        createdAt: { gte: cutoff },
        OR: [
          ...(email ? [{ actorEmail: email }] : []),
          ...(actor ? [{ actorAccountName: actor }] : []),
        ],
        statementId: { in: matchingStatementIds },
        ...(organizationId ? { organizationId } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
  });

  return _replayRows(rows, orgsRepaired, expectedUserId);
}

/**
 * Repair 'unresolved-%' sentinel organization_ids left by the ingest trigger
 * for statements that arrived before their actor's identity mapping existed.
 * Set-based so one call fixes every sentinel row any current mapping can now
 * resolve — under org-scoped RLS those rows are invisible to every tenant
 * until repaired. Returns the number of rows fixed.
 */
export async function reconcileUnresolvedXapiOrganizations(): Promise<number> {
  // WAP-33: in production this UPDATE had run 2,803 times at 97 ms mean and
  // repaired 0 rows — the three-way join costs the same whether or not any
  // sentinel row exists. One indexed probe first; no sentinel, no scan.
  if (!(await hasUnresolvedXapiOrganizations())) return 0;

  const repaired = await prisma.$executeRaw`
    UPDATE xapi_statements xs
    SET organization_id = u.organization_id
    FROM coursera_identity_mappings cim
    JOIN users u
      ON u.id = cim.user_id
     AND u.deleted_at IS NULL
     AND cim.organization_id = u.organization_id
    WHERE xs.organization_id LIKE 'unresolved-%'
      AND NOT EXISTS (
        SELECT 1
        FROM coursera_identity_mappings conflicting_mapping
        JOIN users conflicting_user
          ON conflicting_user.id = conflicting_mapping.user_id
         AND conflicting_user.deleted_at IS NULL
         AND conflicting_mapping.organization_id = conflicting_user.organization_id
        WHERE conflicting_mapping.user_id <> cim.user_id
          AND (
            (
              xs.actor_email IS NOT NULL
              AND conflicting_mapping.coursera_email IS NOT NULL
              AND LOWER(xs.actor_email) = LOWER(conflicting_mapping.coursera_email)
            )
            OR (
              xs.actor_account_name IS NOT NULL
              AND xs.actor_account_name = conflicting_mapping.actor_identifier
            )
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM users direct_user
        WHERE xs.actor_email IS NOT NULL
          AND direct_user.deleted_at IS NULL
          AND LOWER(direct_user.email) = LOWER(xs.actor_email)
          AND direct_user.id <> cim.user_id
      )
      AND (
        (xs.actor_email IS NOT NULL AND LOWER(xs.actor_email) = LOWER(cim.coursera_email))
        OR (xs.actor_account_name IS NOT NULL AND xs.actor_account_name = cim.actor_identifier)
      )
  `;
  return repaired;
}

/** The `organization_id LIKE 'unresolved-%'` filter shared by the probe, the count and the UPDATE. */
const UNRESOLVED_ORGANIZATION_WHERE = { organizationId: { startsWith: 'unresolved-' } } as const;

/**
 * Cheap existence probe for sentinel rows. A probe failure answers `true`
 * so the reconciliation UPDATE still runs: skipping is an optimisation and
 * must never hide a repair.
 */
async function hasUnresolvedXapiOrganizations(): Promise<boolean> {
  try {
    const row = await prisma.$transaction((tx) =>
      tx.xapiStatement.findFirst({ where: UNRESOLVED_ORGANIZATION_WHERE, select: { id: true } }),
    );
    return row !== null;
  } catch (err) {
    console.error('[replayPendingXapi] sentinel org probe failed; running reconciliation anyway', err);
    return true;
  }
}

/**
 * How many `xapi_statements` still carry an 'unresolved-%' sentinel
 * organization — rows invisible to every tenant under org-scoped RLS until a
 * mapping resolves them or staff triage the actor. Surfaced on
 * /admin/coursera (WAP-33) so the backlog gets worked, not just repaired.
 */
export async function countUnresolvedXapiOrganizations(): Promise<number> {
  return prisma.$transaction((tx) => tx.xapiStatement.count({ where: UNRESOLVED_ORGANIZATION_WHERE }));
}

async function reconcileBeforeReplay(): Promise<number> {
  return reconcileUnresolvedXapiOrganizations().catch((err) => {
    console.error('[replayPendingXapi] sentinel org reconciliation failed', err);
    return 0;
  });
}

async function _replayRows(
  rows: Awaited<ReturnType<typeof prisma.xapiStatement.findMany>>,
  orgsRepaired = 0,
  expectedUserId: string | null = null,
): Promise<ReplayPendingXapiResult> {
  let replayed = 0;
  let skippedUnparsed = 0;
  let skippedUnresolvedOrganization = 0;
  let completionsEmitted = 0;
  const breakdown = { completedOk: 0, errored: 0, ignored: 0, unmatched: 0 };

  for (const row of rows) {
    const organizationId = normalizePersistedXapiOrganizationId(row.organizationId);
    if (!organizationId) {
      skippedUnresolvedOrganization += 1;
      continue;
    }

    const raw = xapiStatementRowToRawStatement(row);
    const parsed = parseXapiStatement(raw);
    if (!parsed) {
      skippedUnparsed += 1;
      await markXapiStatementProcessed(row.statementId);
      continue;
    }

    replayed += 1;
    const result = await handleInboundParsedStatement(parsed, {
      organizationId,
      expectedUserId,
      requireOrganizationId: true,
    });
    completionsEmitted += result.completions.length;

    // Aggregate per-row outcome from the pipeline's classification. Reading
    // the just-written event row keeps this in lock-step with the
    // authoritative `completion_status` recorded by `recordXapiEvent`.
    if (parsed.statementId) {
      const eventRow = await prisma.$transaction((tx) =>
        tx.$queryRaw<Array<{ status: string }>>`
          SELECT completion_status AS status
          FROM coursera_xapi_events
          WHERE statement_id = ${parsed.statementId}
          LIMIT 1
        `,
      );
      const status = eventRow[0]?.status ?? 'unknown';
      if (status === 'completed') breakdown.completedOk += 1;
      else if (status === 'error') breakdown.errored += 1;
      else if (status === 'ignored') breakdown.ignored += 1;
      else if (status === 'unmatched') breakdown.unmatched += 1;
    }
  }

  return {
    scanned: rows.length,
    replayed,
    skippedUnparsed,
    skippedUnresolvedOrganization,
    completionsEmitted,
    orgsRepaired,
    breakdown,
  };
}
