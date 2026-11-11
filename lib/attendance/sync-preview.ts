/**
 * Coursera / site attendance SYNC PREVIEW. Pure and read-only: no database, storage, signing,
 * send or logging. It shows dated provider POINT signals beside the DRAFT calendar and never
 * produces attendance (no P/A, no Time In/Out, no daily minutes, no zero for unknown days).
 * Output carries source ids and reason codes only, never provider payloads, emails or names.
 */
import { REPORTING_TIMEZONE, localEvidenceDate, periodDates, summarize, type Day, type SheetKind } from './evidence';

export const SYNC_PREVIEW_LABEL = 'DRAFT SYNC PREVIEW — not attendance, not WFS approved, nothing written';
export const SIGNAL_LABELS = Object.freeze({
  activity: 'Activity observed (not attendance)',
  'item-completed': 'Completed item (not attendance)',
  'course-completed': 'Completed course (not attendance)',
  'portal-login': 'Portal login (not attendance)',
  'admin-entered': 'Admin-entered (unverified)',
} as const);
export const CUMULATIVE_LABEL = 'Cumulative estimated hours (not daily)';
export const UNKNOWN_LABEL = 'Unknown';
export const LATE_EVENT_HOURS = 48;
export const STALE_SOURCE_DAYS = 7;

export type SignalKind = keyof typeof SIGNAL_LABELS;
export type EnrollmentContext = {
  organizationId: string; enrollmentId: string; userId: string; userDeleted: boolean; userOrganizationId: string;
  programSlug: string; curriculumVersion: string;
};
export type IdentityMapping = { userId: string; actorIdentifier?: string | null; actorHomePage?: string | null; courseraEmail?: string | null };
/** Users that exist in the actor's organization (userId -> deleted?). Anything absent is cross-org/unknown. */
export type OrgUsers = Record<string, { deleted: boolean }>;
export type CurriculumMapping = { courseraCourseId: string; canonicalProgramSlug: string; curriculumVersion: string; canonicalCourseSlug: string };
export type XapiPoint = {
  statementId: string; organizationId: string | null; timestamp: string; receivedAt?: string;
  verb: 'activity' | 'item-completed' | 'course-completed' | 'portal-login';
  courseId: string | null; itemId?: string | null;
  actor: { accountName?: string | null; homePage?: string | null; email?: string | null };
};
export type CsvSnapshot = {
  snapshotId: string; organizationId: string | null; capturedAt: string; externalEmail: string; courseId: string;
  lastActivityTime: string | null; completionTime: string | null; learningHours: number | null;
};
/** Learner Activity Detail roll-up: cumulative hours + recency only. No calendar dates, courses or sessions. */
export type LearnerRollup = { rollupId: string; organizationId: string | null; externalEmail: string; totalLearningHours: number | null; uniqueCourses: number | null; daysSinceLastActivity: number | null };
export type AdminEntry = { entryId: string; date: string };
export type SyncInput = {
  enrollment: EnrollmentContext; orgUsers: OrgUsers; identityMappings: IdentityMapping[]; curriculumMappings: CurriculumMapping[];
  /** Curated external email -> WAP userId. Keys lowercase. */
  curatedEmails: Record<string, string>;
  points: XapiPoint[]; snapshots: CsvSnapshot[]; rollups?: LearnerRollup[]; adminEntries: AdminEntry[];
  period: { kind: SheetKind; selectedDate: string; startMonth: number | null };
  asOf: string;
};
export type RejectReason =
  | 'UNMATCHED_IDENTITY' | 'AMBIGUOUS_IDENTITY' | 'IDENTITY_NOT_IN_ORGANIZATION' | 'DELETED_USER' | 'CROSS_ORG_EVENT' | 'EVENT_ORG_MISSING'
  | 'COURSE_NOT_IN_ENROLLMENT_CURRICULUM' | 'AMBIGUOUS_COURSE_MAPPING' | 'CONFLICTING_DUPLICATE_STATEMENT' | 'INVALID_TIMESTAMP';
export type Rejection = { source: 'xapi' | 'csv'; sourceId: string; reason: RejectReason };
export type PreviewSignal = {
  kind: SignalKind; label: string; sourceId: string; timestamp: string | null; localDate: string; timezone: string;
  courseId: string | null; courseSlug: string | null; itemId: string | null; late: boolean; duplicatesCollapsed: number; verified: false;
};
export type PreviewDay = {
  date: string; status: 'signals' | 'unknown'; unknownLabel: typeof UNKNOWN_LABEL | null; signals: PreviewSignal[];
  /** Always blank: preview can never carry attendance. */
  attendance: { code: null; timeIn: null; timeOut: null; minutes: null };
  draft: Day;
};
export type CumulativeEstimate = {
  label: typeof CUMULATIVE_LABEL; courseId: string; courseSlug: string; snapshotId: string; capturedAt: string;
  cumulativeEstimatedHours: number | null; deltaSincePreviousSnapshot: number | null; previousSnapshotId: string | null;
  dailyMinutes: null; decreased: boolean;
};
export type RollupEstimate = {
  label: 'Coursera cumulative estimate (not attendance)'; sourceId: string; totalLearningHours: number | null; uniqueCourses: number | null;
  /** Relative to an export date the file does not carry; deliberately never converted to a calendar date. */
  recency: string; lastActivityDate: null; dailyMinutes: null;
};
export type SyncPreview = {
  label: typeof SYNC_PREVIEW_LABEL; draft: true; wfsApproved: false; timezone: string; enrollmentId: string;
  curriculum: { programSlug: string; curriculumVersion: string };
  days: PreviewDay[]; cumulative: CumulativeEstimate[]; rollups: RollupEstimate[]; rejections: Rejection[]; excludedOtherEnrollments: number;
  freshness: { asOf: string; latestSignalAt: string | null; latestSnapshotAt: string | null; stale: boolean };
  coverage: { signalDays: number; unknownDays: number; periodDays: number; firstSignalDate: string | null; lastSignalDate: string | null };
  writes: { attendanceEvidence: 0; storage: 0; signing: 0; sends: 0 };
};

type Resolution = 'mine' | 'other' | RejectReason;
const lc = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
const ms = (t: string) => new Date(t).getTime();
const hoursBetween = (a: string, b: string) => (ms(b) - ms(a)) / 3_600_000;

function checkUser(input: SyncInput, userIds: Set<string>): Resolution {
  if (userIds.size === 0) return 'UNMATCHED_IDENTITY';
  if (userIds.size > 1) return 'AMBIGUOUS_IDENTITY';
  const [userId] = [...userIds];
  const user = input.orgUsers[userId];
  if (!user) return 'IDENTITY_NOT_IN_ORGANIZATION';
  if (user.deleted) return 'DELETED_USER';
  return userId === input.enrollment.userId ? 'mine' : 'other';
}
function resolveXapi(input: SyncInput, p: XapiPoint): Resolution {
  const ids = new Set<string>();
  if (p.actor.accountName && p.actor.homePage) {
    for (const m of input.identityMappings) if (m.actorIdentifier === p.actor.accountName && m.actorHomePage === p.actor.homePage) ids.add(m.userId);
  }
  if (p.actor.email) {
    const e = lc(p.actor.email);
    for (const m of input.identityMappings) if (lc(m.courseraEmail) === e) ids.add(m.userId);
    if (input.curatedEmails[e]) ids.add(input.curatedEmails[e]);
  }
  return checkUser(input, ids);
}
function resolveCsv(input: SyncInput, s: CsvSnapshot): Resolution {
  const e = lc(s.externalEmail); const ids = new Set<string>();
  if (input.curatedEmails[e]) ids.add(input.curatedEmails[e]);
  for (const m of input.identityMappings) if (lc(m.courseraEmail) === e) ids.add(m.userId);
  return checkUser(input, ids);
}
/** Course must be mapped for THIS enrollment's program and curriculum version. */
function courseSlug(input: SyncInput, courseId: string | null): { slug: string } | { reason: RejectReason } {
  const slugs = new Set(input.curriculumMappings
    .filter(m => m.courseraCourseId === courseId && m.canonicalProgramSlug === input.enrollment.programSlug && m.curriculumVersion === input.enrollment.curriculumVersion)
    .map(m => m.canonicalCourseSlug));
  if (slugs.size === 0) return { reason: 'COURSE_NOT_IN_ENROLLMENT_CURRICULUM' };
  if (slugs.size > 1) return { reason: 'AMBIGUOUS_COURSE_MAPPING' };
  return { slug: [...slugs][0] };
}
function localDate(ts: string): string | null { try { return localEvidenceDate(ts); } catch { return null; } }

export function buildSyncPreview(input: SyncInput): SyncPreview {
  const { enrollment: e } = input;
  if (e.userOrganizationId !== e.organizationId) throw new Error('ATTENDANCE_ENROLLMENT_NOT_FOUND');
  if (e.userDeleted) throw new Error('ATTENDANCE_ENROLLMENT_INACTIVE');
  const dates = periodDates(input.period.kind, input.period.selectedDate, input.period.startMonth);
  const rejections: Rejection[] = []; let excluded = 0;
  const signals: PreviewSignal[] = [];
  const byEvent = new Map<string, PreviewSignal>();
  const reject = (source: Rejection['source'], sourceId: string, reason: RejectReason) => rejections.push({ source, sourceId, reason });
  const add = (sig: PreviewSignal) => {
    const key = [sig.kind, sig.courseId, sig.itemId, sig.timestamp].join('|');
    const dup = byEvent.get(key);
    if (dup) { dup.duplicatesCollapsed++; return; }
    byEvent.set(key, sig); signals.push(sig);
  };

  // xAPI points. A repeated statement id is collapsed if identical, rejected if its content differs.
  const statements = new Map<string, string>();
  for (const p of input.points) {
    if (!p.organizationId) { reject('xapi', p.statementId, 'EVENT_ORG_MISSING'); continue; }
    if (p.organizationId !== e.organizationId) { reject('xapi', p.statementId, 'CROSS_ORG_EVENT'); continue; }
    const fingerprint = JSON.stringify([p.verb, p.courseId, p.itemId ?? null, p.timestamp, p.actor.accountName ?? null, p.actor.homePage ?? null, lc(p.actor.email)]);
    const prior = statements.get(p.statementId);
    if (prior !== undefined && prior !== fingerprint) { reject('xapi', p.statementId, 'CONFLICTING_DUPLICATE_STATEMENT'); continue; }
    statements.set(p.statementId, fingerprint);
    const day = localDate(p.timestamp);
    if (!day) { reject('xapi', p.statementId, 'INVALID_TIMESTAMP'); continue; }
    const who = resolveXapi(input, p);
    if (who === 'other') { excluded++; continue; }
    if (who !== 'mine') { reject('xapi', p.statementId, who); continue; }
    let slug: string | null = null;
    if (p.verb !== 'portal-login') {
      const c = courseSlug(input, p.courseId);
      if ('reason' in c) { reject('xapi', p.statementId, c.reason); continue; }
      slug = c.slug;
    }
    add({ kind: p.verb, label: SIGNAL_LABELS[p.verb], sourceId: p.statementId, timestamp: p.timestamp, localDate: day, timezone: REPORTING_TIMEZONE,
      courseId: p.verb === 'portal-login' ? null : p.courseId, courseSlug: slug, itemId: p.itemId ?? null,
      late: !!p.receivedAt && hoursBetween(p.timestamp, p.receivedAt) > LATE_EVENT_HOURS, duplicatesCollapsed: 0, verified: false });
  }

  // CSV snapshots: lastActivityTime / completionTime are point signals; learningHours stays cumulative.
  const byCourse = new Map<string, Array<{ s: CsvSnapshot; slug: string }>>();
  for (const s of input.snapshots) {
    if (!s.organizationId) { reject('csv', s.snapshotId, 'EVENT_ORG_MISSING'); continue; }
    if (s.organizationId !== e.organizationId) { reject('csv', s.snapshotId, 'CROSS_ORG_EVENT'); continue; }
    const who = resolveCsv(input, s);
    if (who === 'other') { excluded++; continue; }
    if (who !== 'mine') { reject('csv', s.snapshotId, who); continue; }
    const c = courseSlug(input, s.courseId);
    if ('reason' in c) { reject('csv', s.snapshotId, c.reason); continue; }
    for (const [kind, ts] of [['activity', s.lastActivityTime], ['course-completed', s.completionTime]] as const) {
      if (!ts) continue;
      const day = localDate(ts);
      if (!day) { reject('csv', s.snapshotId, 'INVALID_TIMESTAMP'); continue; }
      add({ kind, label: SIGNAL_LABELS[kind], sourceId: s.snapshotId, timestamp: ts, localDate: day, timezone: REPORTING_TIMEZONE,
        courseId: s.courseId, courseSlug: c.slug, itemId: null, late: hoursBetween(ts, s.capturedAt) > LATE_EVENT_HOURS, duplicatesCollapsed: 0, verified: false });
    }
    const list = byCourse.get(s.courseId) ?? []; list.push({ s, slug: c.slug }); byCourse.set(s.courseId, list);
  }
  const cumulative: CumulativeEstimate[] = [];
  for (const [courseId, list] of byCourse) {
    list.sort((a, b) => ms(a.s.capturedAt) - ms(b.s.capturedAt) || a.s.snapshotId.localeCompare(b.s.snapshotId));
    list.forEach(({ s, slug }, i) => {
      const prev = i > 0 ? list[i - 1].s : null;
      const delta = prev && prev.learningHours !== null && s.learningHours !== null ? Math.round((s.learningHours - prev.learningHours) * 100) / 100 : null;
      cumulative.push({ label: CUMULATIVE_LABEL, courseId, courseSlug: slug, snapshotId: s.snapshotId, capturedAt: s.capturedAt,
        cumulativeEstimatedHours: s.learningHours, deltaSincePreviousSnapshot: delta, previousSnapshotId: prev?.snapshotId ?? null,
        dailyMinutes: null, decreased: delta !== null && delta < 0 });
    });
  }

  const rollups: RollupEstimate[] = [];
  for (const r of input.rollups ?? []) {
    if (!r.organizationId) { reject('csv', r.rollupId, 'EVENT_ORG_MISSING'); continue; }
    if (r.organizationId !== e.organizationId) { reject('csv', r.rollupId, 'CROSS_ORG_EVENT'); continue; }
    const ids = new Set<string>();
    const key = lc(r.externalEmail);
    if (input.curatedEmails[key]) ids.add(input.curatedEmails[key]);
    for (const m of input.identityMappings) if (lc(m.courseraEmail) === key) ids.add(m.userId);
    const who = checkUser(input, ids);
    if (who === 'other') { excluded++; continue; }
    if (who !== 'mine') { reject('csv', r.rollupId, who); continue; }
    rollups.push({ label: 'Coursera cumulative estimate (not attendance)', sourceId: r.rollupId, totalLearningHours: r.totalLearningHours, uniqueCourses: r.uniqueCourses,
      recency: r.daysSinceLastActivity === null ? 'Unknown' : `${r.daysSinceLastActivity} day(s) before an export date not in the file`, lastActivityDate: null, dailyMinutes: null });
  }

  // Admin-entered rows are shown as unverified markers only; minutes/codes are never copied in.
  for (const a of input.adminEntries) {
    add({ kind: 'admin-entered', label: SIGNAL_LABELS['admin-entered'], sourceId: a.entryId, timestamp: null, localDate: a.date, timezone: REPORTING_TIMEZONE,
      courseId: null, courseSlug: null, itemId: a.entryId, late: false, duplicatesCollapsed: 0, verified: false });
  }

  const draftDays = summarize(dates, []); // existing DRAFT calendar with no evidence: every day blank
  const days: PreviewDay[] = dates.map((date, i) => {
    const daySignals = signals.filter(s => s.localDate === date)
      .sort((a, b) => (a.timestamp ? ms(a.timestamp) : 0) - (b.timestamp ? ms(b.timestamp) : 0) || a.sourceId.localeCompare(b.sourceId));
    return { date, status: daySignals.length ? 'signals' : 'unknown', unknownLabel: daySignals.length ? null : UNKNOWN_LABEL, signals: daySignals,
      attendance: { code: null, timeIn: null, timeOut: null, minutes: null }, draft: draftDays[i] };
  });
  const dated = days.filter(d => d.status === 'signals').map(d => d.date);
  const stamps = signals.map(s => s.timestamp).filter((t): t is string => !!t).sort((a, b) => ms(a) - ms(b));
  const caps = cumulative.map(c => c.capturedAt).sort((a, b) => ms(a) - ms(b));
  const latestAny = [stamps.at(-1), caps.at(-1)].filter((t): t is string => !!t).sort((a, b) => ms(a) - ms(b)).at(-1);
  return {
    label: SYNC_PREVIEW_LABEL, draft: true, wfsApproved: false, timezone: REPORTING_TIMEZONE, enrollmentId: e.enrollmentId,
    curriculum: { programSlug: e.programSlug, curriculumVersion: e.curriculumVersion },
    days, cumulative, rollups, rejections, excludedOtherEnrollments: excluded,
    freshness: { asOf: input.asOf, latestSignalAt: stamps.at(-1) ?? null, latestSnapshotAt: caps.at(-1) ?? null,
      stale: !latestAny || hoursBetween(latestAny, input.asOf) > STALE_SOURCE_DAYS * 24 },
    coverage: { signalDays: dated.length, unknownDays: days.length - dated.length, periodDays: days.length, firstSignalDate: dated[0] ?? null, lastSignalDate: dated.at(-1) ?? null },
    writes: { attendanceEvidence: 0, storage: 0, signing: 0, sends: 0 },
  };
}
