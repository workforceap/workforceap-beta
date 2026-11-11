import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSyncPreview, CUMULATIVE_LABEL, SIGNAL_LABELS, type SyncPreview, type XapiPoint } from './sync-preview';
import { baseSyncInput, FX } from './sync-preview-fixtures';
import { handleAdminSyncPreview } from './sync-preview-http';
import { handleSyntheticSyncPreview } from './sync-preview-synthetic';
import { SYNTHETIC_ENROLLMENT, SYNTHETIC_MEMBER, SYNTHETIC_OTHER_MEMBER, SYNTHETIC_ORG, SYNTHETIC_OTHER_ORG, SYNTHETIC_OTHER_ORG_MEMBER, syntheticActor } from './synthetic-fixtures';

const acct = { accountName: 'acct-member', homePage: FX.home };
const pt = (o: Partial<XapiPoint> & { statementId: string; timestamp: string }): XapiPoint =>
  ({ organizationId: SYNTHETIC_ORG, verb: 'activity', courseId: 'course-a', actor: acct, ...o });
const day = (p: SyncPreview, d: string) => p.days.find(x => x.date === d)!;
function noAttendance(p: SyncPreview) {
  for (const d of p.days) {
    assert.deepEqual(d.attendance, { code: null, timeIn: null, timeOut: null, minutes: null });
    assert.deepEqual(d.draft.codes, []);
    assert.equal(d.draft.actualMinutes, null);
    assert.equal(d.draft.estimatedMinutes, null);
  }
  assert.deepEqual(p.writes, { attendanceEvidence: 0, storage: 0, signing: 0, sends: 0 });
  assert.equal(p.wfsApproved, false);
  assert.equal(p.draft, true);
  assert.doesNotMatch(JSON.stringify(p), /"P"|timeIn":"/);
}

test('duplicate statement/event collapses; same id with different content rejected', () => {
  const p = buildSyncPreview(baseSyncInput({ points: [
    pt({ statementId: 's1', timestamp: '2026-09-08T15:00:00Z', verb: 'item-completed', itemId: 'i1' }),
    pt({ statementId: 's1', timestamp: '2026-09-08T15:00:00Z', verb: 'item-completed', itemId: 'i1' }),
    pt({ statementId: 's2', timestamp: '2026-09-08T15:00:00Z', verb: 'item-completed', itemId: 'i1' }),
    pt({ statementId: 's1', timestamp: '2026-09-08T16:00:00Z', verb: 'item-completed', itemId: 'i1' }),
  ] }));
  const sigs = day(p, '2026-09-08').signals;
  assert.equal(sigs.length, 1);
  assert.equal(sigs[0].duplicatesCollapsed, 2);
  assert.equal(sigs[0].label, SIGNAL_LABELS['item-completed']);
  assert.deepEqual(p.rejections, [{ source: 'xapi', sourceId: 's1', reason: 'CONFLICTING_DUPLICATE_STATEMENT' }]);
  noAttendance(p);
});

test('unmatched, ambiguous, deleted, cross-org identity and cross-org event are rejected', () => {
  const input = baseSyncInput({ points: [
    pt({ statementId: 'u', timestamp: '2026-09-08T15:00:00Z', actor: { accountName: 'nobody', homePage: FX.home } }),
    pt({ statementId: 'a', timestamp: '2026-09-08T15:00:00Z', actor: { email: 'dup@example.invalid' } }),
    pt({ statementId: 'd', timestamp: '2026-09-08T15:00:00Z', actor: { accountName: 'acct-deleted', homePage: FX.home } }),
    pt({ statementId: 'x', timestamp: '2026-09-08T15:00:00Z', actor: { accountName: 'acct-xorg', homePage: FX.home } }),
    pt({ statementId: 'o', timestamp: '2026-09-08T15:00:00Z', organizationId: SYNTHETIC_OTHER_ORG }),
    pt({ statementId: 'n', timestamp: '2026-09-08T15:00:00Z', organizationId: null }),
    pt({ statementId: 'other', timestamp: '2026-09-08T15:00:00Z', actor: { accountName: 'acct-other', homePage: FX.home } }),
  ] });
  input.identityMappings.push(
    { userId: SYNTHETIC_MEMBER, courseraEmail: 'dup@example.invalid' },
    { userId: SYNTHETIC_OTHER_MEMBER, courseraEmail: 'dup@example.invalid' },
    { userId: SYNTHETIC_OTHER_ORG_MEMBER, actorIdentifier: 'acct-xorg', actorHomePage: FX.home });
  const p = buildSyncPreview(input);
  const r = Object.fromEntries(p.rejections.map(x => [x.sourceId, x.reason]));
  assert.deepEqual(r, { u: 'UNMATCHED_IDENTITY', a: 'AMBIGUOUS_IDENTITY', d: 'DELETED_USER', x: 'IDENTITY_NOT_IN_ORGANIZATION', o: 'CROSS_ORG_EVENT', n: 'EVENT_ORG_MISSING' });
  assert.equal(p.excludedOtherEnrollments, 1);
  assert.equal(p.coverage.signalDays, 0);
  noAttendance(p);
});

test('curated email resolves; account without homePage does not', () => {
  const p = buildSyncPreview(baseSyncInput({ points: [
    pt({ statementId: 'e', timestamp: '2026-09-08T15:00:00Z', actor: { email: 'MEMBER@example.invalid' } }),
    pt({ statementId: 'h', timestamp: '2026-09-08T16:00:00Z', actor: { accountName: 'acct-member' } }),
  ] }));
  assert.equal(day(p, '2026-09-08').signals.length, 1);
  assert.deepEqual(p.rejections, [{ source: 'xapi', sourceId: 'h', reason: 'UNMATCHED_IDENTITY' }]);
});

test('enrollment curriculum version selects the mapping', () => {
  const ev = [pt({ statementId: 'b', timestamp: '2026-09-08T15:00:00Z', courseId: 'course-b' }), pt({ statementId: 'a', timestamp: '2026-09-08T16:00:00Z' })];
  const v1 = buildSyncPreview(baseSyncInput({ points: ev }));
  assert.deepEqual(v1.rejections, [{ source: 'xapi', sourceId: 'b', reason: 'COURSE_NOT_IN_ENROLLMENT_CURRICULUM' }]);
  assert.equal(day(v1, '2026-09-08').signals[0].courseSlug, 'course-a-v1');
  const base = baseSyncInput({ points: ev });
  base.enrollment.curriculumVersion = FX.v2;
  const v2 = buildSyncPreview(base);
  assert.equal(v2.rejections.length, 0);
  assert.equal(day(v2, '2026-09-08').signals.length, 2);
  const amb = baseSyncInput({ points: ev });
  amb.curriculumMappings.push({ courseraCourseId: 'course-a', canonicalProgramSlug: FX.program, curriculumVersion: FX.v1, canonicalCourseSlug: 'other' });
  assert.equal(buildSyncPreview(amb).rejections.find(x => x.sourceId === 'a')?.reason, 'AMBIGUOUS_COURSE_MAPPING');
});

test('America/Chicago midnight boundaries and DST', () => {
  const p = buildSyncPreview(baseSyncInput({ points: [
    pt({ statementId: 'm1', timestamp: '2026-09-09T04:59:59Z' }),
    pt({ statementId: 'm2', timestamp: '2026-09-09T05:00:00Z' }),
  ] }));
  assert.equal(day(p, '2026-09-08').signals[0].sourceId, 'm1');
  assert.equal(day(p, '2026-09-09').signals[0].sourceId, 'm2');
  const w = buildSyncPreview(baseSyncInput({ period: { kind: 'monthly', selectedDate: '2026-11-01', startMonth: null }, asOf: '2026-11-03T00:00:00Z', points: [
    pt({ statementId: 'w1', timestamp: '2026-11-01T05:30:00Z' }),
    pt({ statementId: 'w2', timestamp: '2026-11-02T05:59:59Z' }),
    pt({ statementId: 'w3', timestamp: '2026-11-02T06:00:00Z' }),
  ] }));
  assert.deepEqual(day(w, '2026-11-01').signals.map(s => s.sourceId), ['w1', 'w2']);
  assert.equal(day(w, '2026-11-02').signals[0].sourceId, 'w3');
  assert.equal(day(w, '2026-11-01').signals[0].timezone, 'America/Chicago');
  const bad = buildSyncPreview(baseSyncInput({ points: [pt({ statementId: 'bad', timestamp: '2026-09-09T05:00:00' })] }));
  assert.equal(bad.rejections[0].reason, 'INVALID_TIMESTAMP');
});

test('late event is flagged; missing days are Unknown, never zero', () => {
  const p = buildSyncPreview(baseSyncInput({ points: [pt({ statementId: 'l', timestamp: '2026-09-07T15:00:00Z', receivedAt: '2026-09-10T15:00:00Z' })] }));
  assert.equal(day(p, '2026-09-07').signals[0].late, true);
  const blank = day(p, '2026-09-10');
  assert.equal(blank.status, 'unknown');
  assert.equal(blank.unknownLabel, 'Unknown');
  assert.equal(blank.signals.length, 0);
  assert.equal(p.coverage.unknownDays, 6);
  assert.equal(p.coverage.signalDays, 1);
  noAttendance(p);
});

test('cumulative snapshots give a delta labelled not-daily, no daily minutes', () => {
  const snap = (id: string, at: string, h: number | null) => ({ snapshotId: id, organizationId: SYNTHETIC_ORG, capturedAt: at, externalEmail: 'member@example.invalid', courseId: 'course-a', lastActivityTime: null, completionTime: null, learningHours: h });
  const p = buildSyncPreview(baseSyncInput({ snapshots: [snap('s2', '2026-09-08T12:00:00Z', 4.5), snap('s1', '2026-09-07T12:00:00Z', 3), snap('s3', '2026-09-09T12:00:00Z', 4), snap('s4', '2026-09-10T01:00:00Z', null)] }));
  assert.deepEqual(p.cumulative.map(c => c.deltaSincePreviousSnapshot), [null, 1.5, -0.5, null]);
  assert.equal(p.cumulative[2].decreased, true);
  for (const c of p.cumulative) { assert.equal(c.label, CUMULATIVE_LABEL); assert.equal(c.dailyMinutes, null); }
  assert.equal(p.coverage.signalDays, 0);
  noAttendance(p);
});

test('portal login is a labelled non-attendance signal only', () => {
  const p = buildSyncPreview(baseSyncInput({ points: [pt({ statementId: 'pl', timestamp: '2026-09-08T14:00:00Z', verb: 'portal-login', courseId: null })] }));
  const s = day(p, '2026-09-08').signals[0];
  assert.equal(s.label, 'Portal login (not attendance)');
  assert.equal(s.courseId, null);
  noAttendance(p);
});

test('completion with no duration stays a point; CSV times become signals', () => {
  const p = buildSyncPreview(baseSyncInput({
    points: [pt({ statementId: 'c', timestamp: '2026-09-08T20:00:00Z', verb: 'course-completed' })],
    snapshots: [{ snapshotId: 'csv1', organizationId: SYNTHETIC_ORG, capturedAt: '2026-09-09T12:00:00Z', externalEmail: 'member@example.invalid', courseId: 'course-a',
      lastActivityTime: '2026-09-08T18:00:00Z', completionTime: '2026-09-08T20:00:00Z', learningHours: 2 }],
  }));
  const d = day(p, '2026-09-08');
  assert.deepEqual(d.signals.map(s => s.label), ['Activity observed (not attendance)', 'Completed course (not attendance)']);
  assert.equal(d.signals[1].duplicatesCollapsed, 1);
  assert.equal(d.signals.every(s => !s.verified), true);
  noAttendance(p);
});

test('admin-entered is unverified', () => {
  const p = buildSyncPreview(baseSyncInput({ adminEntries: [{ entryId: 'adm1', date: '2026-09-08' }] }));
  assert.equal(day(p, '2026-09-08').signals[0].label, 'Admin-entered (unverified)');
  noAttendance(p);
});

test('Learner Activity Detail roll-up: cumulative + recency only, no date', () => {
  const p = buildSyncPreview(baseSyncInput({ rollups: [
    { rollupId: 'r1', organizationId: SYNTHETIC_ORG, externalEmail: 'member@example.invalid', totalLearningHours: 12.5, uniqueCourses: 3, daysSinceLastActivity: 4 },
    { rollupId: 'r2', organizationId: SYNTHETIC_ORG, externalEmail: 'nobody@example.invalid', totalLearningHours: 1, uniqueCourses: 1, daysSinceLastActivity: 1 },
    { rollupId: 'r3', organizationId: SYNTHETIC_ORG, externalEmail: 'member@example.invalid', totalLearningHours: 1, uniqueCourses: null, daysSinceLastActivity: null },
  ] }));
  assert.equal(p.rollups[0].label, 'Coursera cumulative estimate (not attendance)');
  assert.equal(p.rollups[0].lastActivityDate, null);
  assert.equal(p.rollups[0].recency, '4 day(s) before an export date not in the file');
  assert.equal(p.rollups[1].recency, 'Unknown');
  assert.deepEqual(p.rejections, [{ source: 'csv', sourceId: 'r2', reason: 'UNMATCHED_IDENTITY' }]);
  assert.equal(p.coverage.signalDays, 0);
  noAttendance(p);
});

test('no provider identifiers or payload leak into the preview output', () => {
  const p = buildSyncPreview(baseSyncInput({ points: [pt({ statementId: 's', timestamp: '2026-09-08T15:00:00Z', actor: { accountName: 'acct-member', homePage: FX.home, email: 'member@example.invalid' } })] }));
  assert.doesNotMatch(JSON.stringify(p), /acct-member|synthetic\.invalid|member@/);
});

test('enrollment guards: deleted user, user in another org', () => {
  const a = baseSyncInput();
  a.enrollment.userDeleted = true;
  assert.throws(() => buildSyncPreview(a), /ATTENDANCE_ENROLLMENT_INACTIVE/);
  const b = baseSyncInput();
  b.enrollment.userOrganizationId = SYNTHETIC_OTHER_ORG;
  assert.throws(() => buildSyncPreview(b), /ATTENDANCE_ENROLLMENT_NOT_FOUND/);
});

const body = JSON.stringify({ enrollmentId: SYNTHETIC_ENROLLMENT, kind: 'weekly', selectedDate: '2026-09-09' });
function deps(role: 'admin' | 'student' | 'other-org-admin' | null, calls: string[] = []) {
  return {
    getUserId: async () => (role ? 'u' : null),
    resolveAdminActor: async () => (role ? syntheticActor(role) : null),
    loadSyncInput: async (org: string) => { calls.push(org); return org === SYNTHETIC_ORG ? baseSyncInput() : null; },
  };
}

test('HTTP boundary: 401/403/404 tenant isolation/400 strict body/405/200', async () => {
  assert.equal((await handleAdminSyncPreview('POST', body, deps(null))).status, 401);
  const calls: string[] = [];
  assert.equal((await handleAdminSyncPreview('POST', body, deps('student', calls))).status, 403);
  assert.deepEqual(calls, []);
  const x = await handleAdminSyncPreview('POST', body, deps('other-org-admin', calls));
  assert.equal(x.status, 404);
  assert.deepEqual(calls, [SYNTHETIC_OTHER_ORG]);
  const extra = JSON.stringify({ enrollmentId: SYNTHETIC_ENROLLMENT, kind: 'weekly', selectedDate: '2026-09-09', organizationId: 'x' });
  assert.equal((await handleAdminSyncPreview('POST', extra, deps('admin'))).status, 400);
  assert.equal((await handleAdminSyncPreview('GET', '', deps('admin'))).status, 405);
  const ok = await handleAdminSyncPreview('POST', body, deps('admin'));
  assert.equal(ok.status, 200);
  assert.equal(ok.body.draft, true);
});

test('HTTP boundary rejects ambiguous requested learner rather than returning an empty preview', async () => {
  const input = baseSyncInput({ points: [pt({ statementId: 'ambiguous', timestamp: '2026-09-08T15:00:00Z', actor: { email: 'dup@example.invalid' } })] });
  input.identityMappings.push(
    { userId: SYNTHETIC_MEMBER, courseraEmail: 'dup@example.invalid' },
    { userId: SYNTHETIC_OTHER_MEMBER, courseraEmail: 'dup@example.invalid' });
  const result = await handleAdminSyncPreview('POST', body, {
    ...deps('admin'), loadSyncInput: async () => input,
  });
  assert.deepEqual(result, { status: 404, body: { error: 'ATTENDANCE_ENROLLMENT_NOT_FOUND' } });
});

test('HTTP boundary validates injected enrollment, actor, and blank valid days', async () => {
  const loaded = baseSyncInput();
  const injected = (input: typeof loaded | null, role: 'admin' | 'student' = 'admin') => ({
    ...deps(role), loadSyncInput: async () => input,
  });
  const wrongId = baseSyncInput();
  wrongId.enrollment.enrollmentId = '00000000-0000-4000-8000-000000000099';
  assert.deepEqual(await handleAdminSyncPreview('POST', body, injected(wrongId)), { status: 404, body: { error: 'ATTENDANCE_ENROLLMENT_NOT_FOUND' } });
  const wrongOrg = baseSyncInput();
  wrongOrg.enrollment.userOrganizationId = SYNTHETIC_OTHER_ORG;
  assert.deepEqual(await handleAdminSyncPreview('POST', body, injected(wrongOrg)), { status: 404, body: { error: 'ATTENDANCE_ENROLLMENT_NOT_FOUND' } });
  const calls: string[] = [];
  assert.deepEqual(await handleAdminSyncPreview('POST', body, {
    ...deps('student'), loadSyncInput: async () => { calls.push('loaded'); return loaded; },
  }), { status: 403, body: { error: 'ATTENDANCE_FORBIDDEN' } });
  assert.deepEqual(calls, []);
  const ok = await handleAdminSyncPreview('POST', body, injected(loaded));
  assert.equal(ok.status, 200);
  const preview = ok.body as unknown as SyncPreview;
  assert.equal(preview.coverage.signalDays, 0);
  assert.equal(preview.coverage.unknownDays, 7);
  noAttendance(preview);
});

test('HTTP boundary fails closed for ambiguous learner CSV and roll-up identities', async () => {
  const input = baseSyncInput({
    snapshots: [{ snapshotId: 'csv-ambiguous', organizationId: SYNTHETIC_ORG, capturedAt: '2026-09-09T12:00:00Z', externalEmail: 'dup@example.invalid', courseId: 'course-a', lastActivityTime: null, completionTime: null, learningHours: null }],
    rollups: [{ rollupId: 'rollup-ambiguous', organizationId: SYNTHETIC_ORG, externalEmail: 'dup@example.invalid', totalLearningHours: null, uniqueCourses: null, daysSinceLastActivity: null }],
  });
  input.identityMappings.push({ userId: SYNTHETIC_MEMBER, courseraEmail: 'dup@example.invalid' }, { userId: SYNTHETIC_OTHER_MEMBER, courseraEmail: 'dup@example.invalid' });
  for (const source of ['snapshots', 'rollups'] as const) {
    const one = baseSyncInput({ identityMappings: input.identityMappings, [source]: input[source] });
    assert.deepEqual(await handleAdminSyncPreview('POST', body, { ...deps('admin'), loadSyncInput: async () => one }),
      { status: 404, body: { error: 'ATTENDANCE_ENROLLMENT_NOT_FOUND' } });
  }
});

test('HTTP boundary permits unrelated ambiguous rejected rows', async () => {
  const input = baseSyncInput({ points: [pt({ statementId: 'unrelated', timestamp: '2026-09-08T15:00:00Z', actor: { email: 'others@example.invalid' } })] });
  input.identityMappings.push({ userId: SYNTHETIC_OTHER_MEMBER, courseraEmail: 'others@example.invalid' }, { userId: SYNTHETIC_OTHER_ORG_MEMBER, courseraEmail: 'others@example.invalid' });
  const result = await handleAdminSyncPreview('POST', body, { ...deps('admin'), loadSyncInput: async () => input });
  assert.equal(result.status, 200);
  assert.deepEqual((result.body as unknown as SyncPreview).rejections, [{ source: 'xapi', sourceId: 'unrelated', reason: 'AMBIGUOUS_IDENTITY' }]);
});

test('synthetic entry point is disabled by default and in production', async () => {
  const saved = { demo: process.env.ATTENDANCE_SYNC_PREVIEW_DEMO, vercel: process.env.VERCEL_ENV };
  try {
    delete process.env.ATTENDANCE_SYNC_PREVIEW_DEMO;
    assert.equal((await handleSyntheticSyncPreview('POST', body)).status, 404);
    process.env.ATTENDANCE_SYNC_PREVIEW_DEMO = 'local';
    process.env.VERCEL_ENV = 'production';
    assert.equal((await handleSyntheticSyncPreview('POST', body)).status, 404);
    delete process.env.VERCEL_ENV;
    assert.equal((await handleSyntheticSyncPreview('POST', body, 'student')).status, 403);
    const ok = await handleSyntheticSyncPreview('POST', body);
    assert.equal(ok.status, 200);
    assert.equal((ok.body as unknown as SyncPreview).coverage.signalDays, 1);
  } finally {
    if (saved.demo === undefined) delete process.env.ATTENDANCE_SYNC_PREVIEW_DEMO; else process.env.ATTENDANCE_SYNC_PREVIEW_DEMO = saved.demo;
    if (saved.vercel === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = saved.vercel;
  }
});

test('static guard: preview modules import no db/storage/signing/send/log code', () => {
  for (const f of ['sync-preview.ts', 'sync-preview-http.ts', 'sync-preview-synthetic.ts', 'sync-preview-fixtures.ts']) {
    const src = readFileSync(new URL(`./${f}`, import.meta.url), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const imports = [...code.replace(/^import type .*$/gm, '').matchAll(/from\s+'([^']+)'/g)].map(m => m[1]);
    for (const spec of imports) assert.match(spec, /^(\.\/|zod$|node:fs$)/, `${f} imports ${spec}`);
    assert.doesNotMatch(imports.join(' '), /workflow|repository|pdf|signing/, f);
    assert.doesNotMatch(code, /prisma|withTenantScope|supabase|resend|fetch\(|console\.|logger\.|appendEvidence|saveDraft|sendEmail/i, f);
  }
});
