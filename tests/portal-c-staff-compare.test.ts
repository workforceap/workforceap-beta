import { describe, expect, it } from 'vitest';
import {
  resolveStaffMemberDetailPath,
  staffMemberDetailPathFromHrefs,
  staffMemberDetailPathFromHtml,
} from '../scripts/lib/portal-c-staff-compare.mjs';

describe('staff member detail path', () => {
  it('accepts a clean admin member link', () => {
    expect(staffMemberDetailPathFromHrefs('/admin/members', [
      '/admin/members/new',
      '/admin/members/clmemberfixture1',
    ])).toBe('/admin/members/clmemberfixture1');
  });

  it('strips hash and query from counselor message deep-links', () => {
    expect(staffMemberDetailPathFromHrefs('/counselor/students', [
      '/counselor/students/clmemberfixture1#counselor-member-messages',
    ])).toBe('/counselor/students/clmemberfixture1');
  });

  it('reads an authorized memberId from the counselor RSC payload when rows are not links', () => {
    expect(staffMemberDetailPathFromHtml(
      '/counselor/students',
      '<script>self.__next_f.push([1,"{\\"memberId\\":\\"clmemberfixture1\\"}"])</script>',
    )).toBe('/counselor/students/clmemberfixture1');
    expect(staffMemberDetailPathFromHtml(
      '/counselor/students',
      '0:{"memberId":"clmemberfixture1","fullName":"Portal QA Member"}',
    )).toBe('/counselor/students/clmemberfixture1');
  });

  it('prefers a live href over payload text', () => {
    expect(resolveStaffMemberDetailPath(
      '/admin/members',
      ['/admin/members/from-link'],
      '"memberId":"from-html"',
    )).toBe('/admin/members/from-link');
  });

  it('refuses blocked collection routes', () => {
    expect(staffMemberDetailPathFromHrefs('/admin/members', [
      '/admin/members/new',
      '/admin/members/merge',
      '/admin/members/duplicates',
      '/admin/members/training',
    ])).toBeUndefined();
  });

  it('does not treat a foreign-origin link as an authorized roster row', () => {
    expect(staffMemberDetailPathFromHrefs('/admin/members', ['https://outside.invalid/admin/members/foreign'])).toBeUndefined();
    expect(staffMemberDetailPathFromHrefs('/admin/members', ['https://preview.test/admin/members/owned'], 'https://preview.test')).toBe('/admin/members/owned');
    expect(() => staffMemberDetailPathFromHrefs('/untrusted', ['/untrusted/id'])).toThrow('collection');
  });
});
