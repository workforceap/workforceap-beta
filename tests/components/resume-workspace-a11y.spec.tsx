import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';

vi.mock('@/lib/analytics/events', () => ({
  trackFunnelEvent: vi.fn(),
  trackToolLaunch: vi.fn(),
  trackAIToolRun: vi.fn(),
}));
import ResumeClient from '@/app/(portal)/dashboard/resume/ResumeClient';
import ResumeRewriterForm from '@/components/portal/tools/ResumeRewriterForm';
import ResumeStrengthForm from '@/components/portal/tools/ResumeStrengthForm';
import ResumeScoreBreakdown, { type ResumeScorePayload } from '@/components/portal/tools/ResumeScoreBreakdown';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const WIT = { name: 'Jordan Reyes', email: 'jordan@example.test', phone: '', recentEmployer: '', targetJob: '', skills: '' };
const REVISED = 'JORDAN REYES\nAustin, TX\n\nSUMMARY\nIT support graduate.\n\nEXPERIENCE\n- Triaged VPN tickets';

const withIntl = (node: React.ReactNode) => (
  <NextIntlClientProvider locale="en" messages={en}>{node}</NextIntlClientProvider>
);

const PAYLOAD: ResumeScorePayload = {
  composite: 72,
  pillars: { structural: { score: 74, label: 'Structure & ATS basics' } },
  structural: {
    composite: 74,
    breakdown: {
      structure: { score: 80, weight: 0.25, notes: [] },
      quantification: { score: 62, weight: 0.25, notes: [] },
      actionVerbs: { score: 45, weight: 0.2, notes: [] },
      bulletLength: { score: 74, weight: 0.15, notes: [] },
      contact: { score: 79, weight: 0.15, notes: [] },
    },
  },
  occupations: [{ onetCode: '15-1232.00', title: 'Computer User Support Specialists', confidence: 0.81 }],
  onetCoverage: [{ onetCode: '15-1232.00', title: 'Computer User Support Specialists', coverageScore: 68, topGaps: [] }],
  marketCoverage: [{
    postingCount: 42,
    source: 'cache',
    coverageScore: 71,
    mustHaveMissing: [{ phrase: 'on-call', frequency: 0.78 }],
    mustHavePresent: [{ phrase: 'AWS', frequency: 0.84 }],
  }],
};

describe('Resume file cards', () => {
  it('names each download by its file, keeps the arrow out of the name, and wraps the header row', () => {
    render(withIntl(
      <ResumeClient
        completeness={75}
        witData={WIT}
        hasOriginal
        hasEnhanced
        layout="side-by-side"
        previewData={{ originalText: 'Original text', enhancedText: REVISED }}
      />,
    ));
    const original = screen.getByRole('link', { name: 'Download original resume' });
    const updated = screen.getByRole('link', { name: 'Download updated resume' });
    expect(original).toHaveAttribute('href', expect.stringContaining('Original%20text'));
    expect(updated).toHaveAttribute('download', 'sample-revised-resume.txt');
    expect(original.querySelector('[aria-hidden="true"]')).toHaveTextContent('↗');
    // 'AI-built' and 'Download' stay on one line; the row wraps instead of breaking inside them.
    const header = updated.parentElement as HTMLElement;
    expect(header.style.flexWrap).toBe('wrap');
    expect(updated.style.whiteSpace).toBe('nowrap');
    expect(screen.getByText('Updated Resume').style.whiteSpace).toBe('nowrap');
  });

  it('announces the new tab for a signed-in (non-fixture) download link', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        originalUrl: 'https://files.example.test/original.docx?sig=1',
        enhancedUrl: null,
        enhancedText: null,
        hasOriginal: true,
        hasEnhanced: false,
        originalExt: 'docx',
      }),
    }));
    render(withIntl(<ResumeClient completeness={75} witData={WIT} hasOriginal hasEnhanced={false} layout="side-by-side" />));
    expect(await screen.findByRole('link', { name: 'Download original resume (opens in a new tab)' })).toHaveAttribute('target', '_blank');
  });

  it('keeps the revised plain-text file line structure in a keyboard-scrollable labelled region', () => {
    render(withIntl(
      <ResumeClient
        completeness={75}
        witData={WIT}
        hasOriginal
        hasEnhanced
        layout="side-by-side"
        previewData={{ originalText: 'Original text', enhancedText: REVISED }}
      />,
    ));
    const region = screen.getByRole('region', { name: 'Updated resume text' });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(region.textContent).toBe(REVISED);
    expect(region.style.whiteSpace).toBe('pre-wrap');
    // An inline box-shadow would replace the site-wide [tabindex]:focus-visible ring.
    expect(region.style.boxShadow).toBe('');
  });
});

describe('Resume rewrite and score output controls', () => {
  it('tells the Copy and PDF buttons apart and makes the scrolling output focusable', () => {
    render(withIntl(<ResumeRewriterForm preview previewOutput={'Line one\nLine two'} />));
    expect(screen.getByRole('button', { name: 'Copy rewritten resume' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download PDF of rewritten resume' })).toBeInTheDocument();
    const output = screen.getByRole('region', { name: 'Rewritten resume text' });
    expect(output).toHaveAttribute('tabindex', '0');
    expect(output.tagName).toBe('PRE');
    expect(output.style.boxShadow).toBe('');
  });

  it('titles a strength score "Resume analysis", not a job match, with labelled focusable regions', () => {
    render(withIntl(<ResumeStrengthForm preview initialResume="My resume text" previewOutput="OVERALL SCORE: 72%" previewPayload={PAYLOAD} />));
    expect(screen.getByRole('heading', { level: 3, name: 'Resume analysis' })).toBeInTheDocument();
    expect(screen.queryByText('Match analysis')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy resume analysis' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download PDF of resume analysis' })).toBeInTheDocument();

    const preview = screen.getByRole('region', { name: 'Your resume text' });
    const results = screen.getByRole('region', { name: 'Resume analysis text' });
    for (const region of [preview, results]) {
      expect(region).toHaveAttribute('tabindex', '0');
      expect(region.style.boxShadow).toBe('');
    }
  });
});

describe('Resume score text contrast', () => {
  it('paints small score numbers and keyword text with the text-safe tokens, bars with the fill tokens', () => {
    const { container } = render(<ResumeScoreBreakdown payload={PAYLOAD} />);
    const colorOf = (el: HTMLElement) => el.getAttribute('style') ?? '';
    // Sub-scores: 80 -> success, 62 -> gold, 45 -> danger.
    expect(colorOf(screen.getByText('80'))).toContain('color: var(--wa-success-dark)');
    expect(colorOf(screen.getByText('62'))).toContain('color: var(--wa-gold-dark)');
    expect(colorOf(screen.getByText('45'))).toContain('color: var(--wa-danger-text)');
    // Coverage figure under the occupation bar.
    expect(colorOf(screen.getByText('68'))).toContain('color: var(--wa-gold-dark)');
    // Keyword headings and chips.
    expect(colorOf(screen.getByText('On the resume'))).toContain('color: var(--wa-success-dark)');
    expect(colorOf(screen.getByText('AWS'))).toContain('color: var(--wa-success-dark)');
    expect(colorOf(screen.getByText(/^Missing/))).toContain('color: var(--wa-danger-text)');
    expect(colorOf(screen.getByText(/^on-call/))).toContain('color: var(--wa-danger-text)');
    // Bars keep the fill hues, which only have to reach 3:1 as graphics.
    const fills = Array.from(container.querySelectorAll('.wa-kit-bar-fill')).map(el => el.getAttribute('style') ?? '');
    expect(fills.some(style => style.includes('var(--wa-success)'))).toBe(true);
    expect(fills.some(style => style.includes('var(--wa-gold)'))).toBe(true);
    expect(fills.some(style => style.includes('var(--wa-danger)'))).toBe(true);
    // No small text is left on a bare fill hue.
    const textOnFill = Array.from(container.querySelectorAll<HTMLElement>('[style*="color: var(--wa-success)"], [style*="color: var(--wa-gold)"], [style*="color: var(--wa-danger)"]'))
      .filter(el => /color: var\(--wa-(success|gold|danger)\)/.test(el.getAttribute('style') ?? ''));
    expect(textOnFill).toHaveLength(0);
  });
});
