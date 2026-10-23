import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import EmployerCandidatesHeader from '@/components/employer/EmployerCandidatesHeader';

const root = process.cwd();

function read(rel: string) {
  return readFileSync(join(root, rel), 'utf8');
}

describe('employer remaining EmployerPageOpener contract', () => {
  it('renders the matches view under one workspace h1 with native view links', () => {
    const html = renderToStaticMarkup(createElement(EmployerCandidatesHeader, {
      activeView: 'matches', kicker: 'Employer portal', title: 'Matches',
      copy: { title: 'Candidates', description: 'Review candidates', navLabel: 'Candidate views', views: { applicants: 'Applicants', matches: 'Matches', pipeline: 'Pipeline' } },
    }));
    const document = new DOMParser().parseFromString(html, 'text/html');
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(document.querySelector('h1')?.textContent).toBe('Candidates');
    expect(document.querySelector('h2')?.textContent).toBe('Matches');
    expect(document.querySelector('nav a[aria-current="page"]')?.textContent).toBe('Matches');
    expect(document.querySelectorAll('nav a')).toHaveLength(3);
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
