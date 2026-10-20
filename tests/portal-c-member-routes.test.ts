import { describe, expect, it } from 'vitest';
import { DEV_MEMBER_VIEWS } from '../app/dev/member/harness/registry';
import { memberRouteFixturePath, parseMemberRouteFixtures } from '../scripts/lib/portal-c-member-routes.mjs';

const modulePattern = '/dashboard/learning/modules/[courseSlug]';
const modulePath = '/dashboard/learning/modules/digital-literacy-course-1?program=digital-literacy';

describe('authorized member detail paths', () => {
  it('preserves the program query required by the real module route, including localized links', () => {
    expect(memberRouteFixturePath(modulePath, modulePattern)).toBe(modulePath);
    expect(memberRouteFixturePath(`/es${modulePath}`, modulePattern)).toBe(modulePath);
    expect(parseMemberRouteFixtures(JSON.stringify({ 'learning-module': modulePath }), DEV_MEMBER_VIEWS)).toEqual({ 'learning-module': modulePath });
  });
  it.each([
    '/dashboard/learning/modules/digital-literacy-course-1',
    `${modulePath}&program=other`, `${modulePath}&redirectTo=https://outside.invalid`,
    `${modulePath}#ignored`, '//outside.invalid/dashboard/learning/modules/x?program=y',
    '/dashboard/learning/modules/%2e%2e?program=digital-literacy',
    '/dashboard/learning/modules/x?program=../private',
  ])('refuses an incomplete or unsafe module path: %s', path => {
    expect(memberRouteFixturePath(path, modulePattern)).toBeNull();
  });
  it('refuses a static sibling and requires a strict manifest instead of accepting arbitrary destinations', () => {
    expect(memberRouteFixturePath('/dashboard/counselor/settings', '/dashboard/counselor/[id]', ['/dashboard/counselor/settings'])).toBeNull();
    expect(memberRouteFixturePath('/dashboard/counselor/session-1?token=secret', '/dashboard/counselor/[id]')).toBeNull();
    for (const raw of ['[]', 'null', '{"home":"/dashboard"}', '{"mentor-profile":"https://outside.invalid"}']) {
      expect(() => parseMemberRouteFixtures(raw, DEV_MEMBER_VIEWS)).toThrow();
    }
  });
});
