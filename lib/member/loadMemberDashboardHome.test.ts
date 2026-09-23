import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  MEMBER_DASHBOARD_HOME_PRISMA_BUDGET,
  SECONDARY_PROGRAM_HREF,
  STALE_TRAINING_COUNSELOR_ACTION,
  secondaryProgramAction,
  buildFirst90Card,
  dashboardViewFacts,
  deriveNextBadge,
  loadMemberDashboardHome,
  youthNoticeAgeFromDob,
  mapGoalSummaries,
  mapPipelineRows,
  mapPointsLedger,
  pointsLedgerColor,
} from './loadMemberDashboardHome';

import { getProgramBySlug } from '@/lib/content/programs';
import { canonicalizeProgramSlug } from '@/lib/content/programSlug';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const FIXTURE_PROGRAM_SLUG = 'it-support-professional-certificate-ibm';

/** Module names in program order for the fixture program (what /dashboard/program lists). */
function fixtureModuleNames(): string[] {
  const program = getProgramBySlug(canonicalizeProgramSlug(FIXTURE_PROGRAM_SLUG));
  assert.ok(program, 'fixture program must exist in the catalog');
  return program.courses.map((course) => course.name);
}

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    fullName: 'Alex Rivera',
    enrolledProgram: null,
    assessmentCompleted: false,
    organization: { courses: [] },
    courseEnrollments: [{ programSlug: 'it-support-professional-certificate-ibm', isPrimary: true }],
    courseProgress: [],
    memberProgramProgress: [],
    // A live streak: the last activity is today, so the stored counter holds.
    memberPoints: { totalPoints: 250, currentStreak: 4, longestStreak: 9, lastActiveDate: new Date() },
    nextBestActions: [
      {
        id: 'nba-1',
        title: 'Finish Hardware module',
        description: 'Resume where you left off',
        ctaHref: '/dashboard/training',
        ctaLabel: 'Continue',
        priority: 5,
      },
    ],
    jobApplications: [
      {
        id: 'app-1',
        role: 'Help Desk Tech',
        company: 'Acme',
        status: 'INTERVIEWING',
        updatedAt: new Date('2026-08-20T12:00:00.000Z'),
      },
    ],
    goals: [
      {
        title: 'Complete first course',
        description: null,
        targetMetricValue: 1,
        currentMetricValue: 0,
      },
    ],
    pointsTransactions: [
      { event: 'course_completed', points: 75, createdAt: new Date() },
      { event: 'daily_study', points: 5, createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
      { event: 'job_application', points: 25, createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) },
    ],
    _count: { userCertifications: 1, jobApplications: 2 },
    ...overrides,
  };
}

/**
 * Project a fixture row through the loader's real `select`, the way Prisma
 * does: a field the query does not ask for does not come back.
 *
 * Without this the mock hands back the whole fixture whatever the query says,
 * so the eight `courseProgressStale` cases below would prove the shaping and
 * nothing about the query — deleting `enrolledAt`, `assessmentCompletedAt`,
 * `staleTrainingDetectedAt` or `lastActivityAt` from `userSelect()` would
 * leave every test passing while the flag was permanently false in
 * production. That mutation is the reason this exists.
 */
function projectSelect(row: unknown, select: Record<string, unknown>): unknown {
  if (row === null || row === undefined) return row;
  if (Array.isArray(row)) return row.map((entry) => projectSelect(entry, select));
  if (typeof row !== 'object' || row instanceof Date) return row;
  const source = row as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(select)) {
    if (!(key in source)) continue;
    if (spec === true) {
      out[key] = source[key];
    } else if (spec && typeof spec === 'object') {
      const nested = (spec as { select?: Record<string, unknown> }).select;
      out[key] = nested ? projectSelect(source[key], nested) : source[key];
    }
  }
  return out;
}

function mockDb(opts: {
  row?: ReturnType<typeof makeRow> | null;
  missFirst?: boolean;
}) {
  let findUniqueCalls = 0;
  let txCalls = 0;
  let lastSelect: Record<string, unknown> | undefined;
  // `args` is `unknown` to match the loader's own DashboardHomeTx signature.
  const findUnique = async (args: unknown) => {
    findUniqueCalls += 1;
    const select = (args as { select?: Record<string, unknown> } | undefined)?.select;
    lastSelect = select;
    if (opts.missFirst && findUniqueCalls === 1) return null;
    const row = opts.row === undefined ? makeRow() : opts.row;
    if (!row || !select) return row;
    return projectSelect(row, select) as typeof row;
  };
  const db = {
    $transaction: async <T,>(fn: (tx: { user: { findUnique: typeof findUnique } }) => Promise<T>) => {
      txCalls += 1;
      return fn({ user: { findUnique } });
    },
  };
  return {
    db,
    counts: () => ({ findUniqueCalls, txCalls }),
    /** The `select` of the last read: the mock ignores `where`/`take`, so bounds are pinned here. */
    select: () => lastSelect,
  };
}

test('mapPipelineRows maps JobApplicationStatus to kit stage + tone', () => {
  const rows = mapPipelineRows([
    { role: 'Admin', company: 'Co', status: 'SAVED', updatedAt: new Date('2026-06-18T00:00:00.000Z') },
    { role: 'SE', company: 'Inc', status: 'PHONE_SCREEN', updatedAt: new Date('2026-06-24T00:00:00.000Z') },
    { role: 'Cloud', company: 'Ltd', status: 'UNKNOWN', updatedAt: new Date('2026-06-29T00:00:00.000Z') },
  ]);
  assert.equal(rows[0].stage, 'Saved');
  assert.equal(rows[0].tone, 'muted');
  assert.equal(rows[1].stage, 'Screening');
  assert.equal(rows[1].tone, 'info');
  assert.equal(rows[2].stage, 'Applied');
  assert.equal(rows[2].tone, 'muted');
});

test('mapPointsLedger uses EVENT_LABELS and semantic colors', () => {
  assert.equal(pointsLedgerColor('job_application'), 'info');
  assert.equal(pointsLedgerColor('daily_study'), 'gold');
  assert.equal(pointsLedgerColor('course_completed'), 'accent');
  const ledger = mapPointsLedger([{ event: 'course_completed', points: 75 }]);
  assert.equal(ledger[0].label, 'Completed a course');
  assert.equal(ledger[0].amount, 75);
  assert.equal(ledger[0].color, 'accent');
});

test('mapGoalSummaries prefers metric ratio then step ratio', () => {
  const byMetric = mapGoalSummaries([
    { title: 'Apps', description: null, targetMetricValue: 10, currentMetricValue: 4 },
  ]);
  assert.equal(byMetric[0].percent, 40);

  const bySteps = mapGoalSummaries([
    {
      title: 'Steps',
      description: `@@WAP_GOAL_V1@@${JSON.stringify({
        note: '',
        steps: [
          { id: 'a', text: 'one', done: true },
          { id: 'b', text: 'two', done: false },
        ],
      })}`,
      targetMetricValue: null,
      currentMetricValue: 0,
    },
  ]);
  assert.equal(bySteps[0].percent, 50);
});

test('deriveNextBadge uses the points ladder then cert fallback', () => {
  const builder = deriveNextBadge({ totalPoints: 250, certCount: 0 });
  assert.equal(builder.nextBadgeName, 'Achiever');
  assert.ok(builder.nextBadgePercent > 0);
  assert.match(builder.nextBadgeRemaining, /points?$/);

  const champion = deriveNextBadge({ totalPoints: 1500, certCount: 0 });
  assert.equal(champion.nextBadgeName, 'First certification');
  assert.equal(champion.nextBadgePercent, 0);
});

test('loadMemberDashboardHome issues ≤ 2 Prisma ops and skips progress count without a slug', async () => {
  const { db, counts } = mockDb({
    row: makeRow({ courseEnrollments: [], enrolledProgram: null }),
  });
  const view = await loadMemberDashboardHome(
    { userId: 'member-1', fallbackDisplayName: 'member@example.com' },
    db,
  );
  assert.equal(view.prismaOpCount, 1);
  assert.ok(view.prismaOpCount <= MEMBER_DASHBOARD_HOME_PRISMA_BUDGET);
  assert.equal(counts().txCalls, 1);
  assert.equal(counts().findUniqueCalls, 1);
  assert.equal(view.firstName, 'Alex');
  assert.equal(view.coursePercent, 0);
  assert.equal(view.doThisNext?.id, 'nba-1');
});

test('loadMemberDashboardHome combines enrollment + progress into kit props', async () => {
  const { db, counts } = mockDb({
    row: makeRow({
      courseProgress: [
        {
          programSlug: 'it-support-professional-certificate-ibm',
          courseSlug: 'introduction-to-technical-support',
          courseId: 'rNyuLa-pEeytqw64hz8ZCw',
          percentComplete: 100,
          status: 'COMPLETED',
        },
        {
          programSlug: 'it-support-professional-certificate-ibm',
          courseSlug: 'introduction-to-hardware-and-operating-systems',
          courseId: 'wtYRSE1kEeyLIRLL9niz0w',
          percentComplete: 100,
          status: 'COMPLETED',
        },
      ],
    }),
  });
  const view = await loadMemberDashboardHome(
    { userId: 'member-1', fallbackDisplayName: 'Pat' },
    db,
  );
  assert.equal(view.prismaOpCount, 1);
  assert.ok(view.prismaOpCount <= MEMBER_DASHBOARD_HOME_PRISMA_BUDGET);
  assert.equal(counts().txCalls, 1);
  assert.equal(counts().findUniqueCalls, 1);
  assert.equal(view.certs, 1);
  assert.equal(view.activeJobs, 2);
  assert.equal(view.points, 250);
  assert.equal(view.currentStreak, 4);
  assert.equal(view.certModulesDone, 2);
  assert.ok((view.certModulesTotal ?? 0) >= 2);
  assert.equal(view.pipeline[0].stage, 'Interviewing');
  assert.equal(view.pointsLedger[0].color, 'accent');
  assert.ok((view.pointsThisWeek ?? 0) >= 80);
  assert.equal(view.resumeHref, '/dashboard/program');
  assert.equal(view.resumeHref, view.programHref);
  assert.notEqual(view.resumeHref, '/dashboard/training');
  assert.equal(view.programHref, '/dashboard/program');
  assert.equal(view.coursesHref, '/dashboard/learning');
  assert.equal(view.doThisNext?.href, '/dashboard/program');
  assert.notEqual(view.doThisNext?.href, '/dashboard/training');
  assert.equal(view.doThisNext?.variant, 'urgent');
  assert.equal(view.doThisNext?.title, 'Finish Hardware module');
  // Cert-path card names the next incomplete module, not the hero action title.
  const modules = fixtureModuleNames();
  assert.ok(modules.length > 2);
  assert.equal(view.nextLesson, modules[2]);
  assert.equal(view.toolkitHref, '/dashboard/ai-tools');
});

test('streak chip: a stored counter whose last activity is older than yesterday reads 0, not the stale count', async () => {
  const stale = await loadMemberDashboardHome(
    { userId: 'stale', fallbackDisplayName: 'Pat' },
    mockDb({
      row: makeRow({
        memberPoints: {
          totalPoints: 250,
          currentStreak: 12,
          longestStreak: 12,
          lastActiveDate: new Date(Date.now() - 103 * 24 * 60 * 60 * 1000),
        },
      }),
    }).db,
  );
  assert.equal(stale.currentStreak, 0);
  assert.equal(stale.longestStreak, 12, 'the best streak is history and stays');

  const yesterday = await loadMemberDashboardHome(
    { userId: 'yesterday', fallbackDisplayName: 'Pat' },
    mockDb({
      row: makeRow({
        memberPoints: {
          totalPoints: 250,
          currentStreak: 3,
          longestStreak: 9,
          lastActiveDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      }),
    }).db,
  );
  assert.equal(yesterday.currentStreak, 3, 'yesterday keeps the streak alive');

  const never = await loadMemberDashboardHome(
    { userId: 'never', fallbackDisplayName: 'Pat' },
    mockDb({
      row: makeRow({
        memberPoints: { totalPoints: 0, currentStreak: 2, longestStreak: 2, lastActiveDate: null },
      }),
    }).db,
  );
  assert.equal(never.currentStreak, 0, 'no recorded activity means no live streak');
});

test('a completion recorded under a Coursera id counts, and "Next:" skips it', async () => {
  // Synthetic fixture modelled on IBM Software Developer learner 702b1eb6 (the
  // audit digest's "91c9bf" does not exist). Syllabus rows 2 and 4 bind to
  // Coursera by id, not title (master, #2421); this branch keeps the path row
  // out of the blend and derives "Next:" from the same reconciliation.
  const slug = 'software-developer-professional-certificate-ibm';
  const program = getProgramBySlug(slug);
  assert.ok(program);
  assert.equal(program.courses.length, 17);
  const row = (courseSlug: string, courseId: string | null, status: 'COMPLETED' | 'IN_PROGRESS', pct: number) => ({
    programSlug: slug,
    courseSlug,
    courseId,
    percentComplete: pct,
    status,
  });
  const view = await loadMemberDashboardHome(
    { userId: 'ibm', fallbackDisplayName: 'Sam' },
    mockDb({
      row: makeRow({
        nextBestActions: [],
        assessmentCompleted: true,
        courseEnrollments: [{ programSlug: slug, isPrimary: true }],
        courseProgress: [
          row('introduction-to-software-engineering', 'FkAMrrwEEey8ogoy0lwspQ', 'COMPLETED', 100),
          // Written before the id binding existed: synthetic slug, real Coursera id.
          row(`${slug}-course-2`, 'mR7MlUaTEemuHQ4HpHozrA', 'COMPLETED', 100),
          row('generative-ai-introduction-and-applications', 'I3MKFTq0Ee6PABLgKXk5yQ', 'COMPLETED', 100),
          row(`${slug}-course-3`, 'Course~I3MKFTq0Ee6PABLgKXk5yQ', 'COMPLETED', 100),
          row(`${slug}-course-16`, 'nI__WUzdEe64qQ7qqom4Rw', 'COMPLETED', 100),
          row('introduction-html-css-javascript', 'yI8fAUhFEe6cKg41IVwGGw', 'COMPLETED', 100),
          row('getting-started-with-git-and-github', null, 'IN_PROGRESS', 69),
          // B4B program-membership row; never a course.
          row('ai-and-software-developer-professional-certificate-ibm', 'TpIlAogTQ8-SJQKIE8PP9w~6m4yZ', 'IN_PROGRESS', 31),
          // The Learning Path row a stale mapping once wrote onto the lab slot (preventive; removed from prod 19:38 UTC).
          row(`${slug}-course-17`, 'fT-1P-CkT6q_tT_gpM-qJw', 'IN_PROGRESS', 31),
        ],
      }),
    }).db,
  );
  assert.equal(view.certModulesDone, 5, '5 of 17 complete; neither program-level row is a sixth');
  assert.equal(view.certModulesTotal, 17);
  assert.equal(view.coursePercent, 33, '(5 x 100 + 69) / 17; the program-level rows add nothing');
  // Courses 1-5 are finished; the first incomplete syllabus row is Git and GitHub (69%),
  // not "Generative AI: Prompt Engineering", which the slug-only rule named.
  assert.equal(view.nextLesson, 'Getting Started with Git and GitHub');
  assert.notEqual(view.nextLesson, 'Generative AI: Prompt Engineering');
  // The lab stays in the 17 and is named, so the tile explains the 16-course Coursera path.
  assert.equal(
    view.programCoursesNote,
    "17 courses: 16 on Coursera's learning path plus the WorkforceAP Lab, Project, and Test Preparation (delivered by WorkforceAP, not part of the Coursera path).",
  );
});

test('loadMemberDashboardHome shows saved progress when the member has no assigned program', async () => {
  const { db, counts } = mockDb({
    row: makeRow({
      courseEnrollments: [],
      enrolledProgram: null,
      courseProgress: [{
        programSlug: 'comptia-a-plus',
        courseSlug: 'technical-support-fundamentals',
        courseId: '7sBiclFIEeetjQ5ppGVTyA',
        percentComplete: 93,
        status: 'IN_PROGRESS',
      }],
      memberProgramProgress: [
        {
          programSlug: 'comptia-a-plus',
          averagePercent: 93,
          coursesCompleted: 0,
        },
      ],
    }),
  });
  const view = await loadMemberDashboardHome(
    { userId: 'member-progress-only', fallbackDisplayName: 'Pat' },
    db,
  );

  assert.equal(view.prismaOpCount, 1);
  assert.equal(view.noProgram, true);
  assert.ok(view.coursePercent > 0 && view.coursePercent < 100);
  assert.equal(view.certModulesDone, 0);
  assert.equal(view.programStatus, 'In progress');
  assert.match(view.programTitle ?? '', /CompTIA A\+/i);
  assert.equal(view.programHref, '/dashboard/program');
  assert.equal(view.coursesHref, '/dashboard/learning');
});

test('loadMemberDashboardHome never reports 100% from one completed alias row in a multi-course program', async () => {
  const { db } = mockDb({
    row: makeRow({
      courseEnrollments: [{ programSlug: 'comptia-a-professional-certificate', isPrimary: true }],
      enrolledProgram: null,
      memberProgramProgress: [{
        programSlug: 'comptia-a-plus',
        averagePercent: 100,
        coursesCompleted: 1,
      }],
      courseProgress: [{
        programSlug: 'comptia-a-plus',
        courseSlug: 'technical-support-fundamentals',
        courseId: '7sBiclFIEeetjQ5ppGVTyA',
        percentComplete: 100,
        status: 'COMPLETED',
      }],
    }),
  });

  const view = await loadMemberDashboardHome(
    { userId: 'member-alias-progress', fallbackDisplayName: 'Pat' },
    db,
  );

  assert.equal(view.certModulesDone, 1);
  assert.ok(view.certModulesTotal > 1);
  assert.ok(view.coursePercent > 0 && view.coursePercent < 100);
  assert.equal(view.programStatus, 'In progress');
});

test('loadMemberDashboardHome provisions an orphan then re-reads once', async () => {
  const { db, counts } = mockDb({ missFirst: true });
  let provisioned = 0;
  const view = await loadMemberDashboardHome(
    {
      userId: 'orphan-1',
      fallbackDisplayName: 'orphan@example.com',
      provisionIfMissing: async () => {
        provisioned += 1;
      },
    },
    db,
  );
  assert.equal(provisioned, 1);
  assert.equal(counts().txCalls, 2);
  assert.equal(view.firstName, 'Alex');
});

test('loadMemberDashboardHome returns a zeroed view when the user row is still missing', async () => {
  const { db } = mockDb({ row: null });
  const view = await loadMemberDashboardHome(
    { userId: 'gone', fallbackDisplayName: 'Jamie Lee' },
    db,
  );
  assert.equal(view.firstName, 'Jamie');
  assert.equal(view.points, 0);
  assert.equal(view.doThisNext?.id, 'choose_program');
  assert.equal(view.doThisNext?.href, '/dashboard/program');
  assert.equal(view.programHref, '/dashboard/program');
  assert.equal(view.coursesHref, '/dashboard/learning');
  assert.equal(view.toolkitHref, '/dashboard/ai-tools');
  assert.equal(view.nextLesson, 'Choose your program');
  assert.equal(view.programTitle, undefined);
  assert.equal(view.programStatus, undefined);
});

test('loadMemberDashboardHome falls back to buildNextBestActions when no persisted rows exist', async () => {
  const { db } = mockDb({
    row: makeRow({
      nextBestActions: [],
      enrolledProgram: null,
      courseEnrollments: [],
      assessmentCompleted: false,
    }),
  });
  const view = await loadMemberDashboardHome(
    { userId: 'fresh-1', fallbackDisplayName: 'fresh@example.com' },
    db,
  );
  assert.equal(view.doThisNext?.id, 'choose_program');
  assert.equal(view.doThisNext?.href, '/dashboard/program');
  assert.equal(view.doThisNext?.cta, 'Choose program');
  assert.match(view.ungatedDigitalBasicsHref, /digital-literacy-empowerment-class-course-1/);
});

test('loader module imports only pure Coursera reconciliation, never providers or member-state fanout', () => {
  const src = readFileSync(path.join(ROOT, 'lib/member/loadMemberDashboardHome.ts'), 'utf8');
  const imports = src.split('\n').filter((line) => line.startsWith('import')).join('\n');
  assert.doesNotMatch(imports, /b4b|programCourseList|learnerProgress/i);
  assert.doesNotMatch(imports, /b4b/i);
  assert.doesNotMatch(imports, /getMemberState/);
  assert.match(src, /buildNextBestActions/);
  assert.match(src, /assessmentCompleted: true/);
  assert.doesNotMatch(imports, /maybeAutoSync/);
  assert.doesNotMatch(imports, /getCache/);
  assert.match(src, /from '@\/lib\/coursera\/progressReconciliation/);
  assert.doesNotMatch(src, /nextLesson: 'Continue your training'/);
  assert.doesNotMatch(src, /'Up next'/);
  assert.doesNotMatch(src, /\?\? 'there'/);
});

test('loadMemberDashboardHome falls back to buildNextBestActions when NBA rows are empty', async () => {
  const { db, counts } = mockDb({
    row: makeRow({
      nextBestActions: [],
      courseEnrollments: [],
      enrolledProgram: null,
      assessmentCompleted: false,
    }),
  });
  const view = await loadMemberDashboardHome(
    { userId: 'fresh-member', fallbackDisplayName: 'Sam' },
    db,
  );

  assert.equal(view.prismaOpCount, 1);
  assert.equal(counts().findUniqueCalls, 1);
  assert.equal(view.doThisNext?.id, 'choose_program');
  assert.equal(view.doThisNext?.href, '/dashboard/program');
  assert.equal(view.doThisNext?.cta, 'Choose program');
  assert.equal(view.nextLesson, 'Choose your program');
  assert.notEqual(view.nextLesson, undefined);
});

test('loadMemberDashboardHome surfaces preassessment when enrolled and NBA rows are empty', async () => {
  const { db } = mockDb({
    row: makeRow({
      nextBestActions: [],
      assessmentCompleted: false,
    }),
  });
  const view = await loadMemberDashboardHome(
    { userId: 'enrolled-unassessed', fallbackDisplayName: 'Sam' },
    db,
  );

  assert.equal(view.prismaOpCount, 1);
  assert.equal(view.doThisNext?.id, 'skills_assessment');
  assert.equal(view.doThisNext?.href, '/dashboard/assessment');
  assert.equal(view.doThisNext?.title, 'Complete your Training Preassessment');
  // The preassessment stays the hero CTA; the cert-path card still names module 1.
  assert.equal(view.nextLesson, fixtureModuleNames()[0]);
});

test('loadMemberDashboardHome keeps a persisted NBA ahead of the heuristic fallback', async () => {
  const { db } = mockDb({
    row: makeRow({
      assessmentCompleted: false,
      nextBestActions: [{
        id: 'nba-persisted',
        title: 'Finish Hardware module',
        description: 'Resume where you left off',
        ctaHref: '/dashboard/program',
        ctaLabel: 'Continue',
        priority: 5,
      }],
    }),
  });
  const view = await loadMemberDashboardHome(
    { userId: 'persisted-nba', fallbackDisplayName: 'Sam' },
    db,
  );

  assert.equal(view.doThisNext?.id, 'nba-persisted');
  assert.equal(view.doThisNext?.title, 'Finish Hardware module');
  assert.equal(view.nextLesson, fixtureModuleNames()[0]);
});

test('cert-path next module: enrolled, unassessed member with no progress sees the program first module (title + link)', async () => {
  const { db } = mockDb({
    row: makeRow({
      nextBestActions: [],
      assessmentCompleted: false,
      courseProgress: [],
      memberProgramProgress: [],
    }),
  });
  const view = await loadMemberDashboardHome(
    { userId: 'enrolled-no-progress', fallbackDisplayName: 'Sam' },
    db,
  );

  const modules = fixtureModuleNames();
  const program = getProgramBySlug(canonicalizeProgramSlug(FIXTURE_PROGRAM_SLUG));
  const firstSlug = program?.courses[0]?.slug ?? '';
  // Hero CTA unchanged: preassessment first.
  assert.equal(view.doThisNext?.id, 'skills_assessment');
  // Card: first module, never "No next module on file" / the preassessment title.
  assert.equal(view.programTitle, program?.title);
  assert.equal(view.nextLesson, modules[0]);
  assert.notEqual(view.nextLesson, 'Complete your Training Preassessment');
  assert.ok(view.nextLessonHref, 'first module must carry a link');
  assert.ok(
    view.nextLessonHref.includes(encodeURIComponent(firstSlug)),
    `link ${view.nextLessonHref} must target module ${firstSlug}`,
  );
  assert.equal(view.certModulesDone, 0);
  assert.equal(view.certModulesTotal, modules.length);
});

test('cert-path next module: a member with progress sees the next incomplete module, and none once complete', async () => {
  const program = getProgramBySlug(canonicalizeProgramSlug(FIXTURE_PROGRAM_SLUG));
  assert.ok(program);
  const done = (slug: string) => ({
    programSlug: FIXTURE_PROGRAM_SLUG,
    courseSlug: slug,
    courseId: null,
    percentComplete: 100,
    status: 'COMPLETED' as const,
  });
  const partial = await loadMemberDashboardHome(
    { userId: 'partial', fallbackDisplayName: 'Sam' },
    mockDb({
      row: makeRow({
        nextBestActions: [],
        assessmentCompleted: true,
        courseProgress: [done(program.courses[0]!.slug)],
      }),
    }).db,
  );
  assert.equal(partial.certModulesDone, 1);
  assert.equal(partial.nextLesson, program.courses[1]!.name);
  assert.ok(partial.nextLessonHref?.includes(encodeURIComponent(program.courses[1]!.slug)));

  const complete = await loadMemberDashboardHome(
    { userId: 'complete', fallbackDisplayName: 'Sam' },
    mockDb({
      row: makeRow({
        nextBestActions: [],
        assessmentCompleted: true,
        courseProgress: program.courses.map((course) => done(course.slug)),
      }),
    }).db,
  );
  assert.equal(complete.programStatus, 'Complete');
  assert.equal(complete.nextLessonHref, undefined);
  // Progress semantics untouched: completion still comes from course_progress rows.
  assert.equal(complete.certModulesDone, program.courses.length);
});

test('loadMemberDashboardHome names the next incomplete course when NBA rows are empty', async () => {
  const { db } = mockDb({
    row: makeRow({
      nextBestActions: [],
      assessmentCompleted: true,
    }),
  });
  const view = await loadMemberDashboardHome(
    { userId: 'in-training', fallbackDisplayName: 'Sam' },
    db,
  );

  assert.equal(view.prismaOpCount, 1);
  assert.ok(view.doThisNext);
  assert.ok(
    view.doThisNext.id === 'continue_training' || view.doThisNext.id === 'launch_first_course',
    `expected a training next step, got ${view.doThisNext.id}`,
  );
  assert.notEqual(view.doThisNext.href, '/dashboard');
  assert.ok(view.nextLesson && view.nextLesson.length > 0);
});

test('kit-default dashboard page calls the loader and has no prisma. on that branch', () => {
  const src = readFileSync(path.join(ROOT, 'app/(portal)/dashboard/page.tsx'), 'utf8');
  const kitStart = src.indexOf("if (args.requestedUi !== 'legacy')");
  const legacyStart = src.indexOf('await loadMemberCareerBriefBundleSafe');
  assert.ok(kitStart > 0, 'kit branch missing');
  assert.ok(legacyStart > kitStart, 'legacy branch missing');
  const kitBlock = src.slice(kitStart, legacyStart);
  assert.match(kitBlock, /loadMemberDashboardHome/);
  assert.doesNotMatch(kitBlock, /prisma\./);
  assert.doesNotMatch(kitBlock, /maybeAutoSyncCourseraOnDashboard/);
  assert.doesNotMatch(kitBlock, /fetchLearnerProgressFromB4B/);
  assert.doesNotMatch(kitBlock, /getMemberState/);
});


test('lean loader uses real starter-profile gaps and keeps the one-operation budget', async () => {
  const { db, counts } = mockDb({ row: makeRow({ nextBestActions: [],
    applications: [{ status: 'APPROVED', submittedAt: new Date('2026-09-01T12:00:00Z') }],
    courseEnrollments: [{ programSlug: FIXTURE_PROGRAM_SLUG, isPrimary: true, enrolledByAdminId: 'staff' }],
    wioaReviewStatus: 'verified', wioaReviewedAt: new Date('2026-09-03T12:00:00Z'),
    courseraEnrollmentApproved: false,
  }) });
  const view = await loadMemberDashboardHome({ userId: 'member' }, db);
  assert.equal(view.doThisNext?.id, 'review_starter_profile');
  assert.equal(view.coursePercent, 0);
  assert.equal(view.approvalStatus.intake, 'verified');
  assert.equal(view.approvalStatus.training, 'pending');
  assert.equal(view.approvalStatus.providerAccess, 'unknown');
  assert.deepEqual(counts(), { findUniqueCalls: 1, txCalls: 1 });
});

test('lean loader uses the assigned program over the legacy pointer and still recommends continued training', async () => {
  const { db } = mockDb({ row: makeRow({ nextBestActions: [], assessmentCompleted: true,
    enrolledProgram: 'stale-program', applications: [{ status: 'APPROVED', submittedAt: null }],
  }) });
  const view = await loadMemberDashboardHome({ userId: 'member' }, db);
  assert.equal(view.doThisNext?.id, 'continue_training');
  assert.equal(view.coursePercent, 0);
  assert.equal(view.programTitle, getProgramBySlug(canonicalizeProgramSlug(FIXTURE_PROGRAM_SLUG))?.title);
});

/**
 * The Course stat tile's warning is gated on this flag, so the loader must not
 * report a member who has just become able to start as stalled. The threshold
 * is `STALE_TRAINING_ACTIVITY_DAYS` (14) and the baseline is
 * `trainingEligibleSince` — both from lib/member/trainingStaleness.ts, and
 * both shared with the member program page.
 *
 * `mockDb` projects the fixture through the loader's real `select`, so these
 * cases also pin the query: drop a column from `userSelect()` and the ones
 * that expect `true` fail.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);
const progressRow = (overrides: Record<string, unknown> = {}) => ({
  programSlug: 'it-support-professional-certificate-ibm',
  courseSlug: 'introduction-to-technical-support',
  courseId: 'rNyuLa-pEeytqw64hz8ZCw',
  percentComplete: 0,
  status: 'NOT_STARTED' as const,
  ...overrides,
});
/** Enrolled and assessed, i.e. actually able to open training. */
const ableToStart = (enrolledDaysAgo: number, assessedDaysAgo: number) => ({
  assessmentCompleted: true,
  enrolledAt: daysAgo(enrolledDaysAgo),
  assessmentCompletedAt: daysAgo(assessedDaysAgo),
  courseEnrollments: [{ programSlug: 'it-support-professional-certificate-ibm', isPrimary: true }],
});

async function staleFlagFor(overrides: Record<string, unknown>) {
  const { db } = mockDb({ row: makeRow(overrides) });
  const view = await loadMemberDashboardHome({ userId: 'member-1', fallbackDisplayName: 'Pat' }, db);
  return view.courseProgressStale;
}

test('courseProgressStale: a member who became able to start today is not stalled', async () => {
  assert.equal(await staleFlagFor({ ...ableToStart(0, 0), courseProgress: [] }), false);
});

test('courseProgressStale: 0% with no activity since becoming able to start long ago is stalled', async () => {
  assert.equal(await staleFlagFor({ ...ableToStart(40, 40), courseProgress: [] }), true);
});

test('courseProgressStale: the clock starts at the LATER of enrolment and the preassessment', async () => {
  // Enrolled 60 days ago, finished the preassessment yesterday. This is day
  // one of being able to start, so nothing is late yet — and the member
  // program page says the same. Using the enrolment date alone would paint
  // the gold chip here, which is the bug this rule exists to avoid.
  assert.equal(await staleFlagFor({ ...ableToStart(60, 1), courseProgress: [] }), false);
  // The mirror image: assessed long ago, enrolled yesterday.
  assert.equal(await staleFlagFor({ ...ableToStart(1, 60), courseProgress: [] }), false);
});

test('courseProgressStale: nothing is claimed before the member can start', async () => {
  // Enrolled ages ago but the preassessment is not done, so training has not
  // opened and there is nothing to be late for.
  assert.equal(
    await staleFlagFor({
      assessmentCompleted: false,
      enrolledAt: daysAgo(120),
      assessmentCompletedAt: null,
      courseEnrollments: [{ programSlug: 'it-support-professional-certificate-ibm', isPrimary: true }],
      courseProgress: [],
    }),
    false,
  );
  // Assessed, but staff has assigned no program.
  assert.equal(
    await staleFlagFor({
      assessmentCompleted: true,
      enrolledAt: daysAgo(120),
      assessmentCompletedAt: daysAgo(120),
      enrolledProgram: null,
      courseEnrollments: [],
      courseProgress: [],
    }),
    false,
  );
});

test('courseProgressStale: the newest activity wins even when a NULL-dated row sorts first', async () => {
  // Postgres sorts NULLs first on a DESC order, so the loader must take the
  // max rather than trusting `courseProgress[0]`.
  assert.equal(
    await staleFlagFor({
      ...ableToStart(90, 90),
      courseProgress: [
        progressRow({ lastActivityAt: null }),
        progressRow({ courseSlug: 'introduction-to-hardware-and-operating-systems', lastActivityAt: daysAgo(30) }),
        progressRow({ courseSlug: 'introduction-to-software-programming-and-databases', lastActivityAt: daysAgo(2) }),
      ],
    }),
    false,
  );
});

test('courseProgressStale: activity older than the threshold is stalled', async () => {
  assert.equal(
    await staleFlagFor({ ...ableToStart(90, 90), courseProgress: [progressRow({ lastActivityAt: daysAgo(20) })] }),
    true,
  );
});

test('courseProgressStale: saved activity beats the eligibility baseline in both directions', async () => {
  // Able to start only yesterday, but somehow has activity 30 days old: the
  // saved activity is the truth.
  assert.equal(
    await staleFlagFor({ ...ableToStart(1, 1), courseProgress: [progressRow({ lastActivityAt: daysAgo(30) })] }),
    true,
  );
  // Able to start 90 days ago, active yesterday.
  assert.equal(
    await staleFlagFor({ ...ableToStart(90, 90), courseProgress: [progressRow({ lastActivityAt: daysAgo(1) })] }),
    false,
  );
});

test('courseProgressStale: the cron flag is trusted on its own', async () => {
  assert.equal(
    await staleFlagFor({
      ...ableToStart(0, 0),
      staleTrainingDetectedAt: daysAgo(1),
      courseProgress: [progressRow({ lastActivityAt: daysAgo(0) })],
    }),
    true,
  );
});

test('courseProgressStale: the zeroed view for a missing user row is not stalled', async () => {
  const { db } = mockDb({ row: null });
  const view = await loadMemberDashboardHome({ userId: 'member-1', fallbackDisplayName: 'pat@example.com' }, db);
  assert.equal(view.coursePercent, 0);
  assert.equal(view.courseProgressStale, false);
});

/**
 * Source-text pins. Weak evidence — they assert the text of a file, not its
 * behaviour, and they go stale silently if the code is restructured. They are
 * here because the alternative is silence: deleting the prop from the page
 * disconnects the feature end to end and no behavioural test in this repo
 * notices, since the page is a server component the unit lane cannot render.
 * The query side is pinned properly by `projectSelect` above; this covers the
 * one hop that cannot be.
 */
test('the dashboard page passes courseProgressStale through to the kit', () => {
  const src = readFileSync(path.join(ROOT, 'app/(portal)/dashboard/page.tsx'), 'utf8');
  assert.match(src, /courseProgressStale=\{home\.courseProgressStale\}/);
});

test('the loader selects every column the staleness baseline reads', () => {
  const src = readFileSync(path.join(ROOT, 'lib/member/loadMemberDashboardHome.ts'), 'utf8');
  for (const column of ['enrolledAt: true', 'assessmentCompletedAt: true', 'staleTrainingDetectedAt: true', 'lastActivityAt: true']) {
    assert.match(src, new RegExp(column.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `userSelect() must ask for ${column}`);
  }
});

test('the Points tile gets a real weekly series whose last point is the "this week" chip', async () => {
  const { db } = mockDb({
    row: makeRow({
      // 45 this week, nothing last week, 60 the week before: a gap in the middle.
      pointsTransactions: [
        { event: 'course_completed', points: 40, createdAt: new Date(Date.now() - 1 * DAY_MS) },
        { event: 'daily_study', points: 5, createdAt: new Date(Date.now() - 3 * DAY_MS) },
        { event: 'job_application', points: 60, createdAt: new Date(Date.now() - 17 * DAY_MS) },
      ],
    }),
  });
  const view = await loadMemberDashboardHome({ userId: 'member-1', fallbackDisplayName: 'Pat' }, db);

  // Still one Prisma operation: the series is bucketed from the nested read
  // the loader already issued, not from a second aggregate.
  assert.equal(view.prismaOpCount, 1);
  assert.ok(view.prismaOpCount <= MEMBER_DASHBOARD_HOME_PRISMA_BUDGET);

  const series = view.pointsSpark?.series;
  assert.ok(series, 'the Points tile must carry a series');
  assert.equal(series.length, 8, 'eight rolling weeks');
  // The trap this feature exists to avoid: the line ending on a different
  // number than the chip sitting beside it.
  assert.equal(series[series.length - 1], view.pointsThisWeek);
  assert.equal(view.pointsThisWeek, 45);
  // A silent week is a zero in place, so the line shows the stall.
  assert.equal(series[6], 0);
  assert.equal(series[5], 60);
  assert.deepEqual(series, [0, 0, 0, 0, 0, 60, 0, 45]);
  assert.equal(view.pointsSpark?.delta, '45');
  assert.equal(view.pointsSpark?.direction, 'up');
});

test('only the Points tile gets a series: Certs, Course % and Active jobs carry none', async () => {
  const { db } = mockDb({});
  const view = await loadMemberDashboardHome({ userId: 'member-1', fallbackDisplayName: 'Pat' }, db);
  assert.ok(view.pointsSpark?.series, 'Points has history in points_transactions');
  // Deliberate: certifications move twice a year, and course percent / active
  // jobs have no per-week history in the schema to draw from.
  const keys = Object.keys(view);
  assert.ok(keys.length > 0, 'the view must not be empty');
  assert.deepEqual(
    keys.filter((key) => key.endsWith('Spark')),
    ['pointsSpark'],
  );
});

test('a member with no points history draws no line rather than a flat rule at zero', async () => {
  const { db } = mockDb({
    row: makeRow({ pointsTransactions: [], memberPoints: null }),
  });
  const view = await loadMemberDashboardHome({ userId: 'quiet', fallbackDisplayName: 'Pat' }, db);
  assert.equal(view.pointsSpark, undefined);
  assert.equal(view.pointsThisWeek, undefined);
  assert.equal(view.points, 0);
});

test('points older than the eight-week window do not inflate the first bucket', async () => {
  const { db } = mockDb({
    row: makeRow({
      pointsTransactions: [
        { event: 'program_enrolled', points: 500, createdAt: new Date(Date.now() - 200 * DAY_MS) },
        { event: 'daily_study', points: 5, createdAt: new Date(Date.now() - 2 * DAY_MS) },
      ],
    }),
  });
  const view = await loadMemberDashboardHome({ userId: 'member-1', fallbackDisplayName: 'Pat' }, db);
  const series = view.pointsSpark?.series;
  assert.ok(series);
  assert.equal(series.length, 8);
  assert.equal(series[0], 0, 'an old award is out of the window, not clamped into week one');
  assert.equal(
    series.reduce((sum, value) => sum + value, 0),
    5,
  );
});


test('a member whose newest 400 rows are all recent loses the line, not the number', async () => {
  // The loader reads the newest 400 points rows. When every one of them is
  // inside the eight-week window, older rows from inside it may have been cut
  // off, so the shape is unproven and the tile shows no line.
  const dense = Array.from({ length: 400 }, (_, index) => ({
    event: 'daily_study',
    points: 5,
    createdAt: new Date(Date.now() - (index % 40) * 60 * 60 * 1000),
  }));
  const { db } = mockDb({ row: makeRow({ pointsTransactions: dense }) });
  const view = await loadMemberDashboardHome({ userId: 'heavy', fallbackDisplayName: 'Pat' }, db);

  assert.equal(view.pointsSpark, undefined, 'an unprovable shape must not be drawn');
  assert.ok((view.pointsThisWeek ?? 0) > 0, 'the chip still works: the newest rows are always present');
});

test('a full page that reaches back past the window still draws the line', async () => {
  // Same 400-row page, but one row is older than the eight-week window, which
  // proves nothing inside it was cut off. This is the regression that matters:
  // treating a full page as unprovable would hide the line permanently from
  // every member with enough history, since the ledger only ever grows.
  const dense = Array.from({ length: 399 }, (_, index) => ({
    event: 'daily_study',
    points: 5,
    createdAt: new Date(Date.now() - (index % 40) * 60 * 60 * 1000),
  }));
  const withOldRow = [
    ...dense,
    { event: 'program_enrolled', points: 150, createdAt: new Date(Date.now() - 100 * DAY_MS) },
  ];
  assert.equal(withOldRow.length, 400, 'the page must be full for the truncation guard to engage');

  const { db } = mockDb({ row: makeRow({ pointsTransactions: withOldRow }) });
  const view = await loadMemberDashboardHome({ userId: 'heavy', fallbackDisplayName: 'Pat' }, db);

  const series = view.pointsSpark?.series;
  assert.ok(series, 'a page that spans the window must draw');
  assert.equal(series.length, 8);
  assert.equal(series[series.length - 1], view.pointsThisWeek);
  // The out-of-window row proved the reach-back without joining a bucket.
  assert.equal(
    series.reduce((sum, value) => sum + value, 0),
    399 * 5,
  );
});

// ── Counselor context (owner call 2026-09-22, ts 1790092663.833649) ──
// The assignment is read in the same user query and resolved once; the
// approval card's owner line and the reviewer line therefore name one person.

function pendingWithCounselor(counselor: {
  active?: boolean;
  fullName?: string | null;
  organizationId?: string;
  deletedAt?: Date | null;
} = {}) {
  return makeRow({
    organizationId: 'org-1',
    applications: [{ status: 'PENDING', submittedAt: new Date('2026-09-01T12:00:00Z') }],
    wioaReviewStatus: null,
    courseraEnrollmentApproved: false,
    counselorAssignments: [{
      counselor: {
        active: counselor.active ?? true,
        user: {
          fullName: counselor.fullName === undefined ? 'Dana Whitfield' : counselor.fullName,
          organizationId: counselor.organizationId ?? 'org-1',
          deletedAt: counselor.deletedAt ?? null,
        },
      },
    }],
  });
}

test('the home view names the active counselor once, for the owner line and the reviewer line, in one operation', async () => {
  const { db, counts } = mockDb({ row: pendingWithCounselor() });
  const view = await loadMemberDashboardHome({ userId: 'u1', fallbackDisplayName: 'Pat' }, db);
  assert.deepEqual(view.counselorContext, {
    counselor: { name: 'Dana Whitfield', firstName: 'Dana', messagingHref: '/dashboard/messages' },
    waitEstimate: null,
    awaiting: 'approval',
  });
  assert.equal(view.approvalStatus.counselorName, 'Dana Whitfield');
  assert.equal(view.approvalStatus.stages.application.owner, 'counselor');
  assert.equal(view.organizationId, 'org-1');
  assert.equal(view.prismaOpCount, 1);
  assert.deepEqual(counts(), { findUniqueCalls: 1, txCalls: 1 });
});

test('a deactivated, deleted or cross-organisation counselor is dropped from both lines', async () => {
  for (const variant of [{ active: false }, { deletedAt: new Date() }, { organizationId: 'org-2' }]) {
    const { db } = mockDb({ row: pendingWithCounselor(variant) });
    const view = await loadMemberDashboardHome({ userId: 'u1', fallbackDisplayName: 'Pat' }, db);
    assert.equal(view.counselorContext.counselor, null, JSON.stringify(variant));
    assert.equal(view.approvalStatus.counselorName, null, JSON.stringify(variant));
    assert.equal(view.approvalStatus.stages.application.owner, 'staff', JSON.stringify(variant));
    assert.equal(view.counselorContext.awaiting, 'approval');
  }
});

test('the home view carries no wait estimate and names the awaited step from the saved statuses', async () => {
  const intake = await loadMemberDashboardHome(
    { userId: 'u1', fallbackDisplayName: 'Pat' },
    mockDb({ row: makeRow({ organizationId: 'org-1', applications: [{ status: 'APPROVED', submittedAt: null }], wioaReviewStatus: 'pending' }) }).db,
  );
  assert.equal(intake.counselorContext.awaiting, 'intake');
  assert.equal(intake.counselorContext.waitEstimate, null);
  const done = await loadMemberDashboardHome(
    { userId: 'u1', fallbackDisplayName: 'Pat' },
    mockDb({ row: makeRow({ organizationId: 'org-1', applications: [{ status: 'APPROVED', submittedAt: null }], wioaReviewStatus: 'verified' }) }).db,
  );
  assert.equal(done.counselorContext.awaiting, null);
  const missing = await loadMemberDashboardHome({ userId: 'ghost', fallbackDisplayName: 'Pat' }, mockDb({ row: null }).db);
  assert.deepEqual(missing.counselorContext, { counselor: null, waitEstimate: null, awaiting: null });
  assert.equal(missing.organizationId, null);
});

/**
 * "Up next" + the recommended tool read real facts from the same user read
 * (resume on file, unread counselor messages, interview practice, placement)
 * instead of the constants the kit home used to pass. `mockDb` projects the
 * fixture through the real `select`, so dropping any of those relations from
 * `userSelect()` fails these.
 */
const readyToTrain = (overrides: Record<string, unknown> = {}) =>
  makeRow({
    nextBestActions: [],
    assessmentCompleted: true,
    applications: [{ status: 'APPROVED', submittedAt: null }],
    jobApplications: [],
    ...overrides,
  });

test('up next: a member with no resume and no practice sees both, never the hero or the counselor floor twice', async () => {
  const { db, counts } = mockDb({ row: readyToTrain() });
  const view = await loadMemberDashboardHome({ userId: 'member-1' }, db);
  assert.equal(view.doThisNext?.id, 'continue_training');
  const ids = view.upNext.map((action) => action.id);
  assert.deepEqual(ids, ['upload_resume', 'interview_practice', 'career_readiness']);
  assert.ok(!ids.includes(view.doThisNext!.id));
  assert.ok(!ids.includes('default_counselor'));
  const paths = [view.doThisNext!.href, ...view.upNext.map((a) => a.href)].map((href) => href.split('?')[0]);
  assert.equal(new Set(paths).size, paths.length, 'no two rows open the same page');
  // Both matching tools are already rows, so the tool card does not repeat them.
  assert.equal(view.recommendedTool, null);
  assert.deepEqual(counts(), { findUniqueCalls: 1, txCalls: 1 });
});

test('up next: a saved resume and a finished practice session retire those rows', async () => {
  const { db } = mockDb({
    row: readyToTrain({
      profile: { resumeOriginalPath: 'member-files/u1/resume.pdf', resumeEnhancedPath: null },
      // A finished practice session is now a filtered count (the relation itself carries First 90 check-ins).
      _count: { userCertifications: 1, jobApplications: 2, memberEvents: 1 },
    }),
  });
  const view = await loadMemberDashboardHome({ userId: 'member-1' }, db);
  const ids = view.upNext.map((action) => action.id);
  assert.ok(!ids.includes('upload_resume'), ids.join(','));
  assert.ok(!ids.includes('interview_practice'), ids.join(','));
  assert.equal(view.recommendedTool?.slug, 'job-match-scorer');
});

test('up next: unread counselor messages count only what arrived after the member last read', async () => {
  const { db } = mockDb({
    row: readyToTrain({
      messageThreadsAsMember: [
        {
          memberLastReadAt: daysAgo(2),
          messages: [{ createdAt: daysAgo(0) }, { createdAt: daysAgo(1) }, { createdAt: daysAgo(3) }],
        },
      ],
    }),
  });
  const view = await loadMemberDashboardHome({ userId: 'member-1' }, db);
  // Weight 88 outranks continuing training (86): a reply waiting is the next thing.
  assert.equal(view.doThisNext?.id, 'counselor_messages');
  assert.match(view.doThisNext?.body ?? '', /2 unread messages/);
});

test('up next: a thread with nothing unread adds no messages row', async () => {
  const { db } = mockDb({
    row: readyToTrain({
      messageThreadsAsMember: [{ memberLastReadAt: daysAgo(0), messages: [{ createdAt: daysAgo(1) }] }],
    }),
  });
  const view = await loadMemberDashboardHome({ userId: 'member-1' }, db);
  assert.notEqual(view.doThisNext?.id, 'counselor_messages');
  assert.ok(!view.upNext.some((action) => action.id === 'counselor_messages'));
});

test('recommended tool: an interview in the pipeline names interview prep', async () => {
  const { db } = mockDb({ row: makeRow({ nextBestActions: [] }) });
  const view = await loadMemberDashboardHome({ userId: 'member-1' }, db);
  assert.equal(view.pipeline[0]?.stage, 'Interviewing');
  assert.equal(view.recommendedTool?.slug, 'interview-prep');
});

test('placement: a separated member is steered back to jobs; a working one gets no tool', async () => {
  const separated = await loadMemberDashboardHome(
    { userId: 'member-1' },
    mockDb({
      row: readyToTrain({
        placementRecord: { placedAt: daysAgo(120), retentionDecision: 'not_retained', retentionStatus: null },
      }),
    }).db,
  );
  assert.equal(separated.doThisNext?.id, 'placement_job_loss_reactivate');
  assert.equal(separated.recommendedTool?.slug, 'job-match-scorer');

  const working = await loadMemberDashboardHome(
    { userId: 'member-1' },
    mockDb({
      row: readyToTrain({
        placementRecord: { placedAt: daysAgo(10), retentionDecision: null, retentionStatus: null },
      }),
    }).db,
  );
  assert.equal(working.recommendedTool, null);
});

test('a persisted action keeps the hero and the heuristics fill the rows beneath it', async () => {
  const { db } = mockDb({ row: makeRow({ assessmentCompleted: true, jobApplications: [] }) });
  const view = await loadMemberDashboardHome({ userId: 'member-1' }, db);
  assert.equal(view.doThisNext?.id, 'nba-1');
  // The persisted hero already opens My Program, so continue_training is not repeated.
  assert.ok(!view.upNext.some((action) => action.href.split('?')[0] === view.doThisNext!.href));
  assert.ok(view.upNext.length > 0);
});

test('the zeroed view has no rows beyond the hero and names no tool', async () => {
  const view = await loadMemberDashboardHome({ userId: 'ghost' }, mockDb({ row: null }).db);
  assert.equal(view.doThisNext?.id, 'choose_program');
  assert.equal(view.recommendedTool, null);
  assert.ok(!view.upNext.some((action) => action.id === 'default_counselor'));
});

/**
 * WAP-188 Phase A: the pieces only the `?ui=legacy` home had (placement
 * confirmation, First 90 Days, the youth notice, the stalled-training
 * counselor strip, every persisted action, the view / activation events) now
 * come from the loader's one nested read. `mockDb` projects each fixture
 * through the real `select`, so dropping a field from `userSelect()` fails
 * the case that needs it; `select()` pins the bounds the mock ignores.
 */
const jobRow = (id: string, status: string, updatedDaysAgo: number, overrides: Record<string, unknown> = {}) => ({
  id,
  role: `Role ${id}`,
  company: `Company ${id}`,
  status,
  updatedAt: daysAgo(updatedDaysAgo),
  ...overrides,
});

test('placement strip: an OFFER below the pipeline card still reaches the strip, from the same single read', async () => {
  const { db, counts, select } = mockDb({
    row: makeRow({
      jobApplications: [
        jobRow('a1', 'SAVED', 1),
        jobRow('a2', 'APPLIED', 2),
        jobRow('a3', 'APPLIED', 3),
        jobRow('a4', 'PHONE_SCREEN', 4),
        jobRow('a5', 'OFFER', 9, { role: 'IT Support Specialist', company: 'Acme Health' }),
      ],
    }),
  });
  const view = await loadMemberDashboardHome({ userId: 'member-1' }, db);
  // The card is unchanged: the four most recently updated open rows.
  assert.deepEqual(view.pipeline.map((row) => row.company), ['Company a1', 'Company a2', 'Company a3', 'Company a4']);
  assert.deepEqual(view.jobOffers, [{ id: 'a5', role: 'IT Support Specialist', company: 'Acme Health' }]);
  // The offer is an open application too, so the tool pick agrees with the strip.
  assert.equal(view.recommendedTool?.slug, 'salary-negotiation');
  assert.deepEqual(counts(), { findUniqueCalls: 1, txCalls: 1 });
  assert.ok(view.prismaOpCount <= MEMBER_DASHBOARD_HOME_PRISMA_BUDGET);
  const jobs = select()!.jobApplications as { take: number; where: unknown; select: Record<string, unknown> };
  assert.ok(jobs.take > view.pipeline.length, 'the read reaches past the card');
  assert.deepEqual(jobs.where, { status: { notIn: ['REJECTED', 'ACCEPTED'] } });
  assert.equal(jobs.select.id, true, 'the strip confirms by application id');
});

test('placement strip: no OFFER row means no strip', async () => {
  const view = await loadMemberDashboardHome({ userId: 'member-1' }, mockDb({ row: makeRow() }).db);
  assert.deepEqual(view.jobOffers, []);
  const empty = await loadMemberDashboardHome({ userId: 'ghost' }, mockDb({ row: null }).db);
  assert.deepEqual(empty.jobOffers, []);
});

test('First 90 Days: a placed member gets the current stage, with earlier check-ins marked done', async () => {
  const { db, counts, select } = mockDb({
    row: readyToTrain({
      placementRecord: { placedAt: daysAgo(20), retentionDecision: null, retentionStatus: null, employerName: 'Acme Health' },
      memberEvents: [{ entityId: 'week_1', metadata: { response: 'have_questions' }, createdAt: daysAgo(15) }],
    }),
  });
  const view = await loadMemberDashboardHome({ userId: 'member-1' }, db);
  assert.deepEqual(view.first90, {
    stage: 'day_30',
    daysSincePlacement: 20,
    employerName: 'Acme Health',
    currentStageResponse: null,
    completedStages: ['week_1'],
  });
  assert.deepEqual(counts(), { findUniqueCalls: 1, txCalls: 1 });
  const events = select()!.memberEvents as { where: unknown; take: number };
  assert.deepEqual(events.where, { eventName: 'first90_check_in_submitted' });
  assert.equal(events.take, 12);
});

test('First 90 Days: past the window, or never placed, there is no card', async () => {
  const past = await loadMemberDashboardHome(
    { userId: 'member-1' },
    mockDb({
      row: readyToTrain({
        placementRecord: { placedAt: daysAgo(120), retentionDecision: null, retentionStatus: null, employerName: 'Acme Health' },
      }),
    }).db,
  );
  assert.equal(past.first90, null);
  const never = await loadMemberDashboardHome({ userId: 'member-1' }, mockDb({ row: readyToTrain() }).db);
  assert.equal(never.first90, null);
});

test('buildFirst90Card builds what the legacy home built', () => {
  const now = new Date('2026-09-23T12:00:00.000Z');
  const card = buildFirst90Card(
    { placedAt: new Date('2026-09-18T12:00:00.000Z'), employerName: null },
    [
      // Newest first: the first response per stage wins, as on the legacy home.
      { entityId: 'week_1', metadata: { response: 'going_well' }, createdAt: new Date('2026-09-20T12:00:00.000Z') },
      { entityId: 'week_1', metadata: { response: 'having_trouble' }, createdAt: new Date('2026-09-19T12:00:00.000Z') },
      { entityId: 'not_a_stage', metadata: { response: 'going_well' }, createdAt: new Date('2026-09-19T12:00:00.000Z') },
    ],
    now,
  );
  assert.deepEqual(card, {
    stage: 'week_1',
    daysSincePlacement: 5,
    employerName: '',
    currentStageResponse: 'going_well',
    completedStages: ['week_1'],
  });
  assert.equal(buildFirst90Card({ placedAt: new Date('2026-09-30T12:00:00.000Z') }, [], now), null, 'a future start date is not in the window');
  assert.equal(buildFirst90Card(null, [], now), null);
});

test('youth notice: the legacy age maths from profile.dob, shown only under 18', async () => {
  const YEAR_MS = 365.25 * DAY_MS;
  const now = Date.now();
  assert.equal(youthNoticeAgeFromDob(new Date(now - 16.5 * YEAR_MS), now), 16);
  assert.equal(youthNoticeAgeFromDob(new Date(now - 17.9 * YEAR_MS), now), 17);
  assert.equal(youthNoticeAgeFromDob(new Date(now - 18.1 * YEAR_MS), now), null);
  assert.equal(youthNoticeAgeFromDob(new Date(now + 30 * DAY_MS), now), null, 'a future date of birth is bad data');
  assert.equal(youthNoticeAgeFromDob(new Date('not a date'), now), null);
  assert.equal(youthNoticeAgeFromDob(null, now), null);

  const { db, select } = mockDb({
    row: makeRow({ profile: { resumeOriginalPath: null, resumeEnhancedPath: null, dob: new Date(now - 15.5 * YEAR_MS) } }),
  });
  const view = await loadMemberDashboardHome({ userId: 'member-1' }, db);
  assert.equal(view.youthNoticeAge, 15);
  assert.equal((select()!.profile as { select: Record<string, unknown> }).select.dob, true);
  const adult = await loadMemberDashboardHome({ userId: 'member-1' }, mockDb({ row: makeRow() }).db);
  assert.equal(adult.youthNoticeAge, null);
});

test('dashboard view facts: the legacy stage letters, checklist and activation inputs', () => {
  const base = {
    applicationExists: true,
    assignedProgramSlug: FIXTURE_PROGRAM_SLUG,
    assessmentCompleted: true,
    completedCount: 2,
    programTitle: 'IT Support',
  };
  assert.deepEqual(dashboardViewFacts(base), { state: 'D', checklistAllDone: true, completedCount: 2, programTitle: 'IT Support' });
  assert.equal(dashboardViewFacts({ ...base, applicationExists: false }).state, 'A');
  assert.equal(dashboardViewFacts({ ...base, assessmentCompleted: false }).state, 'C');
  assert.equal(dashboardViewFacts({ ...base, assessmentCompleted: false }).checklistAllDone, false);
  assert.equal(dashboardViewFacts({ ...base, completedCount: 0 }).checklistAllDone, false);
  // Legacy read training only for an assigned program: no program, nothing completed, no title.
  assert.deepEqual(dashboardViewFacts({ ...base, assignedProgramSlug: null }), { state: 'B', checklistAllDone: false, completedCount: 0 });
});

test('dashboard view facts come from the same read, and the zeroed view writes none', async () => {
  const program = getProgramBySlug(canonicalizeProgramSlug(FIXTURE_PROGRAM_SLUG));
  assert.ok(program);
  const view = await loadMemberDashboardHome(
    { userId: 'member-1' },
    mockDb({
      row: readyToTrain({
        courseProgress: [progressRow({ courseSlug: program.courses[0]!.slug, percentComplete: 100, status: 'COMPLETED' })],
      }),
    }).db,
  );
  assert.deepEqual(view.dashboardViewFacts, { state: 'D', checklistAllDone: true, completedCount: 1, programTitle: program.title });
  const noApplication = await loadMemberDashboardHome({ userId: 'member-1' }, mockDb({ row: makeRow() }).db);
  assert.equal(noApplication.dashboardViewFacts?.state, 'A');
  const missing = await loadMemberDashboardHome({ userId: 'ghost' }, mockDb({ row: null }).db);
  assert.equal(missing.dashboardViewFacts, null);
});

const persistedRow = (id: string, ctaHref: string, priority: number) => ({
  id,
  title: `Staff step ${id}`,
  description: 'Added by your counselor.',
  ctaHref,
  ctaLabel: 'Open',
  priority,
});

test('up next: every persisted action shows, the first as the hero and the rest ahead of the heuristics, one row per page', async () => {
  const { db, counts } = mockDb({
    row: readyToTrain({
      nextBestActions: [
        persistedRow('p1', '/dashboard/program', 9),
        persistedRow('p2', '/dashboard/readiness', 8),
        // The dead training stub resolves to My Program: the hero's page, so it is not repeated.
        persistedRow('p3', '/dashboard/training?program=x', 7),
      ],
    }),
  });
  const view = await loadMemberDashboardHome({ userId: 'member-1' }, db);
  assert.equal(view.doThisNext?.id, 'p1');
  assert.deepEqual(view.upNext.map((action) => action.id), ['p2', 'upload_resume', 'interview_practice']);
  const paths = [view.doThisNext!.href, ...view.upNext.map((action) => action.href)].map((href) => href.split(/[?#]/)[0]);
  assert.equal(new Set(paths).size, paths.length, 'no two rows open the same page');
  assert.deepEqual(counts(), { findUniqueCalls: 1, txCalls: 1 });
});

test('up next: the persisted rows alone can fill the list, and it still stops at three', async () => {
  const view = await loadMemberDashboardHome(
    { userId: 'member-1' },
    mockDb({
      row: readyToTrain({
        nextBestActions: [
          persistedRow('p1', '/dashboard/jobs', 9),
          persistedRow('p2', '/dashboard/readiness', 8),
          persistedRow('p3', '/dashboard/profile', 7),
        ],
      }),
    }).db,
  );
  assert.equal(view.doThisNext?.id, 'p1');
  assert.deepEqual(view.upNext.map((action) => action.id).slice(0, 2), ['p2', 'p3']);
  assert.equal(view.upNext.length, 3);
});

const stalledTraining = (overrides: Record<string, unknown> = {}) =>
  readyToTrain({ ...ableToStart(90, 90), courseProgress: [progressRow({ lastActivityAt: daysAgo(30) })], ...overrides });

test('up next: stalled training adds the counselor row once, after the persisted rows and before the heuristics', async () => {
  const stalled = await loadMemberDashboardHome({ userId: 'member-1' }, mockDb({ row: stalledTraining() }).db);
  assert.equal(stalled.courseProgressStale, true);
  assert.deepEqual(stalled.upNext[0], STALE_TRAINING_COUNSELOR_ACTION);
  assert.ok(stalled.upNext.length <= 3);
  assert.equal(stalled.upNext.filter((action) => action.href.split(/[?#]/)[0] === '/dashboard/messages').length, 1);

  const withStaff = await loadMemberDashboardHome(
    { userId: 'member-1' },
    mockDb({
      row: stalledTraining({
        nextBestActions: [persistedRow('p1', '/dashboard/program', 9), persistedRow('p2', '/dashboard/readiness', 8)],
      }),
    }).db,
  );
  assert.deepEqual(withStaff.upNext.map((action) => action.id).slice(0, 2), ['p2', STALE_TRAINING_COUNSELOR_ACTION.id]);
  assert.equal(withStaff.upNext.length, 3);
});

test('up next: no counselor row when Messages is already on screen, training is recent, or the program is finished', async () => {
  const unread = await loadMemberDashboardHome(
    { userId: 'member-1' },
    mockDb({
      row: stalledTraining({
        messageThreadsAsMember: [{ memberLastReadAt: daysAgo(3), messages: [{ createdAt: daysAgo(1) }] }],
      }),
    }).db,
  );
  assert.equal(unread.doThisNext?.id, 'counselor_messages');
  assert.ok(!unread.upNext.some((action) => action.id === STALE_TRAINING_COUNSELOR_ACTION.id));

  const staffMessages = await loadMemberDashboardHome(
    { userId: 'member-1' },
    mockDb({
      row: stalledTraining({
        nextBestActions: [persistedRow('p1', '/dashboard/program', 9), persistedRow('p2', '/dashboard/messages', 8)],
      }),
    }).db,
  );
  assert.ok(!staffMessages.upNext.some((action) => action.id === STALE_TRAINING_COUNSELOR_ACTION.id));

  const recent = await loadMemberDashboardHome(
    { userId: 'member-1' },
    mockDb({ row: stalledTraining({ courseProgress: [progressRow({ lastActivityAt: daysAgo(2) })] }) }).db,
  );
  assert.equal(recent.courseProgressStale, false);
  assert.ok(!recent.upNext.some((action) => action.id === STALE_TRAINING_COUNSELOR_ACTION.id));

  const program = getProgramBySlug(canonicalizeProgramSlug(FIXTURE_PROGRAM_SLUG));
  assert.ok(program);
  const finished = await loadMemberDashboardHome(
    { userId: 'member-1' },
    mockDb({
      row: stalledTraining({
        staleTrainingDetectedAt: daysAgo(5),
        courseProgress: program.courses.map((course) =>
          progressRow({ courseSlug: course.slug, courseId: null, percentComplete: 100, status: 'COMPLETED', lastActivityAt: daysAgo(30) }),
        ),
      }),
    }).db,
  );
  assert.equal(finished.courseProgressStale, true, 'the flag alone still says stale');
  assert.equal(finished.programStatus, 'Complete');
  assert.ok(!finished.upNext.some((action) => action.id === STALE_TRAINING_COUNSELOR_ACTION.id));
});

// ── WAP-194: every enrollment, `?program=`, and the first-login wizard, all on the one read ──

const SECONDARY_PROGRAM_SLUG = 'comptia-a-professional-certificate';

/** A member with two enrollments, primary first (the order the loader asks Postgres for). */
function twoProgramRow(overrides: Record<string, unknown> = {}) {
  return makeRow({
    assessmentCompleted: true,
    nextBestActions: [],
    courseEnrollments: [
      { id: 'enr-primary', programSlug: FIXTURE_PROGRAM_SLUG, isPrimary: true, curriculumVersion: 'legacy-v1', enrolledAt: new Date('2026-08-01T00:00:00Z') },
      { id: 'enr-second', programSlug: SECONDARY_PROGRAM_SLUG, isPrimary: false, curriculumVersion: 'legacy-v1', enrolledAt: new Date('2026-09-01T00:00:00Z') },
    ],
    ...overrides,
  });
}

test('WAP-194: the loader reads every enrollment inside the same nested read, still one Prisma operation', async () => {
  const { db, counts, select } = mockDb({ row: twoProgramRow() });
  const view = await loadMemberDashboardHome({ userId: 'member-1' }, db);
  assert.deepEqual(counts(), { findUniqueCalls: 1, txCalls: 1 });
  assert.equal(view.prismaOpCount, 1);
  assert.ok(view.prismaOpCount <= MEMBER_DASHBOARD_HOME_PRISMA_BUDGET);
  assert.equal(MEMBER_DASHBOARD_HOME_PRISMA_BUDGET, 2);

  const enrollments = select()?.courseEnrollments as { where?: unknown; take?: number; orderBy?: unknown; select?: Record<string, unknown> };
  assert.equal(enrollments.where, undefined, 'no isPrimary filter: the switch needs every enrollment');
  assert.deepEqual(enrollments.orderBy, [{ isPrimary: 'desc' }, { enrolledAt: 'desc' }]);
  assert.ok((enrollments.take ?? 0) >= 2);
  for (const column of ['id', 'programSlug', 'curriculumVersion', 'isPrimary', 'enrolledByAdminId', 'enrolledAt']) {
    assert.equal(enrollments.select?.[column], true, `courseEnrollments must select ${column}`);
  }

  // Both enrollments reach the switch, primary first, titled as the catalog titles them.
  assert.ok(view.programSwitch);
  assert.deepEqual(view.programSwitch.options.map((option) => [option.id, option.programSlug, option.isPrimary]), [
    ['enr-primary', FIXTURE_PROGRAM_SLUG, true],
    ['enr-second', SECONDARY_PROGRAM_SLUG, false],
  ]);
  assert.match(view.programSwitch.options[1]!.programTitle, /CompTIA A\+/);
  // No request: the home describes the primary program, exactly as before.
  assert.equal(view.programSwitch.activeProgramSlug, FIXTURE_PROGRAM_SLUG);
  assert.equal(view.programSwitch.viewingSecondary, false);
  assert.equal(view.programHref, '/dashboard/program');
  assert.equal(view.resumeHref, '/dashboard/program');
  assert.match(view.nextLessonHref ?? '', /^\/dashboard\/program\?course=/);
});

test('WAP-194: ?program= names one of the member\'s own enrollments and the home describes it', async () => {
  const { db, counts } = mockDb({ row: twoProgramRow() });
  const view = await loadMemberDashboardHome({ userId: 'member-1', requestedProgramSlug: SECONDARY_PROGRAM_SLUG }, db);
  assert.deepEqual(counts(), { findUniqueCalls: 1, txCalls: 1 });
  assert.equal(view.prismaOpCount, 1);
  assert.match(view.programTitle ?? '', /CompTIA A\+/);
  assert.equal(view.programSwitch?.activeProgramSlug, SECONDARY_PROGRAM_SLUG);
  assert.equal(view.programSwitch?.viewingSecondary, true);
  const secondary = getProgramBySlug(canonicalizeProgramSlug(SECONDARY_PROGRAM_SLUG));
  assert.ok(secondary);
  assert.equal(view.certModulesTotal, secondary.courses.length);
  assert.equal(view.nextLesson, secondary.courses[0]!.name);

  // My Program and its ?course= only open the primary program (WAP-196), so
  // a secondary view never deep-links there: every program link is the Learning hub.
  assert.equal(view.nextLessonHref, '/dashboard/learning');
  assert.equal(view.programHref, '/dashboard/learning');
  assert.equal(view.resumeHref, '/dashboard/learning');
  for (const action of [view.doThisNext, ...view.upNext]) {
    if (!action) continue;
    assert.notEqual(action.href.split(/[?#]/)[0], '/dashboard/program', `${action.id} must not open My Program on a secondary view`);
  }
  const training = [view.doThisNext, ...view.upNext].find((action) => action?.id === 'continue_training');
  assert.ok(training, 'the next-course step is still offered');
  assert.equal(training.href, '/dashboard/learning');
  assert.equal(training.cta, 'Open Learning hub');
  assert.match(training.title, new RegExp(secondary.courses[0]!.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('WAP-194: ?program= validation falls back to the primary for an unknown, foreign or blank slug', async () => {
  for (const requestedProgramSlug of ['not-a-program', 'ux-design-professional-certificate-google', '', '   ', null, undefined]) {
    const view = await loadMemberDashboardHome({ userId: 'member-1', requestedProgramSlug }, mockDb({ row: twoProgramRow() }).db);
    assert.equal(view.programSwitch?.activeProgramSlug, FIXTURE_PROGRAM_SLUG, `"${String(requestedProgramSlug)}" falls back to the primary`);
    assert.equal(view.programSwitch?.viewingSecondary, false);
    assert.equal(view.programHref, '/dashboard/program');
    assert.doesNotMatch(view.programTitle ?? '', /CompTIA/);
  }
  // Asking for the primary by name is the primary view.
  const primary = await loadMemberDashboardHome({ userId: 'member-1', requestedProgramSlug: FIXTURE_PROGRAM_SLUG }, mockDb({ row: twoProgramRow() }).db);
  assert.equal(primary.programSwitch?.viewingSecondary, false);
});

test('WAP-194: one enrollment shows no switch, and a request cannot conjure a program the member is not in', async () => {
  const single = await loadMemberDashboardHome(
    { userId: 'member-1', requestedProgramSlug: SECONDARY_PROGRAM_SLUG },
    mockDb({ row: makeRow() }).db,
  );
  assert.equal(single.programSwitch, null);
  assert.doesNotMatch(single.programTitle ?? '', /CompTIA/);
  assert.equal(single.programHref, '/dashboard/program');

  // No enrollment and no legacy program: nothing to switch to, nothing chosen.
  const none = await loadMemberDashboardHome(
    { userId: 'member-1', requestedProgramSlug: SECONDARY_PROGRAM_SLUG },
    mockDb({ row: makeRow({ courseEnrollments: [], enrolledProgram: null }) }).db,
  );
  assert.equal(none.programSwitch, null);
  assert.equal(none.programTitle, undefined);
});

test('WAP-194: a secondary WorkforceAP module links to its own module page with the stored program slug', async () => {
  const { DIGITAL_LITERACY_PROGRAM_SLUG } = await import('@/shared/digitalLiteracyPathway');
  const view = await loadMemberDashboardHome(
    { userId: 'member-1', requestedProgramSlug: DIGITAL_LITERACY_PROGRAM_SLUG },
    mockDb({
      row: twoProgramRow({
        courseEnrollments: [
          { id: 'enr-primary', programSlug: FIXTURE_PROGRAM_SLUG, isPrimary: true, curriculumVersion: 'legacy-v1' },
          { id: 'enr-dl', programSlug: DIGITAL_LITERACY_PROGRAM_SLUG, isPrimary: false, curriculumVersion: 'legacy-v1' },
        ],
      }),
    }).db,
  );
  assert.equal(view.programSwitch?.viewingSecondary, true);
  assert.match(view.nextLessonHref ?? '', /^\/dashboard\/learning\/modules\//);
  assert.ok(
    (view.nextLessonHref ?? '').endsWith(`?program=${encodeURIComponent(DIGITAL_LITERACY_PROGRAM_SLUG)}`),
    'the module page resolves the enrollment from this slug',
  );
});

test('WAP-194: the first-login wizard and tour gate come from the same read', async () => {
  const intake = {
    fullName: 'Alex Rivera',
    phone: '5125550100',
    programInterest: 'Intake interest',
    onboardingCurrentStep: 2,
    profile: {
      profilePhone: null,
      profileAddress: '1 Main St',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
      referralSource: 'Friend',
    },
    applications: [{ status: 'PENDING', submittedAt: new Date('2026-09-10T00:00:00Z'), programInterest: 'Application interest' }],
  };
  const { db, select } = mockDb({ row: makeRow({ ...intake, onboardingCompletedAt: null, tourCompletedAt: null }) });
  const fresh = await loadMemberDashboardHome({ userId: 'member-1' }, db);
  assert.equal(fresh.prismaOpCount, 1);
  for (const column of ['onboardingCompletedAt', 'onboardingCurrentStep', 'tourCompletedAt', 'programInterest']) {
    assert.equal(select()?.[column], true, `userSelect() must ask for ${column}`);
  }
  assert.deepEqual(fresh.onboarding, {
    showWizard: true,
    showTour: false,
    wizard: {
      initialFullName: 'Alex Rivera',
      // No profile phone: the account phone, as the legacy home read it.
      initialPhone: '5125550100',
      initialAddress: '1 Main St',
      initialCity: 'Austin',
      initialState: 'TX',
      initialZip: '78701',
      initialProgramInterest: 'Application interest',
      initialReferralSource: 'Friend',
      initialStep: 2,
    },
  });

  const noApplicationInterest = await loadMemberDashboardHome(
    { userId: 'member-1' },
    mockDb({ row: makeRow({ ...intake, applications: [], onboardingCompletedAt: null }) }).db,
  );
  assert.equal(noApplicationInterest.onboarding?.wizard.initialProgramInterest, 'Intake interest');

  const tour = await loadMemberDashboardHome(
    { userId: 'member-1' },
    mockDb({ row: makeRow({ ...intake, onboardingCompletedAt: new Date(), tourCompletedAt: null }) }).db,
  );
  assert.equal(tour.onboarding?.showWizard, false);
  assert.equal(tour.onboarding?.showTour, true);

  const done = await loadMemberDashboardHome(
    { userId: 'member-1' },
    mockDb({ row: makeRow({ ...intake, onboardingCompletedAt: new Date(), tourCompletedAt: new Date() }) }).db,
  );
  assert.equal(done.onboarding?.showWizard, false);
  assert.equal(done.onboarding?.showTour, false);

  // No member row: nothing for the wizard to write to and nothing to switch.
  const empty = await loadMemberDashboardHome({ userId: 'ghost' }, mockDb({ row: null }).db);
  assert.equal(empty.onboarding, null);
  assert.equal(empty.programSwitch, null);
});

test('WAP-194: secondaryProgramAction rewrites only My Program steps', () => {
  const myProgram = { id: 'continue_training', title: 'Continue training: X', body: 'Open My Program', href: '/dashboard/program', cta: 'Open My Program', variant: 'urgent' as const, weight: 86 };
  const rewritten = secondaryProgramAction(myProgram);
  assert.equal(rewritten.href, SECONDARY_PROGRAM_HREF);
  assert.equal(rewritten.title, myProgram.title);
  assert.equal(rewritten.cta, 'Open Learning hub');
  assert.doesNotMatch(rewritten.body, /My Program/);
  for (const href of ['/dashboard/program/start', '/dashboard/messages', '/dashboard/assessment']) {
    const action = { ...myProgram, href };
    assert.equal(secondaryProgramAction(action), action, `${href} is not a program link`);
  }
});

test('WAP-194: the dashboard page passes ?program= to the loader and mounts the four pieces on the kit branch', () => {
  const src = readFileSync(path.join(ROOT, 'app/(portal)/dashboard/page.tsx'), 'utf8');
  const kitStart = src.indexOf("if (args.requestedUi !== 'legacy')");
  const legacyStart = src.indexOf('await loadMemberCareerBriefBundleSafe');
  const kitBlock = src.slice(kitStart, legacyStart);
  assert.match(kitBlock, /requestedProgramSlug: args\.requestedProgramSlug/);
  assert.match(kitBlock, /<PWAInstallPrompt \/>/);
  assert.match(kitBlock, /<PortalEntryClient[\s\S]*portal="member"/);
  assert.match(kitBlock, /showStaffViewBanner=\{staffViewer\}/);
  assert.match(kitBlock, /programSwitch=\{home\.programSwitch\}/);
  assert.match(kitBlock, /getTourOffer\(user\.id, 'member\.home'\)/);
  // My Program stays untouched (locked stake; WAP-196 is separate).
  assert.doesNotMatch(kitBlock, /dashboard\/program\/page/);
});
