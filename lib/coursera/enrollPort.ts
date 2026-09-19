import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';
import {
  createProgramMembership,
  enrollUserInCourse,
  inviteUserToProgram,
  getB4BOrgId,
  listUsers,
  type B4BUser,
} from '@/lib/coursera/b4bClient';
import type { B4BPort, EnrollAuditEvent } from '@/lib/coursera/enrollState';
import { nextEnrollmentReportStart } from '@/lib/coursera/enrollmentReportFields';

/**
 * Shared B4B port + audit writer for the enroll state machine
 * (`lib/coursera/enrollState.ts`). Two routes drive the same state graph:
 *   - POST /api/member/coursera/enroll-in-course   (member self-service;
 *     actor === target)
 *   - POST /api/admin/coursera/enroll-member       (admin one-click; actor
 *     is the admin, target is the member)
 * Keeping the port and the audit shape here guarantees both paths spend
 * seats and record the trail identically.
 */

/**
 * Roster lookups walk the whole B4B users list page-by-page (Coursera has no
 * email filter on this endpoint). A short-TTL cache absorbs double-clicks and
 * the admin-approves-then-enrolls sequence without re-scanning up to 50 pages
 * per click. Only a completed lookup can cache a negative. Cache entries are
 * isolated by provider organization, and failures are never cached.
 */
const ROSTER_LOOKUP_TTL_MS = 60_000;
const rosterLookupCache = new Map<string, { at: number; user: B4BUser | null }>();

export class CourseraRosterIncompleteError extends Error {
  readonly code = 'COURSERA_ROSTER_INCOMPLETE';

  constructor(readonly reason: 'page_limit' | 'pagination' | 'configuration_changed', cause?: unknown) {
    super('Coursera roster lookup did not complete. No invitation was attempted.', { cause });
    this.name = 'CourseraRosterIncompleteError';
  }
}

function assertRosterOrganization(orgId: string): void {
  if (getB4BOrgId() !== orgId) throw new CourseraRosterIncompleteError('configuration_changed');
}

async function listUsersByEmailUncached(email: string, orgId: string): Promise<B4BUser | null> {
  const target = email.trim().toLowerCase();
  const PAGE_LIMIT = 200;
  const SAFETY_PAGES = 50;
  let start = 0;
  for (let pages = 0; pages < SAFETY_PAGES; pages += 1) {
    assertRosterOrganization(orgId);
    const result = await listUsers({ start, limit: PAGE_LIMIT });
    assertRosterOrganization(orgId);
    const hit = result.elements.find(
      (u: B4BUser) => (u.email ?? '').trim().toLowerCase() === target,
    );
    if (hit) return hit;
    try {
      const next = nextEnrollmentReportStart({
        start, batchLength: result.elements.length, limit: PAGE_LIMIT, ...result.paging,
      });
      if (next === null) return null;
      start = next;
    } catch (error) {
      throw new CourseraRosterIncompleteError('pagination', error);
    }
  }
  throw new CourseraRosterIncompleteError('page_limit');
}

export function buildB4BPort(): B4BPort {
  return {
    listUsersByEmail: async (email: string) => {
      const orgId = getB4BOrgId();
      const target = email.trim().toLowerCase();
      const key = JSON.stringify([orgId, target]);
      const cached = rosterLookupCache.get(key);
      if (cached && Date.now() - cached.at < ROSTER_LOOKUP_TTL_MS) {
        return cached.user;
      }
      const user = await listUsersByEmailUncached(target, orgId);
      rosterLookupCache.set(key, { at: Date.now(), user });
      return user;
    },
    invite: async (args) =>
      inviteUserToProgram(args.orgId, args.programId, {
        externalId: args.externalId,
        fullName: args.fullName,
        email: args.email,
        sendEmail: true,
      }),
    createMembership: async (args) =>
      createProgramMembership(args.orgId, args.programId, {
        externalId: args.externalId,
        fullName: args.fullName,
        email: args.email,
      }),
    enroll: async (args) =>
      enrollUserInCourse(args.orgId, args.programId, {
        externalId: args.externalId,
        contentType: 'Course',
        contentId: args.contentId,
        action: 'ENROLL',
      }),
  };
}

/** Test-only: reset the roster-lookup cache between cases. */
export function _resetRosterLookupCacheForTesting() {
  rosterLookupCache.clear();
}

/**
 * Map an `EnrollAuditEvent` to `audit_logs`. Actor and target diverge on the
 * admin path — the seat-spend trail must show WHO clicked (admin) and WHOSE
 * seat was spent (member). Self-service passes the same id for both.
 */
export async function writeEnrollAudit(args: {
  actorUserId: string;
  actorRole: 'member' | 'admin' | 'super_admin';
  targetUserId: string;
  event: EnrollAuditEvent;
}): Promise<void> {
  const { actorUserId, actorRole, targetUserId, event } = args;
  await auditLog({
    actorUserId,
    action: event.action,
    targetType: 'User',
    targetId: targetUserId,
    metadata: {
      step: event.step,
      programId: event.programId,
      contentId: event.contentId,
      externalId: event.externalId,
      b4bStatus: event.httpStatus,
      ...(actorUserId !== targetUserId ? { enrolledByAdmin: actorUserId } : {}),
      ...('alreadyEnrolled' in event && event.alreadyEnrolled
        ? { alreadyEnrolled: true }
        : {}),
    },
  });
  logAuditEvent({
    user: { id: actorUserId, role: actorRole },
    verb: event.action,
    object: { type: 'CourseraEnrollment', id: targetUserId },
    result: {
      success: true,
      extensions: { step: event.step, programId: event.programId, contentId: event.contentId },
    },
  }).catch(() => {});
}
