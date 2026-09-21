import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { withSystemGuc } from '@/lib/db/withRequestGuc';
import { crossTenantOK } from '@/lib/tenant/withTenantScope';
import { EXACT_EMAIL_CANDIDATE_LIMIT, pickExactEmailMatch } from '@/lib/db/exactEmailMatch';
import { sendCourseraUnmatchedActorAlertEmail } from '@/lib/email';
import { runBulkEmailOperation } from '@/lib/email/pacing';
import { isLikelyTestAccount } from '@/lib/coursera/testAccountHeuristic';

export type XapiIdentity = {
  email?: string | null;
  actorIdentifier?: string | null;
  actorHomePage?: string | null;
};

export type ResolvedXapiUser = {
  userId: string;
  email: string;
  fullName: string;
  mappingMethod: 'manual_actor' | 'manual_email' | 'direct_email';
  mappingId?: string;
};

type MappingRow = {
  id: string;
  userId: string;
  organizationId: string | null;
  courseraEmail: string | null;
  actorIdentifier: string | null;
  actorHomePage: string | null;
  source: string;
  notes: string | null;
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  userEmail: string;
  userFullName: string;
};

type TenantScopeOptions = {
  organizationId?: string | null;
  expectedUserId?: string | null;
};

type CourseraMappingDb = typeof prisma | Prisma.TransactionClient;

/*
 * WAP-24: inbound xAPI identity resolution is cross-tenant by nature. A
 * statement carries an actor email or account, not a tenant, so the `users`
 * lookups in this module run under the system GUC (`withSystemGuc`) rather
 * than whatever request context happens to be active, inside `$transaction`
 * so the GUC middleware sees a transaction-local context (lib/db/prisma.ts),
 * and are marked `crossTenantOK` for scripts/audit-tenant-scoping.cjs. Each
 * read still narrows by `organizationId` where the caller supplied one; the
 * wrapper is about which RLS role performs the read, not about widening it.
 */

type DirectXapiEmailUser = {
  id: string;
  email: string;
  fullName: string;
  organizationId: string;
};

let ensureTablesPromise: Promise<void> | null = null;

function normalizeEmail(value: string | null | undefined) {
  const email = value?.trim().toLowerCase() || '';
  return email || null;
}

function normalizeActorValue(value: string | null | undefined) {
  const normalized = value?.trim() || '';
  return normalized || null;
}

function normalizeOrganizationId(value: string | null | undefined) {
  const normalized = value?.trim() || '';
  return normalized || null;
}

function orgScopeSql(columnSql: Prisma.Sql, organizationId: string | null | undefined) {
  const orgId = normalizeOrganizationId(organizationId);
  // Use NULLIF to treat empty string as NULL in SQL, matching the updated
  // get_current_org_id() helper that wraps with NULLIF(..., '')
  // (Sprint 2 compliance: 20260614180000_s2_compliance_guc_nullif_xapi_org).
  return orgId
    ? Prisma.sql`AND NULLIF(${columnSql}, '') = NULLIF(${orgId}::text, '')`
    : Prisma.empty;
}

export async function ensureCourseraMappingTables() {
  if (!ensureTablesPromise) {
    ensureTablesPromise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS coursera_identity_mappings (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          organization_id TEXT,
          coursera_email TEXT,
          actor_identifier TEXT,
          actor_home_page TEXT,
          source TEXT NOT NULL DEFAULT 'manual',
          notes TEXT,
          created_by_user_id TEXT,
          last_seen_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT coursera_identity_mappings_identity_check CHECK (
            coursera_email IS NOT NULL OR actor_identifier IS NOT NULL
          )
        )
      `);

      // Idempotent column add for environments where the table pre-existed
      // without organization_id (Sprint P1 / AUDIT §C-S5). See migration
      // 20260519050000_xapi_organization_id.
      await prisma.$executeRawUnsafe(`
        ALTER TABLE coursera_identity_mappings
        ADD COLUMN IF NOT EXISTS organization_id TEXT
      `);

      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS coursera_identity_mappings_email_key
        ON coursera_identity_mappings (LOWER(coursera_email))
        WHERE coursera_email IS NOT NULL
      `);

      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS coursera_identity_mappings_actor_key
        ON coursera_identity_mappings (actor_identifier, COALESCE(actor_home_page, ''))
        WHERE actor_identifier IS NOT NULL
      `);

      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS coursera_identity_mappings_user_id_idx
        ON coursera_identity_mappings (user_id)
      `);

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS coursera_xapi_events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          statement_id TEXT UNIQUE,
          actor_email TEXT,
          actor_identifier TEXT,
          actor_home_page TEXT,
          course_slug TEXT,
          course_name TEXT,
          verb_id TEXT,
          matched_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
          organization_id TEXT,
          mapping_method TEXT,
          completion_status TEXT NOT NULL DEFAULT 'received',
          error TEXT,
          raw_payload JSONB NOT NULL,
          received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);

      await prisma.$executeRawUnsafe(`
        ALTER TABLE coursera_xapi_events
        ADD COLUMN IF NOT EXISTS organization_id TEXT
      `);

      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS coursera_xapi_events_actor_email_idx
        ON coursera_xapi_events (LOWER(actor_email))
      `);

      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS coursera_xapi_events_status_idx
        ON coursera_xapi_events (completion_status, received_at DESC)
      `);

      // WAP-33: FK to users(id) was unindexed (Supabase advisor). Mirrored in
      // prisma/migrations/20260921010000_wap33_fk_indexes_drop_duplicates for
      // environments where the table already exists.
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS coursera_xapi_events_matched_user_id_idx
        ON coursera_xapi_events (matched_user_id)
      `);

      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS coursera_unmatched_actor_alerts (
          actor_email_lower TEXT PRIMARY KEY,
          organization_id TEXT,
          first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          first_statement_id TEXT,
          last_event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          email_notified_at TIMESTAMPTZ
        )
      `);

      await prisma.$executeRawUnsafe(`
        ALTER TABLE coursera_unmatched_actor_alerts
        ADD COLUMN IF NOT EXISTS organization_id TEXT
      `);

      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS coursera_unmatched_actor_alerts_seen_idx
        ON coursera_unmatched_actor_alerts (first_seen_at DESC)
      `);
    })().catch((error) => {
      ensureTablesPromise = null;
      throw error;
    });
  }

  await ensureTablesPromise;
}

async function notifyIfNewUnmatchedActorEmail(args: {
  actorEmailLower: string;
  statementId: string | null;
  organizationId?: string | null;
}): Promise<void> {
  await ensureCourseraMappingTables();

  const emailLower = args.actorEmailLower.trim().toLowerCase();
  if (!emailLower) return;

  // Smoke/self/load-test actors (test-smoke@…, force-test-…, self-test@…)
  // are not real learners; alerting on them buries the actual unmatched
  // members the admin needs to act on.
  if (isLikelyTestAccount(emailLower)) return;

  const sid = args.statementId?.trim() || null;
  const orgId = args.organizationId?.trim() || null;

  const inserted = await prisma.$queryRaw<Array<{ one: number }>>`
    INSERT INTO coursera_unmatched_actor_alerts (actor_email_lower, first_statement_id, organization_id)
    VALUES (${emailLower}, ${sid}, ${orgId})
    ON CONFLICT (actor_email_lower) DO NOTHING
    RETURNING 1 AS one
  `;

  if (inserted.length === 0) {
    await prisma.$executeRaw`
      UPDATE coursera_unmatched_actor_alerts
      SET last_event_at = now()
      WHERE actor_email_lower = ${emailLower}
    `;
    return;
  }

  console.warn(
    '[COURSERA UNMATCHED ACTOR] NEW Coursera actor email with no portal member mapping — ' +
      `actor_email=${emailLower} statement_id=${sid ?? '(none)'}. ` +
      'Add a Coursera identity mapping (Admin → Coursera).',
  );

  try {
    const result = await runBulkEmailOperation(() => sendCourseraUnmatchedActorAlertEmail({
      actorEmail: emailLower,
      statementId: sid,
    }));
    if (result.ok) {
      await prisma.$executeRaw`
        UPDATE coursera_unmatched_actor_alerts
        SET email_notified_at = now()
        WHERE actor_email_lower = ${emailLower}
      `;
    }
  } catch (error) {
    console.error('[COURSERA UNMATCHED ACTOR] alert email failed:', error);
  }
}

async function getMappingByActor(identity: XapiIdentity): Promise<MappingRow | null> {
  return getMappingByActorInOrg(identity, null);
}

async function getMappingByActorInOrg(
  identity: XapiIdentity,
  organizationId: string | null | undefined,
): Promise<MappingRow | null> {
  const actorIdentifier = normalizeActorValue(identity.actorIdentifier);
  if (!actorIdentifier) return null;
  const actorHomePage = normalizeActorValue(identity.actorHomePage) || '';
  const orgFilter = orgScopeSql(Prisma.sql`u.organization_id`, organizationId);

  const rows = await prisma.$queryRaw<MappingRow[]>`
    SELECT
      cim.id,
      cim.user_id AS "userId",
      cim.organization_id AS "organizationId",
      cim.coursera_email AS "courseraEmail",
      cim.actor_identifier AS "actorIdentifier",
      cim.actor_home_page AS "actorHomePage",
      cim.source,
      cim.notes,
      cim.last_seen_at AS "lastSeenAt",
      cim.created_at AS "createdAt",
      cim.updated_at AS "updatedAt",
      u.email AS "userEmail",
      u.full_name AS "userFullName"
    FROM coursera_identity_mappings cim
    JOIN users u ON u.id = cim.user_id
    WHERE cim.actor_identifier = ${actorIdentifier}
      AND COALESCE(cim.actor_home_page, '') = ${actorHomePage}
      AND u.deleted_at IS NULL
      AND cim.organization_id = u.organization_id
      ${orgFilter}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

async function getMappingByEmail(identity: XapiIdentity): Promise<MappingRow | null> {
  return getMappingByEmailInOrg(identity, null);
}

async function getMappingByEmailInOrg(
  identity: XapiIdentity,
  organizationId: string | null | undefined,
): Promise<MappingRow | null> {
  const email = normalizeEmail(identity.email);
  if (!email) return null;
  const orgFilter = orgScopeSql(Prisma.sql`u.organization_id`, organizationId);

  const rows = await prisma.$queryRaw<MappingRow[]>`
    SELECT
      cim.id,
      cim.user_id AS "userId",
      cim.organization_id AS "organizationId",
      cim.coursera_email AS "courseraEmail",
      cim.actor_identifier AS "actorIdentifier",
      cim.actor_home_page AS "actorHomePage",
      cim.source,
      cim.notes,
      cim.last_seen_at AS "lastSeenAt",
      cim.created_at AS "createdAt",
      cim.updated_at AS "updatedAt",
      u.email AS "userEmail",
      u.full_name AS "userFullName"
    FROM coursera_identity_mappings cim
    JOIN users u ON u.id = cim.user_id
    WHERE LOWER(cim.coursera_email) = ${email}
      AND u.deleted_at IS NULL
      AND cim.organization_id = u.organization_id
      ${orgFilter}
    LIMIT 1
  `;

  return rows[0] ?? null;
}

async function getDirectXapiEmailUser(
  identity: XapiIdentity,
  organizationId: string | null,
): Promise<DirectXapiEmailUser | null> {
  const email = normalizeEmail(identity.email);
  if (!email) return null;

  // `mode: 'insensitive'` compiles to ILIKE, so `_`/`%` in the actor mbox are
  // wildcards: `m_johnson@x.org` also matches `mrjohnson@x.org`. The mbox
  // arrives on a caller-supplied xAPI statement and the resolved user gets a
  // permanent Coursera identity link, so an ILIKE hit is not proof of
  // identity. Collect the candidates, then keep only a genuine
  // case-insensitive equality. See lib/db/exactEmailMatch.ts.
  // WAP-24: system-GUC identity read (see the note above CourseraMappingDb).
  const candidates = await crossTenantOK(() =>
    withSystemGuc(() =>
      prisma.$transaction((tx) =>
        tx.user.findMany({
          where: {
            ...(organizationId ? { organizationId } : {}),
            deletedAt: null,
            email: {
              equals: email,
              mode: 'insensitive',
            },
          },
          select: { id: true, email: true, fullName: true, organizationId: true },
          take: EXACT_EMAIL_CANDIDATE_LIMIT,
        }),
      ),
    ),
  );

  return pickExactEmailMatch(candidates, email);
}

export async function resolveXapiUser(
  identity: XapiIdentity,
  options: TenantScopeOptions = {},
): Promise<ResolvedXapiUser | null> {
  await ensureCourseraMappingTables();
  const organizationId = normalizeOrganizationId(options.organizationId);
  const expectedUserId = options.expectedUserId?.trim() || null;

  const actorMapping = await getMappingByActorInOrg(identity, organizationId);
  const emailMapping = await getMappingByEmailInOrg(identity, organizationId);
  if (actorMapping && emailMapping && actorMapping.userId !== emailMapping.userId) {
    console.warn('[resolveXapiUser] actor and email mappings resolve to different users');
    return null;
  }

  const selectedMapping = actorMapping ?? emailMapping;
  if (selectedMapping && expectedUserId && selectedMapping.userId !== expectedUserId) {
    console.warn('[resolveXapiUser] mapped identity does not match expected replay target');
    return null;
  }

  const directUser = selectedMapping
    ? await getDirectXapiEmailUser(identity, organizationId)
    : null;
  if (selectedMapping && directUser && directUser.id !== selectedMapping.userId) {
    console.warn('[resolveXapiUser] explicit mapping conflicts with active portal email owner');
    return null;
  }

  if (actorMapping) {
    await prisma.$executeRaw`
      UPDATE coursera_identity_mappings
      SET last_seen_at = now(), updated_at = now()
      WHERE id = ${actorMapping.id}::uuid
    `;

    return {
      userId: actorMapping.userId,
      email: actorMapping.userEmail,
      fullName: actorMapping.userFullName,
      mappingMethod: 'manual_actor',
      mappingId: actorMapping.id,
    };
  }

  if (emailMapping) {
    await prisma.$executeRaw`
      UPDATE coursera_identity_mappings
      SET last_seen_at = now(), updated_at = now()
      WHERE id = ${emailMapping.id}::uuid
    `;

    return {
      userId: emailMapping.userId,
      email: emailMapping.userEmail,
      fullName: emailMapping.userFullName,
      mappingMethod: 'manual_email',
      mappingId: emailMapping.id,
    };
  }

  const email = normalizeEmail(identity.email);
  if (!email) return null;

  // Direct portal email match — no profile/role filter: super_admin and other
  // platform accounts resolve the same way as members for xAPI ingest.
  const user = await getDirectXapiEmailUser(identity, organizationId);

  if (!user) return null;
  if (expectedUserId && user.id !== expectedUserId) {
    console.warn('[resolveXapiUser] direct email owner does not match expected replay target');
    return null;
  }

  // Auto-save through the guarded mapping transaction so historical raw rows
  // are adopted atomically and an existing identity can never be stolen.
  try {
    const { mapCourseraIdentityAndProgress } = await import(
      '@/lib/coursera/mapIdentityAndProgress.server'
    );
    await mapCourseraIdentityAndProgress({
      userId: user.id,
      organizationId: user.organizationId,
      courseraEmail: email,
      actorIdentifier: identity.actorIdentifier ?? null,
      actorHomePage: identity.actorHomePage ?? null,
      source: 'auto-direct-email',
    });
  } catch (mappingError) {
    // Fail closed: without the guarded mapping/adoption transaction succeeding,
    // crediting this event could assign an identity owned by another member.
    console.warn('[resolveXapiUser] auto-mapping failed:', mappingError);
    return null;
  }

  return {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    mappingMethod: 'direct_email',
  };
}

export async function recordXapiEvent(args: {
  statementId?: string;
  identity: XapiIdentity;
  courseSlug?: string;
  courseName?: string;
  verbId?: string;
  matchedUserId?: string;
  organizationId?: string | null;
  mappingMethod?: string;
  completionStatus: 'completed' | 'ignored' | 'unmatched' | 'error';
  error?: string;
  rawPayload: unknown;
}) {
  await ensureCourseraMappingTables();

  const statementId = normalizeActorValue(args.statementId);
  const actorEmail = normalizeEmail(args.identity.email);
  const actorIdentifier = normalizeActorValue(args.identity.actorIdentifier);
  const actorHomePage = normalizeActorValue(args.identity.actorHomePage);
  const courseSlug = normalizeActorValue(args.courseSlug);
  const courseName = normalizeActorValue(args.courseName);
  const verbId = normalizeActorValue(args.verbId);
  const matchedUserId = normalizeActorValue(args.matchedUserId);
  const mappingMethod = normalizeActorValue(args.mappingMethod);
  const error = normalizeActorValue(args.error);
  const rawPayload = JSON.stringify(args.rawPayload ?? {});

  // Resolve organization_id from the matched user when we have one. This
  // closes AUDIT §C-S5: cross-tenant xAPI ingest leak.
  let organizationId = normalizeOrganizationId(args.organizationId);
  if (matchedUserId) {
    try {
      // WAP-24: system-GUC identity read (see the note above CourseraMappingDb).
      const userRow = await crossTenantOK(() =>
        withSystemGuc(() =>
          prisma.$transaction((tx) =>
            tx.user.findUnique({
              where: { id: matchedUserId },
              select: { organizationId: true },
            }),
          ),
        ),
      );
      organizationId = userRow?.organizationId ?? null;
    } catch (err) {
      // Non-fatal: event still records, organization_id stays NULL.
      console.warn('[recordXapiEvent] org lookup failed:', err);
    }
  }

  // Fallback: if organizationId is still null, use a sentinel value
  // to satisfy NOT NULL constraint on coursera_xapi_events.
  // This handles unmatched actors and lookup failures gracefully.
  if (!organizationId) {
    organizationId = 'unknown';
  }

  if (statementId) {
    await prisma.$executeRaw`
      INSERT INTO coursera_xapi_events (
        statement_id,
        actor_email,
        actor_identifier,
        actor_home_page,
        course_slug,
        course_name,
        verb_id,
        matched_user_id,
        organization_id,
        mapping_method,
        completion_status,
        error,
        raw_payload,
        updated_at
      ) VALUES (
        ${statementId}::text,
        ${actorEmail}::text,
        ${actorIdentifier}::text,
        ${actorHomePage}::text,
        ${courseSlug}::text,
        ${courseName}::text,
        ${verbId}::text,
        ${matchedUserId ? matchedUserId : null}::text,
        ${organizationId}::text,
        ${mappingMethod}::text,
        ${args.completionStatus}::text,
        ${error}::text,
        CAST(${rawPayload} AS jsonb),
        now()
      )
      ON CONFLICT (statement_id) DO UPDATE SET
        actor_email = EXCLUDED.actor_email,
        actor_identifier = EXCLUDED.actor_identifier,
        actor_home_page = EXCLUDED.actor_home_page,
        course_slug = EXCLUDED.course_slug,
        course_name = EXCLUDED.course_name,
        verb_id = EXCLUDED.verb_id,
        matched_user_id = EXCLUDED.matched_user_id,
        organization_id = EXCLUDED.organization_id,
        mapping_method = EXCLUDED.mapping_method,
        completion_status = EXCLUDED.completion_status,
        error = EXCLUDED.error,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = now()
    `;
  } else {
    await prisma.$executeRaw`
      INSERT INTO coursera_xapi_events (
        actor_email,
        actor_identifier,
        actor_home_page,
        course_slug,
        course_name,
        verb_id,
        matched_user_id,
        organization_id,
        mapping_method,
        completion_status,
        error,
        raw_payload,
        updated_at
      ) VALUES (
        ${actorEmail}::text,
        ${actorIdentifier}::text,
        ${actorHomePage}::text,
        ${courseSlug}::text,
        ${courseName}::text,
        ${verbId}::text,
        ${matchedUserId ? matchedUserId : null}::text,
        ${organizationId}::text,
        ${mappingMethod}::text,
        ${args.completionStatus}::text,
        ${error}::text,
        CAST(${rawPayload} AS jsonb),
        now()
      )
    `;
  }

  if (
    args.completionStatus === 'unmatched'
    && actorEmail
    && !mappingMethod
  ) {
    // This may be the first-seen actor and therefore an actual provider send.
    // Await the paced operation so scheduled replay cannot finish while the
    // alert is still pending or lose its delivery-state update.
    await notifyIfNewUnmatchedActorEmail({
      actorEmailLower: actorEmail,
      statementId: statementId ?? null,
      organizationId,
    }).catch((err) => {
      console.error('[recordXapiEvent] unmatched actor alert failed:', err);
    });
  }
}

export async function listCourseraIdentityMappings(options: TenantScopeOptions = {}) {
  await ensureCourseraMappingTables();
  const orgFilter = orgScopeSql(Prisma.sql`COALESCE(cim.organization_id, u.organization_id)`, options.organizationId);

  return prisma.$queryRaw<MappingRow[]>`
    SELECT
      cim.id,
      cim.user_id AS "userId",
      cim.organization_id AS "organizationId",
      cim.coursera_email AS "courseraEmail",
      cim.actor_identifier AS "actorIdentifier",
      cim.actor_home_page AS "actorHomePage",
      cim.source,
      cim.notes,
      cim.last_seen_at AS "lastSeenAt",
      cim.created_at AS "createdAt",
      cim.updated_at AS "updatedAt",
      u.email AS "userEmail",
      u.full_name AS "userFullName"
    FROM coursera_identity_mappings cim
    JOIN users u ON u.id = cim.user_id
    WHERE 1=1
      ${orgFilter}
    ORDER BY cim.updated_at DESC, cim.created_at DESC
    LIMIT 200
  `;
}

export async function listCourseraIdentityMappingsForUser(userId: string) {
  await ensureCourseraMappingTables();

  return prisma.$queryRaw<MappingRow[]>`
    SELECT
      cim.id,
      cim.user_id AS "userId",
      cim.organization_id AS "organizationId",
      cim.coursera_email AS "courseraEmail",
      cim.actor_identifier AS "actorIdentifier",
      cim.actor_home_page AS "actorHomePage",
      cim.source,
      cim.notes,
      cim.last_seen_at AS "lastSeenAt",
      cim.created_at AS "createdAt",
      cim.updated_at AS "updatedAt",
      u.email AS "userEmail",
      u.full_name AS "userFullName"
    FROM coursera_identity_mappings cim
    JOIN users u ON u.id = cim.user_id
    WHERE cim.user_id = ${userId}
    ORDER BY cim.updated_at DESC, cim.created_at DESC
    LIMIT 10
  `;
}

export type CourseraSkillsetProgressSummary = {
  totalRows: number;
  latestSyncedAt: Date | null;
  topMembers: Array<{
    userId: string;
    userEmail: string;
    userFullName: string;
    skillsetId: string;
    skillsetName: string;
    progressPct: number;
    programId: string;
    programSlug: string | null;
    lastSyncedAt: Date;
  }>;
};

export async function getCourseraSkillsetProgressSummary(
  topLimit = 10,
  options: TenantScopeOptions = {},
): Promise<CourseraSkillsetProgressSummary> {
  // The CourseraSkillsetProgress table is owned by Prisma and may not exist yet
  // in environments that haven't run `prisma migrate deploy`. Treat any access
  // failure as a soft-empty so the admin page still renders.
  try {
    const organizationId = normalizeOrganizationId(options.organizationId);
    const [aggregate, top] = await Promise.all([
      prisma.courseraSkillsetProgress.aggregate({
        ...(organizationId ? { where: { user: { organizationId } } } : {}),
        _count: { _all: true },
        _max: { lastSyncedAt: true },
      }),
      prisma.courseraSkillsetProgress.findMany({
        ...(organizationId ? { where: { user: { organizationId } } } : {}),
        orderBy: [{ progressPct: 'desc' }, { lastSyncedAt: 'desc' }],
        take: topLimit,
        select: {
          userId: true,
          skillsetId: true,
          skillsetName: true,
          progressPct: true,
          programId: true,
          programSlug: true,
          lastSyncedAt: true,
          user: { select: { email: true, fullName: true } },
        },
      }),
    ]);

    return {
      totalRows: aggregate._count._all,
      latestSyncedAt: aggregate._max.lastSyncedAt ?? null,
      topMembers: top.map((row) => ({
        userId: row.userId,
        userEmail: row.user.email,
        userFullName: row.user.fullName,
        skillsetId: row.skillsetId,
        skillsetName: row.skillsetName,
        progressPct: row.progressPct,
        programId: row.programId,
        programSlug: row.programSlug,
        lastSyncedAt: row.lastSyncedAt,
      })),
    };
  } catch (error) {
    console.warn('[xapi/mappings] coursera_skillset_progress unavailable:', error);
    return { totalRows: 0, latestSyncedAt: null, topMembers: [] };
  }
}

export type CourseraUnmatchedActorAlertStats = {
  distinctUnmatchedActorEmails: number;
  newAlertRowsLast7Days: number;
  recentFirstSeen: Array<{ actorEmailLower: string; firstSeenAt: Date }>;
};

/**
 * Admin surfacing: distinct unmatched actor inboxes in `coursera_xapi_events`, plus
 * dedupe rows from `coursera_unmatched_actor_alerts` (first-seen tracking for alerts).
 */
export async function getCourseraUnmatchedActorAlertStats(
  options: TenantScopeOptions = {},
): Promise<CourseraUnmatchedActorAlertStats> {
  await ensureCourseraMappingTables();
  const eventOrgFilter = orgScopeSql(Prisma.sql`organization_id`, options.organizationId);
  const alertOrgFilter = orgScopeSql(Prisma.sql`organization_id`, options.organizationId);

  const [distinctRow, recentRows, weekRow] = await Promise.all([
    prisma.$queryRaw<Array<{ c: bigint | number }>>`
      SELECT COUNT(DISTINCT LOWER(TRIM(actor_email)))::bigint AS c
      FROM coursera_xapi_events
      WHERE completion_status = 'unmatched'
        AND mapping_method IS NULL
        AND actor_email IS NOT NULL
        AND TRIM(actor_email) <> ''
        ${eventOrgFilter}
    `,
    prisma.$queryRaw<Array<{ actorEmailLower: string; firstSeenAt: Date }>>`
      SELECT actor_email_lower AS "actorEmailLower", first_seen_at AS "firstSeenAt"
      FROM coursera_unmatched_actor_alerts
      WHERE 1=1
        ${alertOrgFilter}
      ORDER BY first_seen_at DESC
      LIMIT 8
    `,
    prisma.$queryRaw<Array<{ c: bigint | number }>>`
      SELECT COUNT(*)::bigint AS c
      FROM coursera_unmatched_actor_alerts
      WHERE first_seen_at >= now() - interval '7 days'
        ${alertOrgFilter}
    `,
  ]);

  return {
    distinctUnmatchedActorEmails: Number(distinctRow[0]?.c ?? 0),
    newAlertRowsLast7Days: Number(weekRow[0]?.c ?? 0),
    recentFirstSeen: recentRows.map((r) => ({
      actorEmailLower: r.actorEmailLower,
      firstSeenAt: r.firstSeenAt,
    })),
  };
}

export async function listRecentUnmatchedXapiEvents(
  limit = 50,
  options: TenantScopeOptions = {},
) {
  await ensureCourseraMappingTables();
  const orgFilter = orgScopeSql(Prisma.sql`organization_id`, options.organizationId);

  return prisma.$queryRaw<Array<{
    id: string;
    statementId: string | null;
    actorEmail: string | null;
    actorIdentifier: string | null;
    actorHomePage: string | null;
    courseSlug: string | null;
    courseName: string | null;
    verbId: string | null;
    completionStatus: string;
    error: string | null;
    receivedAt: Date;
    updatedAt: Date;
  }>>`
    SELECT
      id,
      statement_id AS "statementId",
      actor_email AS "actorEmail",
      actor_identifier AS "actorIdentifier",
      actor_home_page AS "actorHomePage",
      course_slug AS "courseSlug",
      course_name AS "courseName",
      verb_id AS "verbId",
      completion_status AS "completionStatus",
      error,
      received_at AS "receivedAt",
      updated_at AS "updatedAt"
    FROM coursera_xapi_events
    WHERE completion_status IN ('unmatched', 'error')
      ${orgFilter}
    ORDER BY received_at DESC
    LIMIT ${limit}
  `;
}

export async function upsertCourseraIdentityMapping(args: {
  userId: string;
  courseraEmail?: string | null;
  actorIdentifier?: string | null;
  actorHomePage?: string | null;
  notes?: string | null;
  createdByUserId?: string | null;
  source?: string;
  expectedOrganizationId?: string | null;
}, db: CourseraMappingDb = prisma) {
  await ensureCourseraMappingTables();

  const courseraEmail = normalizeEmail(args.courseraEmail);
  const actorIdentifier = normalizeActorValue(args.actorIdentifier);
  const actorHomePage = normalizeActorValue(args.actorHomePage);
  const notes = normalizeActorValue(args.notes);
  const createdByUserId = normalizeActorValue(args.createdByUserId);
  const source = normalizeActorValue(args.source) || 'manual';

  if (!courseraEmail && !actorIdentifier) {
    throw new Error('courseraEmail or actorIdentifier is required');
  }

  const identityUserArgs = {
    where: { id: args.userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      organizationId: true,
      deletedAt: true,
    },
  } satisfies Prisma.UserFindUniqueArgs;
  // WAP-24: system-GUC identity read (see the note above CourseraMappingDb).
  // A caller-supplied transaction client already carries its own context and
  // cannot open a nested $transaction, so it is used as-is.
  const user = await crossTenantOK(() =>
    withSystemGuc(() =>
      '$transaction' in db
        ? db.$transaction((tx) => tx.user.findUnique(identityUserArgs))
        : db.user.findUnique(identityUserArgs),
    ),
  );

  if (!user || user.deletedAt) throw new Error('Active user not found');
  const expectedOrganizationId = normalizeOrganizationId(args.expectedOrganizationId);
  if (expectedOrganizationId && user.organizationId !== expectedOrganizationId) {
    throw new Error('User is outside your organization');
  }
  const expectedOrgFilter = expectedOrganizationId
    ? Prisma.sql`AND (organization_id = ${expectedOrganizationId}::text OR organization_id IS NULL)`
    : Prisma.empty;

  // A Coursera email that is also an active portal login belongs to that
  // portal user. Mapping it to anyone else would make B4B/CSV and xAPI choose
  // different learners, so lock the direct owner and fail closed.
  const directEmailOwners = courseraEmail
    ? await db.$queryRaw<Array<{ id: string }>>`
        SELECT direct_user.id
        FROM users AS direct_user
        WHERE direct_user.deleted_at IS NULL
          AND LOWER(direct_user.email) = ${courseraEmail}::text
        ORDER BY direct_user.id
        FOR SHARE
      `
    : [];
  if (directEmailOwners.some((directUser) => directUser.id !== args.userId)) {
    throw new Error('Coursera email belongs to a different active WAP user');
  }

  const actorMatch = actorIdentifier
    ? await db.$queryRaw<Array<{ id: string; userId: string }>>`
        SELECT id, user_id AS "userId"
        FROM coursera_identity_mappings
        WHERE actor_identifier = ${actorIdentifier}::text
          AND COALESCE(actor_home_page, '') = COALESCE(${actorHomePage}::text, '')
          ${expectedOrgFilter}
        LIMIT 1
      `
    : [];

  const emailMatch = !actorMatch[0] && courseraEmail
    ? await db.$queryRaw<Array<{ id: string; userId: string }>>`
        SELECT id, user_id AS "userId"
        FROM coursera_identity_mappings
        WHERE LOWER(coursera_email) = ${courseraEmail}::text
          ${expectedOrgFilter}
        LIMIT 1
      `
    : [];

  const existingMatch = actorMatch[0] ?? emailMatch[0] ?? null;
  const existingId = existingMatch?.id ?? null;

  if (existingMatch && existingMatch.userId !== args.userId) {
    throw new Error('Coursera identity is already mapped to a different WAP user');
  }

  if (existingId) {
    const updated = await db.$queryRaw<Array<{ id: string }>>`
      UPDATE coursera_identity_mappings
      SET
        user_id = ${args.userId}::text,
        organization_id = ${user.organizationId}::text,
        coursera_email = ${courseraEmail}::text,
        actor_identifier = ${actorIdentifier}::text,
        actor_home_page = ${actorHomePage}::text,
        notes = ${notes}::text,
        source = ${source}::text,
        created_by_user_id = COALESCE(created_by_user_id, ${createdByUserId ? createdByUserId : null}::text),
        updated_at = now(),
        last_seen_at = COALESCE(last_seen_at, now())
      WHERE id = ${existingId}::uuid
        AND user_id = ${args.userId}::text
        AND (
          NULLIF(organization_id, '') IS NULL
          OR organization_id = ${user.organizationId}::text
        )
      RETURNING id
    `;
    if (updated.length !== 1) {
      throw new Error(
        'Coursera identity is already linked to a different WAP user or organization',
      );
    }
  } else {
    await db.$executeRaw`
      INSERT INTO coursera_identity_mappings (
        user_id,
        organization_id,
        coursera_email,
        actor_identifier,
        actor_home_page,
        notes,
        source,
        created_by_user_id,
        last_seen_at
      ) VALUES (
        ${args.userId}::text,
        ${user.organizationId}::text,
        ${courseraEmail}::text,
        ${actorIdentifier}::text,
        ${actorHomePage}::text,
        ${notes}::text,
        ${source}::text,
        ${createdByUserId ? createdByUserId : null}::text,
        now()
      )
    `;
  }

  const rows = await db.$queryRaw<MappingRow[]>`
    SELECT
      cim.id,
      cim.user_id AS "userId",
      cim.organization_id AS "organizationId",
      cim.coursera_email AS "courseraEmail",
      cim.actor_identifier AS "actorIdentifier",
      cim.actor_home_page AS "actorHomePage",
      cim.source,
      cim.notes,
      cim.last_seen_at AS "lastSeenAt",
      cim.created_at AS "createdAt",
      cim.updated_at AS "updatedAt",
      u.email AS "userEmail",
      u.full_name AS "userFullName"
    FROM coursera_identity_mappings cim
    JOIN users u ON u.id = cim.user_id
    WHERE cim.user_id = ${args.userId}::text
      AND (
        (${courseraEmail}::text IS NOT NULL AND LOWER(cim.coursera_email) = ${courseraEmail}::text)
        OR (${actorIdentifier}::text IS NOT NULL AND cim.actor_identifier = ${actorIdentifier}::text AND COALESCE(cim.actor_home_page, '') = COALESCE(${actorHomePage}::text, ''))
      )
    ORDER BY cim.updated_at DESC
    LIMIT 1
  `;

  return rows[0] ?? null;
}
