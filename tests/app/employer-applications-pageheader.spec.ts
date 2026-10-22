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

describe('employer applications EmployerPageOpener contract', () => {
  it('renders the applicants view under one workspace h1 with native view links', () => {
    const html = renderToStaticMarkup(createElement(EmployerCandidatesHeader, {
      activeView: 'applicants', kicker: 'Employer portal', title: 'Applicants',
      copy: { title: 'Candidates', description: 'Review candidates', navLabel: 'Candidate views', views: { applicants: 'Applicants', matches: 'Matches', pipeline: 'Pipeline' } },
    }));
    const document = new DOMParser().parseFromString(html, 'text/html');
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(document.querySelector('h1')?.textContent).toBe('Candidates');
    expect(document.querySelector('h2')?.textContent).toBe('Applicants');
    expect(document.querySelector('nav a[aria-current="page"]')?.textContent).toBe('Applicants');
    expect(document.querySelectorAll('nav a')).toHaveLength(3);
  });

  it('detail page uses EmployerPageOpener instead of a raw h1', () => {
    const source = read('app/(portal)/employer/applications/[id]/page.tsx');
    expect(source.match(/<EmployerPageOpener[\s>]/g)?.length ?? 0).toBe(1);
    expect(source).not.toMatch(/<h1[\s>]/);
    expect(source).toContain('backToApplicants');
    expect(source).toContain('applyingForJob');
  });
});
