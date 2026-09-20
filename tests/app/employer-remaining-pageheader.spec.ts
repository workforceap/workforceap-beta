import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('employer remaining EmployerPageOpener contract', () => {
  it('matches page mounts one EmployerPageOpener (jobs pattern) and no SectionHeader', () => {
    const source = read('app/(portal)/employer/matches/page.tsx');
    expect(source.match(/<EmployerPageOpener[\s>]/g)?.length ?? 0).toBe(1);
    expect(source).toContain('PortalPageFrame');
    expect(source).toContain('matchHistory');
    expect(source).not.toContain('SectionHeader');
    expect(source).not.toMatch(/<h1[\s>]/);
  });

  it('messages page uses EmployerPageOpener on every branch and no SectionHeader', () => {
    const source = read('app/(portal)/employer/messages/page.tsx');
    expect(source).toContain('PortalPageFrame');
    expect(source).toContain('EmployerMessagesHeader');
    expect(source).toContain('<EmployerPageOpener');
    expect(source.match(/<EmployerPageOpener[\s>]/g)?.length ?? 0).toBe(1);
    expect(source).not.toContain('SectionHeader');
    expect(source).not.toMatch(/<h1[\s>]/);
    // Single inbox client — do not reintroduce dual mobile/desktop mounts.
    expect(source.match(/<EmployerMessagesInboxClient[\s>]/g)?.length ?? 0).toBe(1);
  });

  it('work-queue page mounts one EmployerPageOpener without a breadcrumb row (jobs pattern)', () => {
    const source = read('app/(portal)/employer/work-queue/page.tsx');
    expect(source.match(/<EmployerPageOpener[\s>]/g)?.length ?? 0).toBe(1);
    expect(source).toContain('PortalPageFrame');
    expect(source).toContain('employerWorkQueueSubtitle');
    expect(source).not.toContain('SectionHeader');
    expect(source).not.toContain('PortalBreadcrumb');
    expect(source).not.toMatch(/<h1[\s>]/);
  });
});
