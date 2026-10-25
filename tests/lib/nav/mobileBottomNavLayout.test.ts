import { describe, expect, it } from 'vitest';
import { isMemberWorkspacePath, shouldReserveMobileBottomNavClearance } from '../../../lib/nav/mobileBottomNavLayout';

describe('member workspace path detection', () => {
  it.each([
    '/dashboard',
    '/dashboard/jobs',
    '/dashboard/assessment',
    '/dev/member',
    '/dev/member/home',
  ])('recognizes locale-stripped member path %s', (pathname) => {
    expect(isMemberWorkspacePath(pathname)).toBe(true);
  });

  it.each(['/dashboardx', '/dev/memberly', '/en/dashboard/jobs', '/employer/dashboard', '/en'])(
    'does not classify unrelated path %s as member workspace',
    (pathname) => expect(isMemberWorkspacePath(pathname)).toBe(false),
  );

  it('keeps member routes separate from generic bottom-nav clearance', () => {
    expect(shouldReserveMobileBottomNavClearance('/dashboard/jobs')).toBe(false);
    expect(shouldReserveMobileBottomNavClearance('/dev/member/home')).toBe(true);
  });
});
