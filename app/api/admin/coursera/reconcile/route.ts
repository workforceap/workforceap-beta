import { NextRequest, NextResponse } from 'next/server';

import { getUser } from '@/lib/auth/server';
import { isAdminInOrg } from '@/lib/auth/roles';
import { listAllUsers, type B4BUser } from '@/lib/coursera/b4bClient';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { captureApiError } from '@/lib/observability/captureApiError';
import { withApiGuc } from '@/lib/db/withRequestGuc';

/**
 * GET /api/admin/coursera/reconcile?programId=<courseraProgramId>&limit=<n>
 *
 * Reconciliation report between Coursera For Business roster and the WAP
 * `User` table for the actor's organization. Returns:
 *   summary  — counts of matched / coursera-only / wap-only / wrong-course
 *   rows     — per-row details (capped at `limit`, default 200)
 *
 * The "wrong-course" status compares the program the learner is in on
 * Coursera against the WAP `CourseEnrollment.programSlug`. For now we
 * don't auto-translate Coursera programIds to WAP slugs at the API level
 * — the row's `detail` string surfaces both ids so the admin can decide.
 *
 * Auth gate:
 *   - signed in
 *   - admin in the actor's organization (super_admin bypasses tenant)
 */

// The Coursera roster drain + a full WAP user scan can exceed the platform
// default; allow the full 60s window.
export const maxDuration = 60;

const DEFAULT_PROGRAM_ID = 'TpIlAogTQ8-SJQKIE8PP9w';
const DEFAULT_ROW_LIMIT = 200;
const MAX_ROW_LIMIT = 1000;
// Hard ceiling on the WAP-side scan so one org can never load an unbounded
// table into memory. If hit, the response is flagged `truncated` and the
// wap-only / matched counts are lower bounds.
const MAX_WAP_USER_SCAN = 20000;

type RowStatus = 'matched' | 'coursera-only' | 'wap-only' | 'wrong-course';

type ReconcileRow = {
  email: string;
  fullName: string | null;
  courseraExternalId: string | null;
  wapUserId: string | null;
  status: RowStatus;
  detail?: string;
};

type ReconcileResponse = {
  ranAt: string;
  programId: string;
  summary: {
    courseraUsers: number;
    wapUsers: number;
    matched: number;
    courseraOnly: number;
    wapOnly: number;
    wrongCourse: number;
  };
  /** True when the WAP user scan hit MAX_WAP_USER_SCAN; summary counts are then lower bounds. */
  truncated: boolean;
  rows: ReconcileRow[];
};

function normEmail(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase();
}

async function _GET(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  
    let orgId: string;
    try {
      orgId = await getActorOrganizationId(user.id);
    } catch (err) {
      captureApiError(err, { route: 'admin/coursera/reconcile' });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  
    if (!(await isAdminInOrg(user.id, orgId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  
    const url = new URL(request.url);
    const programId =
      url.searchParams.get('programId')?.trim() ||
      process.env.COURSERA_PROGRAM_ID?.trim() ||
      DEFAULT_PROGRAM_ID;
    const rawLimit = Number(url.searchParams.get('limit') ?? DEFAULT_ROW_LIMIT);
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(Math.floor(rawLimit), MAX_ROW_LIMIT)
        : DEFAULT_ROW_LIMIT;
  
    let courseraUsers: B4BUser[] = [];
    try {
      const drained = await listAllUsers({ pageLimit: 1000 });
      courseraUsers = drained.elements;
    } catch (err) {
      captureApiError(err, { route: 'admin/coursera/reconcile' });
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? `Coursera roster fetch failed: ${err.message}`
              : 'Coursera roster fetch failed',
        },
        { status: 502 },
      );
    }
  
    // Build Coursera-side index keyed by lowercased email.
    const courseraByEmail = new Map<string, B4BUser>();
    for (const u of courseraUsers) {
      const email = normEmail(u.email);
      if (!email) continue;
      if (!courseraByEmail.has(email)) courseraByEmail.set(email, u);
    }
  
    // Pull all WAP users + their CourseEnrollment for this org.
    // Both reads pinned to the actor's org via withTenantScope.
    const wapUsersScanned = await withTenantScope(orgId, (db) =>
      db.user.findMany({
        where: { deletedAt: null },
        orderBy: { id: 'asc' },
        take: MAX_WAP_USER_SCAN + 1,
        select: {
          id: true,
          email: true,
          fullName: true,
          enrolledProgram: true,
          // Multi-program: use the primary enrollment's slug for the reconcile
          // comparison. Secondary enrollments aren't surfaced in this view.
          courseEnrollments: {
            where: { isPrimary: true },
            select: { programSlug: true },
            take: 1,
          },
        },
      }),
    );
  
    const truncated = wapUsersScanned.length > MAX_WAP_USER_SCAN;
    const wapUsers = truncated ? wapUsersScanned.slice(0, MAX_WAP_USER_SCAN) : wapUsersScanned;

    const wapByEmail = new Map<
      string,
      { id: string; email: string; fullName: string; programSlug: string | null }
    >();
    for (const u of wapUsers) {
      const email = normEmail(u.email);
      if (!email) continue;
      wapByEmail.set(email, {
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        programSlug: u.courseEnrollments[0]?.programSlug ?? u.enrolledProgram ?? null,
      });
    }
  
    // Build the union of emails on either side.
    const allEmails = new Set<string>([...courseraByEmail.keys(), ...wapByEmail.keys()]);
  
    let matched = 0;
    let courseraOnly = 0;
    let wapOnly = 0;
    let wrongCourse = 0;
    const rows: ReconcileRow[] = [];
  
    for (const email of allEmails) {
      const cu = courseraByEmail.get(email);
      const wu = wapByEmail.get(email);
  
      if (cu && wu) {
        // Both sides present. Determine course alignment: if the Coursera
        // user's `membershipProgramIds` doesn't include the requested
        // programId AND the WAP user has a non-null programSlug, flag as
        // wrong-course. Otherwise count as matched.
        const courseraProgramIds = Array.isArray(cu.membershipProgramIds)
          ? cu.membershipProgramIds
          : [];
        const courseraInRequestedProgram = courseraProgramIds.includes(programId);
        const wapHasProgram = Boolean(wu.programSlug);
  
        if (!courseraInRequestedProgram && wapHasProgram) {
          wrongCourse += 1;
          const otherList = courseraProgramIds.length
            ? courseraProgramIds.join(', ')
            : '(none)';
          rows.push({
            email: wu.email,
            fullName: wu.fullName ?? cu.fullName ?? null,
            courseraExternalId: cu.externalId ?? cu.id ?? null,
            wapUserId: wu.id,
            status: 'wrong-course',
            detail: `WAP enrolled in "${wu.programSlug}"; Coursera membershipProgramIds=[${otherList}], expected ${programId}`,
          });
        } else {
          matched += 1;
          rows.push({
            email: wu.email,
            fullName: wu.fullName ?? cu.fullName ?? null,
            courseraExternalId: cu.externalId ?? cu.id ?? null,
            wapUserId: wu.id,
            status: 'matched',
          });
        }
      } else if (cu) {
        courseraOnly += 1;
        rows.push({
          email: cu.email ?? email,
          fullName: cu.fullName ?? null,
          courseraExternalId: cu.externalId ?? cu.id ?? null,
          wapUserId: null,
          status: 'coursera-only',
          detail: 'Learner exists in Coursera roster but not in WorkforceAP',
        });
      } else if (wu) {
        wapOnly += 1;
        rows.push({
          email: wu.email,
          fullName: wu.fullName,
          courseraExternalId: null,
          wapUserId: wu.id,
          status: 'wap-only',
          detail: wu.programSlug
            ? `WAP enrolled in "${wu.programSlug}" but learner is not in Coursera roster`
            : 'WAP user is not in Coursera roster',
        });
      }
    }
  
    // Sort rows: issues first (wrong-course → coursera-only → wap-only),
    // matched last; within group, by email for stability.
    const order: Record<RowStatus, number> = {
      'wrong-course': 0,
      'coursera-only': 1,
      'wap-only': 2,
      matched: 3,
    };
    rows.sort((a, b) => {
      const diff = order[a.status] - order[b.status];
      if (diff !== 0) return diff;
      return a.email.localeCompare(b.email);
    });
  
    const response: ReconcileResponse = {
      ranAt: new Date().toISOString(),
      programId,
      summary: {
        courseraUsers: courseraByEmail.size,
        wapUsers: wapByEmail.size,
        matched,
        courseraOnly,
        wapOnly,
        wrongCourse,
      },
      truncated,
      rows: rows.slice(0, limit),
    };
  
    return NextResponse.json(response);
  } catch (error) {
    console.error('/admin/coursera/reconcile:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const GET = withApiGuc(_GET);
