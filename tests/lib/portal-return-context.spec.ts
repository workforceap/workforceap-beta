import { describe, expect, it } from 'vitest';
import { resolvePortalReturnTo, withPortalReturnTo } from '@/lib/nav/returnContext';

describe('portal record return context', () => {
  it('retains the selected view, filters, paging and record panel', () => {
    const origin = '/admin/students?view=manage&program=it-support&search=Ana%20Lee&page=3';
    const href = withPortalReturnTo('/admin/members/member-1?tab=training#progress', origin);
    const url = new URL(href, 'https://example.test');
    expect(url.searchParams.get('tab')).toBe('training');
    expect(url.hash).toBe('#progress');
    expect(url.searchParams.get('returnTo')).toBe(origin);
    expect(resolvePortalReturnTo(url.searchParams.get('returnTo'), '/admin/members')).toBe(origin);
  });

  it('retains an explicit locale without changing the selected workspace', () => {
    const href = withPortalReturnTo('/employer/candidates/person-1', '/es/employer/candidates?view=matches&page=2');
    expect(href).toMatch(/^\/es\/employer\/candidates\/person-1\?/);
    expect(resolvePortalReturnTo('/es/employer/candidates?view=matches&page=2', '/employer/matches'))
      .toBe('/es/employer/candidates?view=matches&page=2');
  });

  it.each([
    'https://evil.example/admin/students', '//evil.example/admin/students', '/\\evil.example/admin/students',
    '/admin/%2f%2fevil.example', '/admin/students\n', '/api/admin/members/export',
    '/partner/referred-members', '/admin/members/person-2', '/login?redirectTo=/admin',
    '/admin/students?x=' + 'a'.repeat(2100),
  ])('rejects an unsafe or unrelated destination: %s', (candidate) => {
    expect(resolvePortalReturnTo(candidate, '/admin/members')).toBe('/admin/members');
  });

  it('avoids nested return chains and permits a job-specific applicant list', () => {
    const href = withPortalReturnTo('/employer/applications/app-1', '/employer/jobs/job-1/applicants?page=2&returnTo=%2Femployer%2Fjobs');
    expect(new URL(href, 'https://example.test').searchParams.get('returnTo'))
      .toBe('/employer/jobs/job-1/applicants?page=2');
  });

  it('does not attach cross-portal context or change ordinary links', () => {
    expect(withPortalReturnTo('/partner/members/member-1', '/admin/students')).toBe('/partner/members/member-1');
    expect(withPortalReturnTo('https://example.test', '/admin/students')).toBe('https://example.test');
  });
});
