import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  attachRawCourseraProgressToUser,
  lockCourseraIdentityForAttachment,
  promoteCsvProgressToCanonical,
} from '@/lib/coursera/csvImport.server';
import {
  ensureCourseraMappingTables,
  upsertCourseraIdentityMapping,
} from '@/lib/xapi/mappings';

export type MapCourseraIdentityAndProgressArgs = {
  userId: string;
  organizationId: string;
  courseraEmail?: string | null;
  actorIdentifier?: string | null;
  actorHomePage?: string | null;
  createdByUserId?: string | null;
  source: string;
  notes?: string | null;
};

function normalizeMappingArgs(args: MapCourseraIdentityAndProgressArgs) {
  const normalized = {
    ...args,
    userId: args.userId.trim(),
    organizationId: args.organizationId.trim(),
    courseraEmail: args.courseraEmail?.trim().toLowerCase() || null,
    actorIdentifier: args.actorIdentifier?.trim() || null,
    actorHomePage: args.actorHomePage?.trim() || null,
  };

  if (!normalized.userId || !normalized.organizationId) {
    throw new Error('Coursera identity mapping requires a user and organization');
  }
  if (!normalized.courseraEmail && !normalized.actorIdentifier) {
    throw new Error('courseraEmail or actorIdentifier is required');
  }

  return normalized;
}

/**
 * Transaction-owned form for workflows that create the target user and must
 * commit that creation, raw adoption, and mapping as one unit.
 */
export async function mapCourseraIdentityAndProgressInTransaction(
  args: MapCourseraIdentityAndProgressArgs,
  tx: Prisma.TransactionClient,
) {
  const normalized = normalizeMappingArgs(args);
  const {
    userId,
    organizationId,
    courseraEmail,
    actorIdentifier,
    actorHomePage,
  } = normalized;

  await lockCourseraIdentityForAttachment(tx, {
    organizationId,
    courseraEmail,
    actorIdentifier,
    actorHomePage,
  });

  const targetUsers = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT target_user.id
    FROM users AS target_user
    WHERE target_user.id = ${userId}
      AND target_user.organization_id = ${organizationId}
      AND target_user.deleted_at IS NULL
    FOR SHARE
  `);
  if (targetUsers.length !== 1) {
    throw new Error('Coursera mapping target is outside the expected organization');
  }

  const identityFilters: Prisma.Sql[] = [];
  if (courseraEmail) {
    identityFilters.push(
      Prisma.sql`LOWER(existing_mapping.coursera_email) = ${courseraEmail}`,
    );
  }
  if (actorIdentifier) {
    identityFilters.push(Prisma.sql`(
      existing_mapping.actor_identifier = ${actorIdentifier}
      AND COALESCE(existing_mapping.actor_home_page, '') = COALESCE(${actorHomePage}, '')
    )`);
  }

  const conflictingMappings = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT existing_mapping.id
    FROM coursera_identity_mappings AS existing_mapping
    LEFT JOIN users AS existing_user ON existing_user.id = existing_mapping.user_id
    WHERE (${Prisma.join(identityFilters, ' OR ')})
      AND (
        existing_mapping.user_id <> ${userId}
        OR existing_user.id IS NULL
        OR existing_user.deleted_at IS NOT NULL
        OR existing_user.organization_id <> ${organizationId}
        OR (
          existing_mapping.organization_id IS NOT NULL
          AND existing_mapping.organization_id <> ${organizationId}
        )
      )
    LIMIT 1
  `);
  if (conflictingMappings.length > 0) {
    throw new Error('Coursera identity is already linked to a different WAP user or organization');
  }

  const attachment = courseraEmail
    ? await attachRawCourseraProgressToUser(
        {
          courseraEmail,
          userId,
          expectedOrganizationId: organizationId,
        },
        tx,
      )
    : { courseRowsUpdated: 0, badgeRowsUpdated: 0 };

  const mapping = await upsertCourseraIdentityMapping(
    {
      userId,
      courseraEmail,
      actorIdentifier,
      actorHomePage,
      createdByUserId: normalized.createdByUserId,
      source: normalized.source,
      notes: normalized.notes,
      expectedOrganizationId: organizationId,
    },
    tx,
  );

  return { mapping, backfill: attachment };
}

/**
 * Commit one reviewed identity decision across the mapping and both legacy raw
 * progress tables atomically. Canonical course promotion is a monotonic,
 * retryable post-commit projection;
 * it never sends historical xAPI notifications or learner rewards.
 */
export async function mapCourseraIdentityAndProgress(
  args: MapCourseraIdentityAndProgressArgs,
) {
  const normalized = normalizeMappingArgs(args);

  // Resolve runtime DDL before opening the ownership transaction. The upsert
  // helper repeats this call, but the cached promise is already settled.
  await ensureCourseraMappingTables();

  const committed = await prisma.$transaction((tx) =>
    mapCourseraIdentityAndProgressInTransaction(normalized, tx),
  );

  const promotion = normalized.courseraEmail
    ? await promoteCsvProgressToCanonical({
        organizationId: normalized.organizationId,
        userId: normalized.userId,
        courseraEmail: normalized.courseraEmail,
      })
    : { upserted: 0, unmapped: 0, learningPaths: 0, rollupsRefreshed: 0, errors: 0 };

  return {
    mapping: committed.mapping,
    backfill: {
      ...committed.backfill,
      promotion,
    },
  };
}
