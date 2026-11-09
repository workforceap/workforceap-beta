import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { InMemorySyntheticAttendanceRepository } from './synthetic-repository';
import { runSyntheticImport, runSyntheticPreview } from './synthetic-flow';
import { handleSyntheticAttendance, resetSyntheticAttendanceRepo, syntheticDemoEnabled } from './synthetic-http';
import { digest } from './evidence';
import * as fixtures from './synthetic-fixtures';
import { syntheticActor } from './synthetic-fixtures';

const { SYNTHETIC_ORG: org, SYNTHETIC_MEMBER: member, SYNTHETIC_ENROLLMENT: enrollment, SYNTHETIC_OTHER_ORG: otherOrg } = fixtures;
const ids = { organizationId: org, memberId: member, enrollmentId: enrollment };
const row = (over: Record<string, unknown> = {}) => ({ sourceKey: 'reg-1', date: '2026-11-09', kind: 'verified-duration', minutes: 240, reference: 'synthetic-only', reason: 'Reviewed synthetic daily total', ...over });
const admin = syntheticActor('admin');
const student = syntheticActor('student');
let repo = new InMemorySyntheticAttendanceRepository();
beforeEach(() => { repo = new InMemorySyntheticAttendanceRepository(); });

/** What pdf.ts prints in every page footer: the full, untruncated digest of the snapshot alone. */
const footerLine = (snapshotDigest: string) => `Snapshot SHA-256: ${snapshotDigest}`;
/**
 * `preview.hash` (scope + snapshot + evidence) and the PDF footer digest (snapshot only)
 * are intentionally different identifiers; each is checked against its own definition.
 */
function assertPreviewHashes(preview: { hash: string }, text: string, draft: { scope: unknown; snapshot: unknown; evidence: unknown } | null) {
  assert.ok(draft, 'the saved draft must be loadable');
  assert.match(preview.hash, /^[0-9a-f]{64}$/, 'preview.hash is exactly 64 lowercase hex characters');
  assert.equal(preview.hash, digest({ scope: draft.scope, snapshot: draft.snapshot, evidence: draft.evidence }), 'preview.hash is the full draft hash');
  const snapshotDigest = digest(draft.snapshot);
  assert.match(snapshotDigest, /^[0-9a-f]{64}$/);
  assert.notEqual(snapshotDigest, preview.hash, 'the footer digest and the draft hash are different identifiers');
  assert.ok(text.includes(footerLine(snapshotDigest)), 'PDF footer prints the full snapshot digest');
  const printed = [...text.matchAll(/Snapshot SHA-256: ([0-9a-f]+)/g)].map(match => match[1]);
  assert.ok(printed.length >= 1, 'a footer digest is printed');
  for (const value of printed) assert.equal(value, snapshotDigest, 'every page footer prints exactly the snapshot digest');
}

async function pdfText(base64: string) {
  const loaded = await getDocument({ data: new Uint8Array(Buffer.from(base64, 'base64')), useSystemFonts: true, disableFontFace: true }).promise;
  try {
    const out: string[] = [];
    for (let i = 1; i <= loaded.numPages; i++) out.push((await (await loaded.getPage(i)).getTextContent()).items.map(item => 'str' in item ? item.str : '').join(' ').replace(/\s+/g, ' '));
    return out.join(' ');
  } finally { await loaded.destroy(); }
}

test('entry/import -> selection -> inline preview shows entered data and the synthetic label', async () => {
  const saved = runSyntheticImport(repo, admin, { ...ids, expectedRevision: 0, rows: [row()] });
  assert.equal(saved.revision, 1); assert.equal(saved.durable, false);
  const preview = await runSyntheticPreview(repo, student, { ...ids, kind: 'weekly', selectedDate: '2026-11-11' });
  assert.equal(preview.durable, false); assert.match(preview.label, /LOCAL SYNTHETIC/);
  const text = await pdfText(preview.pdfBase64);
  for (const expected of ['Synthetic Student', 'Synthetic Workforce Program', '2026-11-09', 'Verified known-hours subtotal: 4.00; coverage 1/7', 'Code counts: P 1 / W 0 / CR 0 / A 0', 'not institutionally approved', 'Student attestation: pending']) assert.ok(text.includes(expected), expected);
  assertPreviewHashes(preview, text, repo.loadDraft(ids, preview.draftId));
});

test('hash assertions fail for a wrong, malformed or mismatched hash (negative cases)', async () => {
  runSyntheticImport(repo, admin, { ...ids, expectedRevision: 0, rows: [row()] });
  const preview = await runSyntheticPreview(repo, student, { ...ids, kind: 'weekly', selectedDate: '2026-11-11' });
  const text = await pdfText(preview.pdfBase64);
  const draft = repo.loadDraft(ids, preview.draftId)!;
  const good = digest(draft.snapshot);
  assert.doesNotThrow(() => assertPreviewHashes(preview, text, draft));
  const flip = (hex: string) => (hex[0] === '0' ? '1' : '0') + hex.slice(1);
  const fails = (label: string, run: () => void) => assert.throws(run, { name: 'AssertionError' }, label);
  // preview.hash wrong: empty, truncated, too long, uppercase, non-hex, well-formed but different.
  for (const hash of ['', preview.hash.slice(0, 63), `${preview.hash}0`, preview.hash.toUpperCase(), `g${preview.hash.slice(1)}`, flip(preview.hash), good]) {
    fails(`hash ${JSON.stringify(hash)}`, () => assertPreviewHashes({ hash }, text, draft));
  }
  // PDF footer wrong: digest missing, altered by one character, truncated, or replaced by the draft hash.
  assert.ok(text.includes(good));
  for (const [label, wrongText] of [
    ['missing', text.replaceAll(footerLine(good), '')],
    ['one character changed', text.replaceAll(good, flip(good))],
    ['truncated', text.replaceAll(good, good.slice(0, 16))],
    ['draft hash printed instead', text.replaceAll(good, preview.hash)],
    ['one page differs', `${text} ${footerLine(flip(good))}`],
  ] as const) {
    assert.notEqual(wrongText, text, label);
    fails(`footer ${label}`, () => assertPreviewHashes(preview, wrongText, draft));
  }
  // Draft mismatch: a different snapshot, different evidence, or no draft at all.
  fails('other snapshot', () => assertPreviewHashes(preview, text, { ...draft, snapshot: { ...draft.snapshot, academicLabel: 'tampered' } }));
  fails('other evidence', () => assertPreviewHashes(preview, text, { ...draft, evidence: [] }));
  fails('no draft', () => assertPreviewHashes(preview, text, null));
  // A real evidence change moves both identifiers, so the old values stop matching the new PDF.
  runSyntheticImport(repo, admin, { ...ids, expectedRevision: 1, rows: [row({ minutes: 300 })] });
  const next = await runSyntheticPreview(repo, student, { ...ids, kind: 'weekly', selectedDate: '2026-11-11' });
  const nextText = await pdfText(next.pdfBase64);
  const nextDraft = repo.loadDraft(ids, next.draftId)!;
  assert.doesNotThrow(() => assertPreviewHashes(next, nextText, nextDraft));
  fails('stale hash against new draft', () => assertPreviewHashes(preview, nextText, nextDraft));
  fails('stale draft against new PDF', () => assertPreviewHashes(preview, nextText, draft));
});

const ledgerDates = (start: string, count: number) => Array.from({ length: count }, (_, i) => {
  const day = new Date(`${start}T12:00:00Z`); day.setUTCDate(day.getUTCDate() + i);
  return day.toISOString().slice(0, 10);
});

test('a ledger spanning more than a year accepts its 367th distinct date and still previews a week', async () => {
  const first = ledgerDates('2025-11-01', 366);
  assert.deepEqual([first[0], first[365], new Set(first).size], ['2025-11-01', '2026-11-01', 366]);
  const saved = runSyntheticImport(repo, admin, { ...ids, expectedRevision: 0, rows: first.map((date, i) => row({ sourceKey: `day-${i}`, date })) });
  assert.deepEqual([saved.revision, saved.appended], [1, 366]);
  const second = runSyntheticImport(repo, admin, { ...ids, expectedRevision: 1, rows: [row({ sourceKey: 'day-366', date: '2026-11-09', minutes: 300 })] });
  assert.deepEqual([second.revision, second.duplicate, second.appended, second.superseded], [2, false, 1, 0]);
  assert.equal(repo.currentRevision(ids), 2);
  assert.equal(new Set(repo.listCurrentEvidence(ids).map(entry => entry.date)).size, 367);
  // Keeps growing past the old limit, including a multi-date batch.
  const third = runSyntheticImport(repo, admin, { ...ids, expectedRevision: 2, rows: ledgerDates('2026-11-10', 40).map((date, i) => row({ sourceKey: `later-${i}`, date })) });
  assert.deepEqual([third.revision, third.appended], [3, 40]);
  assert.equal(new Set(repo.listCurrentEvidence(ids).map(entry => entry.date)).size, 407);
  const latest = await runSyntheticPreview(repo, student, { ...ids, kind: 'weekly', selectedDate: '2026-11-11' });
  const latestText = await pdfText(latest.pdfBase64);
  for (const expected of ['2026-11-09', 'Verified known-hours subtotal: 29.00; coverage 7/7', 'Code counts: P 7 / W 0 / CR 0 / A 0']) assert.ok(latestText.includes(expected), expected);
  assertPreviewHashes(latest, latestText, repo.loadDraft(ids, latest.draftId));
  const old = await runSyntheticPreview(repo, student, { ...ids, kind: 'weekly', selectedDate: '2026-03-04' });
  const oldText = await pdfText(old.pdfBase64);
  for (const expected of ['2026-03-02', '2026-03-08', 'Verified known-hours subtotal: 28.00; coverage 7/7']) assert.ok(oldText.includes(expected), expected);
  assert.equal(old.evidenceRevision, 3);
});

test('one import batch may itself span more than 366 distinct dates', () => {
  const dates = ledgerDates('2024-01-01', 800);
  const saved = runSyntheticImport(repo, admin, { ...ids, expectedRevision: 0, rows: dates.map((date, i) => row({ sourceKey: `multi-year-${i}`, date })) });
  assert.deepEqual([saved.revision, saved.appended], [1, 800]);
  assert.throws(() => runSyntheticImport(repo, admin, { ...ids, expectedRevision: 1, rows: dates.concat(ledgerDates('2026-03-11', 201)).map((date, i) => row({ sourceKey: `too-many-${i}`, date })) }), 'the 1000-row batch limit is unchanged');
  assert.equal(repo.currentRevision(ids), 1);
});

test('whole-ledger conflicts are still rejected once the ledger exceeds 366 dates', () => {
  const dates = ledgerDates('2025-11-01', 400);
  runSyntheticImport(repo, admin, { ...ids, expectedRevision: 0, rows: dates.map((date, i) => row({ sourceKey: `day-${i}`, date })) });
  const before = repo.history(ids);
  assert.equal(before.length, 400);
  const fresh = row({ sourceKey: 'fresh', date: '2027-01-04' });
  for (const [rows, expected] of [
    // Same identity submitted twice with different contents.
    [[fresh, row({ sourceKey: 'fresh', date: '2027-01-04', minutes: 241 })], /CONFLICTING_EVIDENCE_IDENTITY/],
    [[fresh, row({ sourceKey: 'day-0', date: dates[0], minutes: 100 }), row({ sourceKey: 'day-0', date: dates[399], minutes: 100 })], /CONFLICTING_EVIDENCE_IDENTITY/],
    // A second daily total, under a new identity, on the oldest and on the newest ledger date.
    [[fresh, row({ sourceKey: 'second-total-old', date: dates[0], minutes: 100 })], /AMBIGUOUS_DAILY_TOTAL/],
    [[fresh, row({ sourceKey: 'second-total-new', date: dates[399], minutes: 100 })], /AMBIGUOUS_DAILY_TOTAL/],
    // An existing identity moved onto a date that already has a total.
    [[fresh, row({ sourceKey: 'day-0', date: dates[399] })], /AMBIGUOUS_DAILY_TOTAL/],
    // Absence recorded against a date that already has attendance.
    [[fresh, row({ sourceKey: 'absent-old', date: dates[0], kind: 'A', minutes: undefined })], /CONFLICTING_ABSENCE/],
    [[fresh, row({ sourceKey: 'absent-new', date: dates[399], kind: 'A', minutes: undefined })], /CONFLICTING_ABSENCE/],
  ] as const) {
    assert.throws(() => runSyntheticImport(repo, admin, { ...ids, expectedRevision: 1, rows: [...rows] }), expected);
    assert.equal(repo.currentRevision(ids), 1);
  }
  assert.deepEqual(repo.history(ids), before, 'rejected batches wrote nothing, including their valid rows');
  assert.equal(runSyntheticImport(repo, admin, { ...ids, expectedRevision: 1, rows: [fresh] }).revision, 2);
});

test('profile, enrollment and start month come from the adapter, never the request', async () => {
  for (const extra of [{ profile: { name: 'Forged' } }, { enrollment: { program: 'Forged' } }, { actor: student }, { scope: ids }, { draft: {} }, { startMonth: 1 }, { permissions: ['attendance:admin'] }]) {
    await assert.rejects(runSyntheticPreview(repo, student, { ...ids, kind: 'weekly', selectedDate: '2026-11-09', ...extra }));
  }
  const text = await pdfText((await runSyntheticPreview(repo, student, { ...ids, kind: 'yearly', selectedDate: '2026-11-09' })).pdfBase64);
  assert.ok(text.includes('2026-08-01'), 'yearly period uses the trusted enrollment start month 8');
});

test('verifier cannot be spoofed and poisoned fields are rejected', () => {
  assert.throws(() => runSyntheticImport(repo, admin, { ...ids, expectedRevision: 0, rows: [row({ verifiedBy: 'someone-else' })] }));
  const ownProto = JSON.parse('{"__proto__":{"polluted":true}}') as Record<string, unknown>;
  assert.ok(Object.prototype.hasOwnProperty.call(ownProto, "__proto__"));
  for (const poisoned of [ownProto, { constructor: "x" }, { extra: 1 }, { minutes: '240' }, { minutes: 1.5 }, { date: '2026-02-30' }, { date: '0000-01-01' }, { kind: 'estimated' }, { sourceKey: ' ' }, { reason: 'x'.repeat(1001) }]) {
    assert.throws(() => runSyntheticImport(repo, admin, { ...ids, expectedRevision: 0, rows: [Object.defineProperties(row(), Object.getOwnPropertyDescriptors(poisoned))] }), () => true, JSON.stringify(poisoned) + Object.keys(poisoned).join());
  }
  assert.equal(repo.currentRevision(ids), 0);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  runSyntheticImport(repo, admin, { ...ids, expectedRevision: 0, rows: [row()] });
  assert.equal(repo.history(ids)[0].evidence.verifiedBy, fixtures.SYNTHETIC_ADMIN);
});

test('whole-batch rollback: one bad or conflicting row leaves nothing written', () => {
  const before = repo.history(ids);
  for (const rows of [[row(), row({ sourceKey: 'bad', date: '2026-13-01' })], [row(), row({ sourceKey: 'a2', minutes: 100 })], [row(), row({ sourceKey: 'abs', kind: 'A', minutes: undefined })]]) {
    assert.throws(() => runSyntheticImport(repo, admin, { ...ids, expectedRevision: 0, rows }));
  }
  assert.deepEqual(repo.history(ids), before); assert.equal(repo.currentRevision(ids), 0);
  runSyntheticImport(repo, admin, { ...ids, expectedRevision: 0, rows: [row()] });
  assert.throws(() => runSyntheticImport(repo, admin, { ...ids, expectedRevision: 1, rows: [row({ sourceKey: 'second-total', minutes: 100 })] }), /AMBIGUOUS_DAILY_TOTAL/);
  assert.equal(repo.currentRevision(ids), 1); assert.equal(repo.history(ids).length, 1);
});

test('duplicate import is idempotent; evidence update supersedes and keeps history; stale revision rejected', () => {
  assert.equal(runSyntheticImport(repo, admin, { ...ids, expectedRevision: 0, rows: [row()] }).appended, 1);
  const again = runSyntheticImport(repo, admin, { ...ids, expectedRevision: 1, rows: [row(), row()] });
  assert.deepEqual([again.duplicate, again.appended, again.revision], [true, 0, 1]);
  const updated = runSyntheticImport(repo, admin, { ...ids, expectedRevision: 1, rows: [row({ minutes: 300 })] });
  assert.deepEqual([updated.duplicate, updated.appended, updated.superseded, updated.revision], [false, 1, 1, 2]);
  assert.deepEqual(repo.history(ids).map(entry => [entry.evidence.minutes, entry.supersedes]), [[240, null], [300, 1]]);
  assert.deepEqual(repo.listCurrentEvidence(ids).map(entry => entry.minutes), [300]);
  assert.throws(() => runSyntheticImport(repo, admin, { ...ids, expectedRevision: 1, rows: [row({ minutes: 60 })] }), /STALE_REVISION/);
  assert.equal(repo.history(ids).length, 2);
});

test('an evidence update changes the frozen draft identity', async () => {
  runSyntheticImport(repo, admin, { ...ids, expectedRevision: 0, rows: [row()] });
  const first = await runSyntheticPreview(repo, student, { ...ids, kind: 'weekly', selectedDate: '2026-11-09' });
  runSyntheticImport(repo, admin, { ...ids, expectedRevision: 1, rows: [row({ minutes: 300 })] });
  const second = await runSyntheticPreview(repo, student, { ...ids, kind: 'weekly', selectedDate: '2026-11-09' });
  assert.notEqual(first.hash, second.hash); assert.notEqual(first.draftId, second.draftId);
  assert.equal(repo.loadDraft(ids, first.draftId)?.hash, first.hash);
});

test('cross-tenant, cross-member and cross-enrollment access is isolated', async () => {
  runSyntheticImport(repo, admin, { ...ids, expectedRevision: 0, rows: [row()] });
  const crossOrg = { ...ids, organizationId: otherOrg };
  const wrongMember = { ...ids, memberId: fixtures.SYNTHETIC_OTHER_MEMBER };
  const wrongEnrollment = { ...ids, enrollmentId: fixtures.SYNTHETIC_OTHER_MEMBER_ENROLLMENT };
  for (const scope of [crossOrg, wrongMember, wrongEnrollment]) {
    assert.equal(repo.getTrustedEnrollment(scope), null);
    assert.deepEqual(repo.listCurrentEvidence(scope), []);
    assert.equal(repo.loadDraft(scope, 'x'), null);
    await assert.rejects(runSyntheticPreview(repo, student, { ...scope, kind: 'weekly', selectedDate: '2026-11-09' }));
    assert.throws(() => runSyntheticImport(repo, admin, { ...scope, expectedRevision: 0, rows: [row()] }));
  }
  const other = { organizationId: org, memberId: fixtures.SYNTHETIC_OTHER_MEMBER, enrollmentId: fixtures.SYNTHETIC_OTHER_MEMBER_ENROLLMENT };
  await assert.rejects(runSyntheticPreview(repo, student, { ...other, kind: 'weekly', selectedDate: '2026-11-09' }), /FORBIDDEN/);
  await assert.rejects(runSyntheticPreview(syntheticActor('other-org-admin') && repo, syntheticActor('other-org-admin'), { ...ids, kind: 'weekly', selectedDate: '2026-11-09' }), /FORBIDDEN/);
  assert.throws(() => runSyntheticImport(repo, syntheticActor('other-org-admin'), { ...ids, expectedRevision: 1, rows: [row({ sourceKey: 'z', date: '2026-11-10' })] }), /FORBIDDEN/);
  assert.throws(() => runSyntheticImport(repo, student, { ...ids, expectedRevision: 1, rows: [row({ sourceKey: 'z', date: '2026-11-10' })] }), /FORBIDDEN/);
  assert.equal(repo.listCurrentEvidence(other).length, 0);
});

test('inactive enrollment can be neither read nor written, even by an admin', async () => {
  const inactive = { ...ids, enrollmentId: fixtures.SYNTHETIC_INACTIVE_ENROLLMENT };
  assert.throws(() => runSyntheticImport(repo, admin, { ...inactive, expectedRevision: 0, rows: [row()] }), /ENROLLMENT_INACTIVE/);
  await assert.rejects(runSyntheticPreview(repo, student, { ...inactive, kind: 'weekly', selectedDate: '2026-11-09' }), /ENROLLMENT_INACTIVE/);
  assert.deepEqual(repo.history(inactive), []);
});

test('caller mutation of returned data cannot alter stored evidence or enrollment', () => {
  runSyntheticImport(repo, admin, { ...ids, expectedRevision: 0, rows: [row()] });
  repo.listCurrentEvidence(ids)[0].minutes = 1; repo.history(ids)[0].evidence.minutes = 1;
  const trusted = repo.getTrustedEnrollment(ids)!; trusted.profile.name = 'Changed'; trusted.active = false;
  assert.equal(repo.listCurrentEvidence(ids)[0].minutes, 240);
  assert.equal(repo.getTrustedEnrollment(ids)?.profile.name, 'Synthetic Student');
  assert.equal(repo.getTrustedEnrollment(ids)?.active, true);
});

test('cumulative estimates and point events cannot become daily actual hours through entry', async () => {
  assert.throws(() => runSyntheticImport(repo, admin, { ...ids, expectedRevision: 0, rows: [row({ kind: 'estimated' })] }));
  const text = await pdfText((await runSyntheticPreview(repo, student, { ...ids, kind: 'weekly', selectedDate: '2026-11-09' })).pdfBase64);
  assert.ok(text.includes('Verified known-hours subtotal: 0.00; coverage 0/7'));
});

// ---- Actual HTTP-shaped boundary ----
const enableDemo = () => { process.env.ATTENDANCE_SYNTHETIC_DEMO = 'local'; };
const post = (body: unknown, role?: Parameters<typeof handleSyntheticAttendance>[2]) => handleSyntheticAttendance('POST', JSON.stringify(body), role);
beforeEach(() => { enableDemo(); delete process.env.VERCEL_ENV; resetSyntheticAttendanceRepo(); });

test('HTTP: disabled unless local demo flag is set, and in production-like environments', async () => {
  delete process.env.ATTENDANCE_SYNTHETIC_DEMO;
  assert.equal((await post({ action: 'preview', ...ids, kind: 'weekly', selectedDate: '2026-11-09' })).status, 404);
  enableDemo(); process.env.VERCEL_ENV = 'production';
  assert.equal((await post({ action: 'preview', ...ids, kind: 'weekly', selectedDate: '2026-11-09' })).status, 404);
  assert.equal(syntheticDemoEnabled({ ATTENDANCE_SYNTHETIC_DEMO: 'local', NODE_ENV: 'production' } as unknown as NodeJS.ProcessEnv), false);
  assert.equal(syntheticDemoEnabled({ ATTENDANCE_SYNTHETIC_DEMO: '1' } as unknown as NodeJS.ProcessEnv), false);
  delete process.env.VERCEL_ENV;
});

test('HTTP: import then preview works; every response is labeled non-durable', async () => {
  const saved = await post({ action: 'import', ...ids, expectedRevision: 0, rows: [row()] });
  assert.equal(saved.status, 200); assert.equal(saved.body.durable, false); assert.match(String(saved.body.label), /LOCAL SYNTHETIC/);
  const preview = await post({ action: 'preview', ...ids, kind: 'weekly', selectedDate: '2026-11-09' });
  assert.equal(preview.status, 200);
  assert.match(await pdfText(String(preview.body.pdfBase64)), /Verified known-hours subtotal: 4\.00/);
});

test('HTTP: client-supplied actor, scope, draft, role and permissions are rejected, not honored', async () => {
  for (const extra of [{ actor: admin }, { scope: ids }, { draft: {} }, { role: 'admin' }, { permissions: ['attendance:admin'] }, { userId: fixtures.SYNTHETIC_ADMIN }, { verifiedBy: fixtures.SYNTHETIC_ADMIN }]) {
    assert.equal((await post({ action: 'preview', ...ids, kind: 'weekly', selectedDate: '2026-11-09', ...extra })).status, 400, JSON.stringify(Object.keys(extra)));
    assert.equal((await post({ action: 'import', ...ids, expectedRevision: 0, rows: [row()], ...extra })).status, 400);
  }
});

test('HTTP: error mapping — forbidden, not found, inactive, stale, validation, malformed, method, size', async () => {
  assert.equal((await post({ action: 'import', ...ids, expectedRevision: 0, rows: [row()] }, 'student')).status, 403);
  assert.equal((await post({ action: 'import', ...ids, expectedRevision: 0, rows: [row()] }, 'other-org-admin')).status, 403);
  assert.equal((await post({ action: 'preview', ...ids, kind: 'weekly', selectedDate: '2026-11-09' }, 'other-student')).status, 403);
  assert.equal((await post({ action: 'preview', ...ids, enrollmentId: '00000000-0000-4000-8000-0000000000ff', kind: 'weekly', selectedDate: '2026-11-09' })).status, 404);
  assert.equal((await post({ action: 'preview', ...ids, enrollmentId: fixtures.SYNTHETIC_INACTIVE_ENROLLMENT, kind: 'weekly', selectedDate: '2026-11-09' })).status, 409);
  assert.equal((await post({ action: 'import', ...ids, expectedRevision: 5, rows: [row()] })).status, 409);
  assert.equal((await post({ action: 'import', ...ids, expectedRevision: 0, rows: [row({ date: '2026-02-30' })] })).status, 422);
  assert.equal((await post({ action: 'nope' })).status, 400);
  assert.equal((await handleSyntheticAttendance('POST', '{not json')).status, 400);
  assert.equal((await handleSyntheticAttendance('GET', '')).status, 405);
  assert.equal((await handleSyntheticAttendance('POST', 'x'.repeat(2_000_001))).status, 413);
  assert.equal((await post({ action: 'import', ...ids, expectedRevision: 0, rows: [row()] })).status, 200);
  assert.equal((await post({ action: 'import', ...ids, expectedRevision: 0, rows: [row({ sourceKey: 'late', date: '2026-11-10' })] })).status, 409, 'stale after a commit');
});

test('HTTP: finalize, attest, request-signature, sign and archived download all answer 503 and change nothing', async () => {
  await post({ action: 'import', ...ids, expectedRevision: 0, rows: [row()] });
  for (const action of ['finalize', 'student-attest', 'request-signature', 'sign', 'download-archive']) {
    for (const role of ['admin', 'student', 'instructor'] as const) {
      const result = await post({ action, ...ids, archiveVerified: true, consent: true, force: true }, role);
      assert.equal(result.status, 503, `${action}/${role}`); assert.equal(result.body.error, 'ATTENDANCE_VERIFIED_ARCHIVE_UNAVAILABLE');
    }
  }
  assert.equal((await post({ action: 'import', ...ids, expectedRevision: 1, rows: [row()] })).body.duplicate, true);
});

test('synthetic modules are not reachable from any production route', async () => {
  const { execFileSync } = await import('node:child_process');
  const hits = execFileSync('git', ['grep', '--untracked', '-l', '-E', "attendance/synthetic-(http|repository|fixtures|flow)", '--', 'app', 'lib', 'components', 'middleware.ts'], { encoding: 'utf8', cwd: process.cwd() }).split('\n').filter(Boolean).sort();
  assert.deepEqual(hits.filter(file => !file.startsWith('lib/attendance/synthetic-') && !file.endsWith('synthetic-flow.test.ts')), ['app/api/dev/attendance-synthetic/route.ts', 'app/dev/attendance-synthetic/page.tsx']);
});
