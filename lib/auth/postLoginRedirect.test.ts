import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePostLoginRedirect, resolveRoleAwarePostLoginRedirect } from './postLoginRedirect';

test('normalizePostLoginRedirect keeps safe portal destinations', () => {
  assert.equal(normalizePostLoginRedirect('/dashboard'), '/dashboard');
  assert.equal(normalizePostLoginRedirect('/admin/jobs?filter=pending'), '/admin/jobs?filter=pending');
});

test('normalizePostLoginRedirect falls back when redirect target is /login', () => {
  assert.equal(normalizePostLoginRedirect('/login'), '/dashboard');
  assert.equal(normalizePostLoginRedirect('/login?redirectTo=%2Fpartner'), '/dashboard');
  assert.equal(normalizePostLoginRedirect('/login#member'), '/dashboard');
  assert.equal(normalizePostLoginRedirect('/es/login?redirectTo=%2Fpartner'), '/es/dashboard');
});

test('normalizePostLoginRedirect does not double-prefix an already-localized fallback', () => {
  // Caller may pass a fallback that already carries the locale prefix; we
  // should strip it before re-prefixing with the locale from `raw`.
  assert.equal(normalizePostLoginRedirect('/es/login', '/es/dashboard'), '/es/dashboard');
  assert.equal(normalizePostLoginRedirect('/es/login?redirectTo=%2Fes%2Flogin', '/es/dashboard'), '/es/dashboard');
  assert.equal(normalizePostLoginRedirect('/en/login', '/es/dashboard'), '/en/dashboard');
});

test('normalizePostLoginRedirect still blocks malformed redirects', () => {
  assert.equal(normalizePostLoginRedirect('https://evil.com', '/dashboard'), '/dashboard');
  assert.equal(normalizePostLoginRedirect('/\\evil.com', '/dashboard'), '/dashboard');
});

test('resolveRoleAwarePostLoginRedirect sends counselors to /counselor when destination is member home', () => {
  assert.equal(resolveRoleAwarePostLoginRedirect('/dashboard', 'counselor'), '/counselor');
  assert.equal(resolveRoleAwarePostLoginRedirect('/dashboard?x=1', 'counselor'), '/counselor');
  assert.equal(resolveRoleAwarePostLoginRedirect('/es/dashboard', 'counselor'), '/es/counselor');
});

test('resolveRoleAwarePostLoginRedirect leaves /counselor and nested /dashboard paths unchanged', () => {
  assert.equal(resolveRoleAwarePostLoginRedirect('/counselor', 'counselor'), '/counselor');
  assert.equal(resolveRoleAwarePostLoginRedirect('/dashboard/messages', 'counselor'), '/dashboard/messages');
  assert.equal(resolveRoleAwarePostLoginRedirect('/employer', 'counselor'), '/employer');
});

test('resolveRoleAwarePostLoginRedirect keeps member and employer on /dashboard', () => {
  assert.equal(resolveRoleAwarePostLoginRedirect('/dashboard', 'member'), '/dashboard');
  assert.equal(resolveRoleAwarePostLoginRedirect('/dashboard', 'employer'), '/dashboard');
  assert.equal(resolveRoleAwarePostLoginRedirect('/dashboard', undefined), '/dashboard');
});

test('resolveRoleAwarePostLoginRedirect keeps super_admin on /admin', () => {
  assert.equal(resolveRoleAwarePostLoginRedirect('/dashboard', 'super_admin'), '/admin');
  assert.equal(resolveRoleAwarePostLoginRedirect('/employer', 'super_admin'), '/admin');
  assert.equal(resolveRoleAwarePostLoginRedirect('/es/dashboard', 'super_admin'), '/es/admin');
  assert.equal(resolveRoleAwarePostLoginRedirect('/administrator', 'super_admin'), '/admin');
});

test('resolveRoleAwarePostLoginRedirect keeps a super_admin /admin deep link, query and locale included (WAP-190)', () => {
  // The weekly applicant-aging digest links the Applications queue; sign-in must not flatten it to /admin.
  assert.equal(
    resolveRoleAwarePostLoginRedirect('/admin/command-center?queue=applications', 'super_admin'),
    '/admin/command-center?queue=applications',
  );
  assert.equal(resolveRoleAwarePostLoginRedirect('/admin/members/m-1?tab=eligibility', 'super_admin'), '/admin/members/m-1?tab=eligibility');
  assert.equal(resolveRoleAwarePostLoginRedirect('/es/admin/wioa-screening', 'super_admin'), '/es/admin/wioa-screening');
  assert.equal(resolveRoleAwarePostLoginRedirect('/admin', 'super_admin'), '/admin');
});

test('resolveRoleAwarePostLoginRedirect keeps an admin deep link for org admins too', () => {
  assert.equal(
    resolveRoleAwarePostLoginRedirect('/admin/command-center?queue=applications', 'admin'),
    '/admin/command-center?queue=applications',
  );
});

test('resolveRoleAwarePostLoginRedirect sends admins to /admin from member home only', () => {
  assert.equal(resolveRoleAwarePostLoginRedirect('/dashboard', 'admin'), '/admin');
  assert.equal(resolveRoleAwarePostLoginRedirect('/employer', 'admin'), '/employer');
});
