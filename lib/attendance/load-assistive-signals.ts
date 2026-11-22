/**
 * Read-only Coursera and site point signals for one enrollment's month.
 * Counts only. Never writes attendance, storage, or hours.
 * Called from the admin draft route, which is already server-only.
 */
import { MEMBER_ACTIVITY_EVENT_WHERE } from '@/lib/admin/healthScore';
import { programCourseEstimate } from './coursera-estimate';
import { assistiveSignals, type AssistiveSignals } from './assistive-signals';
import { validDate } from './evidence';

type Reader = {
  courseEnrollment: { findFirst(args: unknown): Promise<{ userId: string; programSlug: string; user: { organizationId: string; email: string | null; lastLoginAt: Date | null } } | null> };
  courseraIdentityMapping: { findMany(args: unknown): Promise<Array<{ actorIdentifier: string | null; actorHomePage: string | null; courseraEmail: string | null }>> };
  courseraCourseProgress: { findMany(args: unknown): Promise<Array<{ isCompleted: boolean; learningHours: unknown; lastActivityTime: Date | null; completionTime: Date | null }>> };
  xapiStatement: { findMany(args: unknown): Promise<Array<{ createdAt: Date }>> };
  courseProgress: { findMany(args: unknown): Promise<Array<{ lastActivityAt: Date | null }>> };
  memberEvent: { findMany(args: unknown): Promise<Array<{ createdAt: Date }>> };
};

function monthBounds(month: string): { start: Date; end: Date } {
  if (!/^\d{4}-\d{2}$/.test(month) || !validDate(`${month}-01`)) throw new Error('INVALID_DATE');
  const start = new Date(`${month}-01T00:00:00Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}

function stamp(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

export async function loadMonthlyAssistiveSignals(
  db: Reader,
  organizationId: string,
  enrollmentId: string,
  month: string,
): Promise<AssistiveSignals | null> {
  const { start, end } = monthBounds(month);
  const enrollment = await db.courseEnrollment.findFirst({
    where: { id: enrollmentId, organizationId },
    select: { userId: true, programSlug: true, user: { select: { organizationId: true, email: true, lastLoginAt: true } } },
  });
  if (!enrollment || enrollment.user.organizationId !== organizationId) return null;
  const identity = await db.courseraIdentityMapping.findMany({
    where: { userId: enrollment.userId },
    select: { actorIdentifier: true, actorHomePage: true, courseraEmail: true },
  });
  const actors = identity.filter(row => row.actorIdentifier && row.actorHomePage);
  const emails = [...new Set(identity.map(row => row.courseraEmail).filter((value): value is string => !!value))];
  const statementWhere = actors.length === 0 && emails.length === 0 ? null : {
    organizationId,
    createdAt: { gte: start, lt: end },
    OR: [
      ...actors.map(row => ({ actorAccountName: row.actorIdentifier, actorHomePage: row.actorHomePage })),
      ...emails.map(email => ({ actorEmail: email })),
    ],
  };
  const [progress, statements, courseActivity, events] = await Promise.all([
    db.courseraCourseProgress.findMany({
      where: { organizationId, userId: enrollment.userId, programSlug: enrollment.programSlug, isRemovedFromProgram: false },
      select: { isCompleted: true, learningHours: true, lastActivityTime: true, completionTime: true },
    }),
    statementWhere ? db.xapiStatement.findMany({ where: statementWhere, select: { createdAt: true } }) : Promise.resolve([]),
    db.courseProgress.findMany({
      where: { userId: enrollment.userId, programSlug: enrollment.programSlug, lastActivityAt: { gte: start, lt: end } },
      select: { lastActivityAt: true },
    }),
    db.memberEvent.findMany({
      where: { userId: enrollment.userId, createdAt: { gte: start, lt: end }, ...MEMBER_ACTIVITY_EVENT_WHERE },
      select: { createdAt: true },
    }),
  ]);
  const courseraPoints = [
    ...progress.flatMap(row => [stamp(row.lastActivityTime), stamp(row.completionTime)]),
    ...statements.map(row => stamp(row.createdAt)),
    ...courseActivity.map(row => stamp(row.lastActivityAt)),
  ].filter((value): value is string => !!value).map(timestamp => ({ timestamp }));
  const sitePoints = events.map(row => ({ timestamp: row.createdAt.toISOString() }));
  if (enrollment.user.lastLoginAt && enrollment.user.lastLoginAt >= start && enrollment.user.lastLoginAt < end) {
    sitePoints.push({ timestamp: enrollment.user.lastLoginAt.toISOString() });
  }
  const learning = progress.reduce((sum, row) => sum + Number(row.learningHours), 0);
  return assistiveSignals({
    month,
    courseraPoints,
    sitePoints,
    coursera: progress.length === 0 ? null : {
      coursesCompleted: progress.filter(row => row.isCompleted).length,
      learningHours: learning,
    },
    catalogHours: programCourseEstimate(enrollment.programSlug)?.estimatedHours ?? null,
  });
}
