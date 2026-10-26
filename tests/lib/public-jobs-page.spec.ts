// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { gucContextStorage, type GucContext } from '@/lib/db/gucContext';
import { JOBS_PAGE_SIZE, jobBoardCacheScope, jobPageBounds, positiveJobPage } from '@/lib/jobs/publicJobsPage';

describe('positiveJobPage', () => {
  it('accepts a positive decimal page and otherwise returns the fallback', () => {
    expect(positiveJobPage('1')).toBe(1);
    expect(positiveJobPage('3', 20)).toBe(3);
    expect(positiveJobPage('20', JOBS_PAGE_SIZE)).toBe(20);
  });

  it.each([
    ['missing', null],
    ['empty', ''],
    ['words', 'page'],
    ['zero', '0'],
    ['negative', '-2'],
    ['decimal', '1.5'],
    ['scientific', '1e2'],
    ['leading plus', '+1'],
    ['whitespace', ' 2'],
  ])('does not let %s reach skip math (%j)', (_label, value) => {
    expect(positiveJobPage(value, 7)).toBe(7);
    expect(positiveJobPage(value)).toBe(1);
  });

  it('rejects integers the JSON number space cannot represent exactly', () => {
    expect(positiveJobPage(String(Number.MAX_SAFE_INTEGER + 1))).toBe(1);
  });
});

describe('jobPageBounds', () => {
  it('pages from a 1-based offset after fixtures have already been excluded', () => {
    expect(jobPageBounds(45, 1, 20)).toEqual({ page: 1, totalPages: 3, skip: 0 });
    expect(jobPageBounds(45, 3, 20)).toEqual({ page: 3, totalPages: 3, skip: 40 });
    expect(jobPageBounds(20, 1, 20)).toEqual({ page: 1, totalPages: 1, skip: 0 });
  });

  it('clamps a past-end request onto the last page instead of returning skip past the total', () => {
    expect(jobPageBounds(45, 99, 20)).toEqual({ page: 3, totalPages: 3, skip: 40 });
    expect(jobPageBounds(0, 5, 20)).toEqual({ page: 1, totalPages: 0, skip: 0 });
  });
});

describe('jobBoardCacheScope', () => {
  const member: GucContext = {
    userId: 'member-a',
    orgId: 'org-a',
    role: 'member',
    employerId: null,
    partnerId: null,
  };

  it('refuses to cache when the trusted request scope is missing, even if a user id is known', () => {
    expect(jobBoardCacheScope('member-a')).toBeNull();
    expect(jobBoardCacheScope(null)).toBeNull();
  });

  it('binds cached listings to the GUC actor, tenant, and role rather than a caller-supplied id alone', () => {
    const memberKey = gucContextStorage.run(member, () => jobBoardCacheScope('member-a'));
    const otherOrg = gucContextStorage.run({ ...member, orgId: 'org-b' }, () => jobBoardCacheScope('member-a'));
    const otherRole = gucContextStorage.run({ ...member, role: 'admin' }, () => jobBoardCacheScope('member-a'));
    const anonymous = gucContextStorage.run(
      { userId: null, orgId: null, role: 'anonymous' },
      () => jobBoardCacheScope(null),
    );
    expect(memberKey).toContain('org-a');
    expect(memberKey).not.toBe(otherOrg);
    expect(memberKey).not.toBe(otherRole);
    expect(anonymous).not.toBe(memberKey);
    expect(anonymous).toContain('anonymous');
  });
});
