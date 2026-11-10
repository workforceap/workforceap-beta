import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { handleAdminDraftPdf, type AdminDraftDeps } from './admin-draft';
import type { TrustedEnrollment } from './repository';
import { attendanceProtectedOperations, adaptCumulativeSource, adaptPointEvent } from './workflow';
import { handleSyntheticAttendance } from './synthetic-http';

const ORG = '00000000-0000-4000-8000-000000000003';
const OTHER_ORG = '00000000-0000-4000-8000-0000000000aa';
const ADMIN = '00000000-0000-4000-8000-000000000002';
const STUDENT = '00000000-0000-4000-8000-000000000001';
const ENROLLMENT = '00000000-0000-4000-8000-000000000005';

const enrollment = (organizationId: string): TrustedEnrollment => ({
  scope: { organizationId, memberId: STUDENT, enrollmentId: ENROLLMENT }, active: true,
  profile: { name: 'Draft Student', email: null, phone: null },
  enrollment: { program: 'Draft Program', twistId: null, counselor: null, abbreviation: null, pathway: null, classStart: null, classEnd: null },
  startMonth: null, configuredInstructorId: null, sourceMappings: [],
});
function deps(over: { userId?: string | null; actor?: 'admin' | 'other-org' | 'none'; writes?: string[] } = {}): AdminDraftDeps {
  const userId = over.userId === undefined ? ADMIN : over.userId;
  const actor = over.actor ?? 'admin';
  return {
    getUserId: async () => userId,
    resolveAdminActor: async (id) => actor === 'none' ? null : { userId: id, organizationId: actor === 'admin' ? ORG : OTHER_ORG, permissions: ['attendance:admin'] },
    // Stored data lives in ORG only: an other-org admin cannot see the enrollment.
    loadEnrollment: async (orgId, enrollmentId) => orgId === ORG && enrollmentId === ENROLLMENT ? enrollment(ORG) : null,
  };
}
const body = (extra: Record<string, unknown> = {}) => JSON.stringify({
  enrollmentId: ENROLLMENT, kind: 'weekly', selectedDate: '2026-11-09',
  rows: [{ date: '2026-11-09', minutes: 270 }], ...extra,
});
async function pdfText(bytes: Uint8Array): Promise<string> {
  const doc = await getDocument({ data: new Uint8Array(bytes) }).promise;
  let out = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    out += content.items.map(i => ('str' in i ? i.str : '')).join(' ') + '\n';
  }
  return out;
}

test('same-org admin gets an inline draft PDF with notices, entered hours and unknown days', async () => {
  const res = await handleAdminDraftPdf('POST', body(), deps());
  assert.equal(res.status, 200);
  assert.ok('pdf' in res);
  if (!('pdf' in res)) return;
  assert.equal(res.headers['content-type'], 'application/pdf');
  assert.match(res.headers['content-disposition'], /^inline/);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(Buffer.from(res.pdf.slice(0, 5)).toString(), '%PDF-');
  const text = await pdfText(res.pdf);
  assert.match(text, /DRAFT/);
  assert.match(text, /Not WFS approved/i);
  assert.match(text, /PROPOSED DRAFT RULE/);
  assert.match(text, /not institutionally approved/);
  assert.match(text, /2026-11-09\s+4\.50/);
  assert.match(text, /2026-11-10\s+unknown/);
  assert.match(text, /Time In\/Out unavailable/);
  assert.match(text, /Draft Student/);
});

test('anonymous is 401, student/non-admin and other-org admin are denied', async () => {
  assert.equal((await handleAdminDraftPdf('POST', body(), deps({ userId: null }))).status, 401);
  assert.equal((await handleAdminDraftPdf('POST', body(), deps({ userId: STUDENT, actor: 'none' }))).status, 403);
  const other = await handleAdminDraftPdf('POST', body(), deps({ actor: 'other-org' }));
  assert.equal(other.status, 404);
  assert.ok(!('pdf' in other));
});

test('non-POST is 405', async () => {
  assert.equal((await handleAdminDraftPdf('GET', '', deps())).status, 405);
});

test('request carrying verifiedBy, role, permissions, actor or org ids is rejected', async () => {
  for (const extra of [{ verifiedBy: ADMIN }, { role: 'admin' }, { permissions: ['attendance:admin'] }, { actor: ADMIN }, { organizationId: OTHER_ORG }, { memberId: STUDENT }]) {
    const res = await handleAdminDraftPdf('POST', body(extra), deps());
    assert.equal(res.status, 400, JSON.stringify(extra));
  }
  for (const key of ['verifiedBy', 'role', 'permissions']) {
    const res = await handleAdminDraftPdf('POST', body({ rows: [{ date: '2026-11-09', minutes: 240, [key]: 'x' }] }), deps());
    assert.equal(res.status, 400, `row ${key}`);
  }
});

test('invalid input maps to 400/422 and never a PDF', async () => {
  assert.equal((await handleAdminDraftPdf('POST', '{', deps())).status, 400);
  assert.equal((await handleAdminDraftPdf('POST', body({ rows: [{ date: '2026-11-09', minutes: 90, code: 'W' }] }), deps())).status, 400);
  assert.equal((await handleAdminDraftPdf('POST', body({ rows: [{ date: '2026-13-45', minutes: 60 }] }), deps())).status, 422);
  // evidence outside the requested week
  assert.equal((await handleAdminDraftPdf('POST', body({ rows: [{ date: '2026-12-25', minutes: 60 }] }), deps())).status, 422);
  assert.equal((await handleAdminDraftPdf('POST', body({ rows: [{ date: '2026-11-09', minutes: 60 }, { date: '2026-11-09', minutes: 120 }] }), deps())).status, 422);
});

test('absence code is accepted and never shown as hours', async () => {
  const res = await handleAdminDraftPdf('POST', body({ rows: [{ date: '2026-11-10', code: 'A' }] }), deps());
  assert.equal(res.status, 200);
  if (!('pdf' in res)) throw new Error('expected pdf');
  assert.match(await pdfText(res.pdf), /2026-11-10\s+unknown\s+unknown\s+A/);
});

test('estimated/point sources produce no daily hours; protected operations still 503-class', () => {
  const scope = enrollment(ORG).scope;
  const mapping = { ...scope, providerLearnerId: 'l', courseId: 'c' };
  assert.deepEqual(adaptCumulativeSource(scope, { providerLearnerId: 'l', courseId: 'c', estimatedHours: 40 }, [mapping]).evidence, []);
  assert.deepEqual(adaptPointEvent(scope, { providerLearnerId: 'l', courseId: 'c', statementId: 's', timestamp: '2026-11-09T10:00:00Z' }, [mapping]).evidence, []);
  for (const op of Object.values(attendanceProtectedOperations)) assert.throws(op, /ATTENDANCE_VERIFIED_ARCHIVE_UNAVAILABLE/);
});

test('synthetic route stays 404 when flag is off or VERCEL_ENV=production', async () => {
  const saved = { ...process.env };
  try {
    delete process.env.ATTENDANCE_SYNTHETIC_DEMO;
    assert.equal((await handleSyntheticAttendance('POST', '{}')).status, 404);
    process.env.ATTENDANCE_SYNTHETIC_DEMO = 'local';
    process.env.VERCEL_ENV = 'production';
    assert.equal((await handleSyntheticAttendance('POST', '{}')).status, 404);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});
