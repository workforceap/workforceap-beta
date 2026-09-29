import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { pluralCount } from '@/lib/i18n/pluralCount';
import { formatPortalDate } from '@/lib/formatDate';

const root = path.resolve(__dirname, '..', '..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

describe('admin count agreement (audit 2026-09-20, 4.1/4.2)', () => {
  // The overview tiles, the students roster and the Command Center program
  // health must all count the same roster: member-role profiles only.
  // The roster and training-progress presets of /admin/students share their
  // where-clauses through these loaders (one roster, admin audit §7 item 2).
  const rosterSources = [
    'app/admin/overview/page.tsx',
    'lib/admin/studentsRosterLoad.ts',
    'lib/admin/trainingRosterLoad.ts',
    'lib/admin/commandCenter.ts',
  ];

  it.each(rosterSources)('%s counts members with MEMBER_ONLY_WHERE, never the dogfood filter', (rel) => {
    const src = read(rel);
    expect(src).toMatch(/\.\.\.MEMBER_ONLY_WHERE/);
    expect(src).not.toContain('MEMBER_OR_DOGFOOD_WHERE');
  });

  it('the students route renders only through those loaders and never names the dogfood filter', () => {
    const src = read('app/admin/students/page.tsx');
    expect(src).toContain('loadStudentsRoster(');
    expect(src).toContain('loadTrainingRoster(');
    expect(src).not.toContain('MEMBER_OR_DOGFOOD_WHERE');
  });

  it('counselor admin-preview caseload uses the same member-only filter', () => {
    expect(read('lib/counselor/adminMemberScope.ts')).toMatch(/\.\.\.MEMBER_ONLY_WHERE/);
  });
});

describe('pluralCount', () => {
  it('reads "1 item" and "N items"', () => {
    expect(pluralCount(1, 'item')).toBe('1 item');
    expect(pluralCount(0, 'item')).toBe('0 items');
    expect(pluralCount(12, 'item')).toBe('12 items');
    expect(pluralCount(2, 'opportunity', 'opportunities')).toBe('2 opportunities');
  });

  it('is what the Command Center queue counts render', () => {
    const client = read('components/admin/AdminCommandCenterClient.tsx');
    expect(client).toContain("aria-label={pluralCount(count, 'item')}");
    expect(client).toContain("View all {pluralCount(count, 'item')}</Link>");
    expect(client).not.toMatch(/\$\{count\} items/);
    const home = read('app/admin/page.tsx');
    for (const key of ['needsReplyCount', 'certificationsPendingCount', 'interviewingCount']) {
      expect(home).toContain(`actionLabel: pluralCount(totals.${key}, 'item'),`);
    }
    // Applications count what the "Waiting on your decision" list counts (WAP-190).
    expect(home).toContain(`actionLabel: pluralCount(applicationsWaiting, 'item'),`);
  });
});

describe('hydration-safe dates on admin list pages (audit 2026-09-20, 4.5)', () => {
  // /admin/members, /admin/users?ui=legacy and /admin/coursera/enrollment render
  // dates in client components that also server-render. Default-locale
  // toLocale*() differs between Node and the browser, so every date goes
  // through the fixed-locale portal formatter.
  const clientComponents = [
    'components/admin/MembersTable.tsx',
    'components/admin/AdminUsersManager.tsx',
    'components/admin/CourseraEnrollmentPipelineTable.tsx',
  ];

  it.each(clientComponents)('%s has no default-locale date formatting', (rel) => {
    const src = read(rel);
    // Dates only: number.toLocaleString() on counts is not a date and is left alone.
    expect(src).not.toMatch(/\.toLocaleDateString\(/);
    expect(src).not.toMatch(/\.toLocaleTimeString\(/);
    expect(src).not.toMatch(/\)\.toLocaleString\(/);
    expect(src).toMatch(/from '@\/lib\/formatDate'/);
  });

  it('formatPortalDate is fixed to the portal locale and timezone', () => {
    // 03:00Z on Jan 1 is still Dec 31 in America/Chicago — the string must not
    // depend on the runtime's default timezone or locale.
    expect(formatPortalDate('2026-01-01T03:00:00Z')).toBe('Dec 31, 2025');
    expect(formatPortalDate(new Date('2026-06-15T12:00:00Z'))).toBe('Jun 15, 2026');
  });
});
