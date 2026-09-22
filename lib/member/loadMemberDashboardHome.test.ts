import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  MEMBER_DASHBOARD_HOME_PRISMA_BUDGET,
  deriveNextBadge,
  loadMemberDashboardHome,
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
    courseEnrollments: [{ programSlug: 'it-support-professional-certificate-ibm' }],
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
  // `args` is `unknown` to match the loader's own DashboardHomeTx signature.
  const findUnique = async (args: unknown) => {
    findUniqueCalls += 1;
    if (opts.missFirst && findUniqueCalls === 1) return null;
    const row = opts.row === undefined ? makeRow() : opts.row;
    const select = (args as { select?: Record<string, unknown> } | undefined)?.select;
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
        courseEnrollments: [{ programSlug: slug }],
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
      courseEnrollments: [{ programSlug: 'comptia-a-professional-certificate' }],
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
    courseEnrollments: [{ programSlug: FIXTURE_PROGRAM_SLUG, enrolledByAdminId: 'staff' }],
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
  courseEnrollments: [{ programSlug: 'it-support-professional-certificate-ibm' }],
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
      courseEnrollments: [{ programSlug: 'it-support-professional-certificate-ibm' }],
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
