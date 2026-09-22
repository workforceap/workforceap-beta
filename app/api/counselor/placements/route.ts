import type { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { MEMBER_ONLY_ROLE_NOT } from '@/lib/admin/memberOnlyWhere';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isCounselor, isSuperAdmin } from '@/lib/auth/roles';
import { assertStaffCanAccessMemberRecord } from '@/lib/counselor/staffMemberAccess';
import { buildPlacementsQuery } from '@/lib/counselor/placementsQuery';
import { getProgramBySlug, getProgramDisplayTitle } from '@/lib/content/programs';
import { canonicalizeProgramSlug } from '@/lib/content/programSlug';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';
import { awardPoints } from '@/lib/member/points';
import { withApiGuc } from '@/lib/db/withRequestGuc';

const MEMBER_OPTION_LIMIT = 500;

const PLACEMENT_MEMBER_SELECT = {
  id: true,
  fullName: true,
  email: true,
  enrolledProgram: true,
  courseEnrollments: {
    take: 1,
    orderBy: [{ isPrimary: 'desc' }, { enrolledAt: 'desc' }],
    select: {
      programSlug: true,
      isPrimary: true,
      enrolledAt: true,
    },
  },
} satisfies Prisma.UserSelect;

type PlacementMember = Prisma.UserGetPayload<{ select: typeof PLACEMENT_MEMBER_SELECT }>;

type PlacementRow = {
  id: string;
  user_id: string;
  member_name: string | null;
  member_email: string;
  employer_name: string;
  job_title: string;
  start_date: Date | null;
  salary_offered: number | null;
  placed_at: Date;
  notes: string | null;
  program_slug: string | null;
};

function resolveCurrentProgram(member: Pick<PlacementMember, 'courseEnrollments' | 'enrolledProgram'>) {
  const storedValue = member.courseEnrollments[0]?.programSlug ?? member.enrolledProgram?.trim() ?? null;
  if (!storedValue) return { programSlug: null, programTitle: null };

  const program = getProgramBySlug(storedValue);
  if (program) {
    return {
      programSlug: program.slug,
      programTitle: getProgramDisplayTitle(program),
    };
  }

  return {
    programSlug: canonicalizeProgramSlug(storedValue),
    // An org-specific catalog key may not exist in the static public catalog.
    // Keep the internal key server-side instead of exposing it as staff-facing copy.
    programTitle: 'Assigned program',
  };
}

function resolvePlacementProgramTitle(programSlug: string | null): string | null {
  if (!programSlug?.trim()) return null;
  const program = getProgramBySlug(programSlug);
  return program ? getProgramDisplayTitle(program) : 'Assigned program';
}

async function loadAuthorizedMemberOptions(args: {
  staffUserId: string;
  admin: boolean;
  superAdmin: boolean;
  organizationId: string | null;
}) {
  const members = await prisma.$transaction((tx) => {
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      // Who may have a placement recorded is the one definition of "a member"
      // (lib/admin/memberOnlyWhere.ts), so the selector and the funder counts
      // name the same people. Role half only: a QA account can still be placed.
      NOT: MEMBER_ONLY_ROLE_NOT,
    };

    if (!args.superAdmin) {
      if (args.admin) {
        if (!args.organizationId) return Promise.resolve([] as PlacementMember[]);
        where.organizationId = args.organizationId;
      } else {
        where.counselorAssignments = {
          some: {
            active: true,
            counselor: { userId: args.staffUserId, active: true },
          },
        };
      }
    }

    return tx.user.findMany({
      where,
      select: PLACEMENT_MEMBER_SELECT,
      orderBy: [{ fullName: 'asc' }, { email: 'asc' }],
      take: MEMBER_OPTION_LIMIT,
    });
  });

  return members.map((member) => ({
    id: member.id,
    fullName: member.fullName,
    email: member.email,
    programTitle: resolveCurrentProgram(member).programTitle,
  }));
}

async function _GET(request: Request) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [admin, counselor, superAdmin] = await Promise.all([
      isAdmin(user.id),
      isCounselor(user.id),
      isSuperAdmin(user.id),
    ]);
    if (!admin && !counselor) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get('memberId');
    const days = parseInt(searchParams.get('days') ?? '0', 10);

    if (memberId && !(await assertStaffCanAccessMemberRecord(user.id, memberId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const organizationId = admin && !superAdmin
      ? (await prisma.$transaction((tx) =>
          tx.user.findUnique({
            where: { id: user.id },
            select: { organizationId: true },
          }),
        ))?.organizationId ?? null
      : null;

    if (admin && !superAdmin && !organizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { query, params } = buildPlacementsQuery({
      staffUserId: user.id,
      isAdmin: admin,
      isSuperAdmin: superAdmin,
      organizationId,
      memberId,
      days,
    });

    const [placementRows, memberOptions] = await Promise.all([
      prisma.$queryRawUnsafe<PlacementRow[]>(query, ...params),
      loadAuthorizedMemberOptions({
        staffUserId: user.id,
        admin,
        superAdmin,
        organizationId,
      }),
    ]);

    const placements = placementRows.map((placement) => ({
      ...placement,
      member_name: placement.member_name?.trim() || placement.member_email,
      program_title: resolvePlacementProgramTitle(placement.program_slug),
    }));

    return NextResponse.json({ placements, memberOptions });
  } catch (error) {
    console.error('/counselor/placements error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withApiGuc(_GET);

async function _POST(request: Request) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [admin, counselor] = await Promise.all([isAdmin(user.id), isCounselor(user.id)]);
    if (!admin && !counselor) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const raw: unknown = await request.json().catch(() => null);
    const body = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;

    const userId = typeof body.userId === 'string' ? body.userId : '';
    const employerName = typeof body.employerName === 'string' ? body.employerName.trim() : '';
    const jobTitle = typeof body.jobTitle === 'string' ? body.jobTitle.trim() : '';
    const startDate = typeof body.startDate === 'string' ? body.startDate : null;
    const salaryOffered = typeof body.salaryOffered === 'number' ? body.salaryOffered : null;
    const notes = typeof body.notes === 'string' ? body.notes.trim() : null;

    if (!userId || !employerName || !jobTitle) {
      return NextResponse.json({ error: 'Member, employer, and job title are required' }, { status: 400 });
    }

    if (!(await assertStaffCanAccessMemberRecord(user.id, userId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const member = await prisma.$transaction((tx) =>
      tx.user.findFirst({
        where: {
          id: userId,
          deletedAt: null,
          // Same eligibility as the selector above: the one member definition.
          NOT: MEMBER_ONLY_ROLE_NOT,
        },
        select: PLACEMENT_MEMBER_SELECT,
      }),
    );
    if (!member) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    // Program attribution is server-owned. Never trust an arbitrary slug from
    // the client: resolve the member's primary/recent enrollment, then legacy
    // fallback, and canonicalize before the placement write.
    const { programSlug } = resolveCurrentProgram(member);

    const placement = await prisma.$transaction(async (tx) => {
      const created = await tx.$queryRaw<Array<Record<string, unknown>>>`
        INSERT INTO placement_records (
          id, user_id, employer_name, job_title, start_date, salary_offered,
          placed_at, placed_by, notes, program_slug, created_at, updated_at
        ) VALUES (
          gen_random_uuid(),
          ${userId},
          ${employerName},
          ${jobTitle},
          ${startDate ? new Date(startDate) : null},
          ${salaryOffered},
          NOW(),
          ${user.id},
          ${notes},
          ${programSlug},
          NOW(),
          NOW()
        )
        RETURNING *
      `;

      await tx.$executeRaw`
        INSERT INTO member_events (id, user_id, event_name, entity_type, metadata, created_at)
        VALUES (
          gen_random_uuid(),
          ${userId},
          'placement_recorded',
          'placement',
          ${JSON.stringify({ employerName, jobTitle, salaryOffered, placedBy: user.id })},
          NOW()
        )
      `;

      return created;
    });

    const row = (placement as any[])[0];

    // Idempotent per (userId, event, entityId) — safe on retry.
    void awardPoints(userId, 'placement_recorded', row.id).catch(() => {});

    auditLog({
      actorUserId: user.id,
      action: 'counselor_placement_recorded',
      targetType: 'User',
      targetId: userId,
      metadata: { employerName, jobTitle, salaryOffered: salaryOffered ?? null, programSlug },
    }).catch(() => {});
    logAuditEvent({
      user: { id: user.id, role: 'counselor' },
      verb: 'recorded',
      object: { type: 'PlacementRecord', id: row?.id ?? userId },
      result: { success: true, extensions: { employerName, jobTitle } },
    }).catch(() => {});

    return NextResponse.json({ ok: true, placement: row });
  } catch (error) {
    console.error('/counselor/placements error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withApiGuc(_POST);
