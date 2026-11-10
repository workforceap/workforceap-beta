import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  attendanceStorageKey,
  isAttendanceStoragePath,
  isCanonicalAttendanceStorageKey,
} from './storageKey';
import { signCertificationProofUrl } from '../certifications/signProofUrl';

const ids = {
  organizationId: '11111111-1111-4111-8111-111111111111',
  memberId: '22222222-2222-4222-8222-222222222222',
  sheetId: '33333333-3333-4333-8333-333333333333',
  revisionId: '44444444-4444-4444-8444-444444444444',
};

test('server writes only lower-case canonical keys', () => {
  const key = attendanceStorageKey(ids);
  assert.equal(key, `attendance/${ids.organizationId}/${ids.memberId}/${ids.sheetId}/${ids.revisionId}.pdf`);
  assert.equal(key, key.toLowerCase());
  assert.equal(isCanonicalAttendanceStorageKey(key), true);
});

test('builder refuses upper-case or malformed ids instead of normalizing', () => {
  assert.throws(() => attendanceStorageKey({ ...ids, organizationId: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA' }));
  assert.throws(() => attendanceStorageKey({ ...ids, memberId: '../x' }));
  assert.throws(() => attendanceStorageKey({ ...ids, sheetId: '' }));
});

test('case variants are not canonical keys, so a browser-written Attendance/ object is never read', () => {
  const key = attendanceStorageKey(ids);
  const variants = [
    `Attendance${key.slice('attendance'.length)}`,
    key.toUpperCase(),
    `${key}.bak`,
    key.replace('.pdf', '.PDF'),
    `/${key}`,
    key.replace('attendance/', 'attendance//'),
  ];
  for (const variant of variants) {
    assert.equal(isCanonicalAttendanceStorageKey(variant), false, variant);
  }
});

test('signing guard refuses every spelling of the attendance namespace', () => {
  const key = attendanceStorageKey(ids);
  const paths = [
    key, 'attendance', 'Attendance/x.pdf', 'ATTENDANCE/x', `/${key}`, `./${key}`,
    `profile-photos/../${key}`, 'a/../attendance/x', 'attendance\\x', '%61ttendance/x',
    '%2561ttendance/x', ' attendance/x', '%E0%A4%A',
  ];
  for (const p of paths) assert.equal(isAttendanceStoragePath(p), true, p);
});

test('signing guard allows normal paths', () => {
  for (const p of ['profile-photos/user-1/photo.webp', 'cert-files/u/c.pdf', 'enrollment-agreements/m/s.pdf', 'attendance-notes/x.pdf', 'x/attendance/y']) {
    assert.equal(isAttendanceStoragePath(p), false, p);
  }
  assert.equal(isAttendanceStoragePath(null), false);
  assert.equal(isAttendanceStoragePath(undefined), false);
});

test('certification proof signer refuses attendance paths and still signs normal ones', async () => {
  const calls: string[] = [];
  const client = {
    storage: {
      from: () => ({
        createSignedUrl: async (path: string) => {
          calls.push(path);
          return { data: { signedUrl: `https://signed.invalid/${path}` } };
        },
      }),
    },
  };
  assert.equal(await signCertificationProofUrl(client, attendanceStorageKey(ids)), undefined);
  assert.equal(await signCertificationProofUrl(client, 'Attendance/x.pdf'), undefined);
  assert.deepEqual(calls, []);
  assert.equal(await signCertificationProofUrl(client, 'cert-files/u/c.pdf'), 'https://signed.invalid/cert-files/u/c.pdf');
  assert.deepEqual(calls, ['cert-files/u/c.pdf']);
});

test('no production code outside storageKey.ts hard-codes an attendance/ storage key', () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (!['node_modules', '.next', '.worktrees'].includes(e.name)) walk(p);
        continue;
      }
      if (!/\.tsx?$/.test(e.name) || /\.test\.tsx?$/.test(e.name) || p.endsWith('storageKey.ts')) continue;
      const src = readFileSync(p, 'utf8');
      if (/['"`]attendance\//i.test(src) && /\.storage\b|createSignedUrl|member-files/.test(src)) offenders.push(p);
    }
  };
  for (const d of ['lib', 'app']) walk(d);
  assert.deepEqual(offenders, []);
});

test('storage migration is transaction-free, fail-closed and targets PUBLIC', () => {
  const sql = readFileSync('prisma/migrations/20261111000000_attendance_server_only_storage/migration.sql', 'utf8')
    .split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
  assert.doesNotMatch(sql, /^\s*(BEGIN|COMMIT)\s*;/im);
  assert.match(sql, /CREATE POLICY attendance_server_only\s+ON storage\.objects AS RESTRICTIVE FOR ALL TO PUBLIC/);
  assert.match(sql, /ON storage\.prefixes AS RESTRICTIVE FOR ALL TO PUBLIC/);
  assert.doesNotMatch(sql, /TO anon/i);
  assert.match(sql, /name <> 'attendance' AND name NOT LIKE 'attendance\/%'/);
  assert.match(sql, /rolname = 'service_role' AND rolbypassrls/);
  assert.match(sql, /SECURITY DEFINER and can bypass the policy/);
  assert.doesNotMatch(sql, /DROP POLICY|CREATE POLICY IF NOT EXISTS|ON CONFLICT/i);
});

test('profile photo signer refuses an attendance path before touching storage', async () => {
  const { getMemberProfilePhotoSignedUrlForPath } = await import('../portal/memberProfilePhotoUrl');
  // No Supabase env is configured here: reaching the client would throw and
  // be logged as a different error. The guard must short-circuit first.
  assert.equal(await getMemberProfilePhotoSignedUrlForPath(attendanceStorageKey(ids)), null);
  assert.equal(await getMemberProfilePhotoSignedUrlForPath('Attendance/x.pdf'), null);
});
