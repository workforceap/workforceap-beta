import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import en from '@/messages/en.json';
import SkillMapperClient from '@/components/portal/tools/SkillMapperClient';
import type { SavedSkillMapperRun } from '@/lib/member/skillMapperRun';

vi.mock('@/lib/analytics/events', () => ({ trackFunnelEvent: vi.fn() }));
vi.mock('@/components/portal/tools/ToolFollowThrough', () => ({ default: () => null }));
const axes = ['Analytics', 'Engineering', 'Design', 'Strategy', 'Service', 'Research'];
const saved: SavedSkillMapperRun = { id: 'owned-selected', occupationTitle: 'Computer User Support Specialists', occupationCode: '15-1232.00', skills: [{ name: 'Troubleshooting', score: 86 }], radarAxes: axes.map((axis, i) => ({ axis, value: 80 - i * 5 })), createdAt: '2026-10-21T12:00:00Z', demo: false };
const fetcher = vi.fn<typeof fetch>();
const show = (props: Parameters<typeof SkillMapperClient>[0]) => render(<NextIntlClientProvider locale="en" messages={en}><SkillMapperClient {...props} /></NextIntlClientProvider>);
beforeEach(() => {
  fetcher.mockReset(); vi.stubGlobal('fetch', fetcher);
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('actual Skill Mapper saved workspace', () => {
  it('uses the same graphs in a synthetic proof without account, provider, extraction or export requests', () => {
    show({ preview: true, initialRun: { ...saved, demo: true }, initialMemberProfile: axes.map(axis => ({ axis, value: 0.4 })) });
    fireEvent.click(screen.getByRole('button', { name: 'Compare with my profile' }));
    expect(screen.getByRole('img', { name: `Comparison radar: estimated profile vs ${saved.occupationTitle}` })).toBeInTheDocument();
    fireEvent.click(screen.getByText('View radar values'));
    expect(screen.getByRole('region', { name: /Estimated member profile compared with occupation requirements/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export Comparison PDF' })).toBeDisabled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('hydrates the O*NET occupation graph, scored skill list and numeric alternative without rerunning a provider', () => {
    show({ initialRun: saved });
    expect(screen.getByRole('img', { name: `Occupation skill radar: ${saved.occupationTitle}` }).tagName.toLowerCase()).toBe('svg');
    expect(screen.getByText('Troubleshooting')).toBeInTheDocument();
    expect(screen.getByText('86%')).toBeInTheDocument();
    fireEvent.click(screen.getByText('View radar values'));
    const values = within(screen.getByRole('region', { name: 'Occupation radar values from this lookup' })).getByRole('table');
    expect(within(values).getAllByRole('row')).toHaveLength(7);
    expect(within(values).getByRole('rowheader', { name: 'Engineering' }).closest('tr')).toHaveTextContent('75%');
    expect(screen.getByRole('link', { name: /Training options for this lookup/ })).toHaveAttribute('href', '/dashboard/ai-tools/training-bridge?result=owned-selected');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('opens the real member-versus-target graph with six numerical comparisons and preserves export series', async () => {
    const profile = axes.map(axis => ({ axis, value: 0.4 }));
    fetcher.mockImplementation(async input => {
      if (String(input) === '/api/member/skill-profile') return Response.json({ skillProfile: profile, hasAiResumeExtraction: true, hasInterestProfiler: true, certNames: ['CompTIA A+'], resumeSkills: profile });
      if (String(input) === '/api/ai/export-pdf') return new Response('pdf', { headers: { 'content-type': 'application/pdf' } });
      throw new Error(`Unexpected provider request: ${input}`);
    });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:test') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    show({ initialRun: saved });
    fireEvent.click(screen.getByRole('button', { name: 'Compare with my profile' }));
    await screen.findByRole('heading', { name: `Your Skills vs. ${saved.occupationTitle}` });
    expect(screen.getByRole('img', { name: `Comparison radar: estimated profile vs ${saved.occupationTitle}` })).toBeInTheDocument();
    fireEvent.click(screen.getByText('View radar values'));
    const table = within(screen.getByRole('region', { name: /Estimated member profile compared with occupation requirements/ })).getByRole('table');
    const engineering = within(table).getByRole('rowheader', { name: 'Engineering' }).closest('tr')!;
    expect(within(engineering).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['40%', '75%']);
    expect(screen.getByText('Skill Gaps to Close')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Export Comparison PDF' }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith('/api/ai/export-pdf', expect.objectContaining({ method: 'POST' })));
    const body = JSON.parse(String(fetcher.mock.calls.find(([url]) => url === '/api/ai/export-pdf')![1]!.body));
    expect(body.chartData.axes).toEqual(axes);
    expect(body.chartData.series[0].values[1]).toEqual({ axis: 'Engineering', value: 0.75 });
    expect(body.chartData.series[1].values[1]).toEqual({ axis: 'Engineering', value: 0.4 });
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('extract-resume'))).toBe(false);
  });

  it('requires an explicit load for a suggested occupation and only links Training Bridge after a confirmed save', async () => {
    fetcher.mockResolvedValue(Response.json({ occupationTitle: saved.occupationTitle, occupationCode: saved.occupationCode, radarAxes: saved.radarAxes, skills: saved.skills, resultId: null, demo: false }));
    show({ initialTarget: { code: saved.occupationCode, title: saved.occupationTitle } });
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Load this occupation' }));
    await screen.findByRole('img', { name: `Occupation skill radar: ${saved.occupationTitle}` });
    expect(fetcher).toHaveBeenCalledWith(`/api/ai/skill-mapper?code=${saved.occupationCode}&title=${encodeURIComponent(saved.occupationTitle)}`);
    expect(screen.getByRole('status')).toHaveTextContent('lookup could not be saved');
    expect(screen.queryByRole('link', { name: /Training options for this lookup/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Training options' })).toHaveAttribute('href', '/dashboard/ai-tools/training-bridge');
  });
});

describe('Skill Mapper dark-mode contrast tokens', () => {
  const profile = axes.map(axis => ({ axis, value: 0.4 }));
  const strokes = (container: HTMLElement) => Array.from(container.querySelectorAll('svg.skill-mapper-radar-chart polygon')).map(polygon => polygon.getAttribute('stroke'));

  it('draws the occupation series, tab underline and skill bars with the adaptive accent instead of the static one', () => {
    const { container } = show({ preview: true, initialRun: saved });
    expect(strokes(container)).toContain('var(--wa-accent)');
    expect(screen.getByRole('button', { name: 'Occupation Search' }).getAttribute('style')).toContain('var(--wa-accent)');
    expect(container.querySelector<HTMLElement>('div[style*="width: 86%"]')?.style.background).toBe('var(--wa-accent)');
  });

  it('draws the radar grid, comparison series, legend key, large gaps and category chips from AA-safe tokens', () => {
    const { container } = show({ preview: true, initialRun: saved, initialMemberProfile: profile });
    fireEvent.click(screen.getByRole('button', { name: 'Compare with my profile' }));
    expect(strokes(container)).toEqual(expect.arrayContaining(['var(--skill-radar-grid)', 'var(--skill-radar-grid-quiet)', 'var(--wa-accent)', 'var(--color-blue, #2b7bb9)']));
    expect(strokes(container)).not.toContain('var(--surface-container-highest)');
    const spokes = Array.from(container.querySelectorAll('svg.skill-mapper-radar-chart line')).map(line => line.getAttribute('stroke'));
    expect(spokes.length).toBe(axes.length);
    expect(spokes.every(stroke => stroke === 'var(--skill-radar-grid)')).toBe(true);
    // 80 - 40 and 75 - 40 are over the 30-point threshold; 70 - 40 is not.
    expect(screen.getByText(/\+40 needed/).style.color).toBe('var(--wa-danger)');
    expect(screen.getByText(/\+35 needed/).style.color).toBe('var(--wa-danger)');
    expect(screen.getByText(/\+30 needed/).style.color).not.toBe('var(--wa-danger)');
    const chipColors = Array.from(container.querySelectorAll<HTMLElement>('span')).map(span => span.style.color).filter(color => color.startsWith('color-mix(in srgb') && color.includes('var(--wa-text)'));
    expect(chipColors.length).toBeGreaterThan(0);
    expect(chipColors.every(color => color.includes(' 40%, var(--wa-text)'))).toBe(true);
  });
});

describe('Skill Mapper accessibility', () => {
  const profile = axes.map(axis => ({ axis, value: 0.4 }));
  const comparisonHeading = `Your Skills vs. ${saved.occupationTitle}`;
  const scrollIntoView = vi.fn();
  beforeEach(() => { scrollIntoView.mockReset(); HTMLElement.prototype.scrollIntoView = scrollIntoView; });
  afterEach(() => { delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView; });

  it('moves focus and the viewport to the comparison heading when Compare with my profile is used', () => {
    show({ preview: true, initialRun: saved, initialMemberProfile: profile });
    fireEvent.click(screen.getByRole('button', { name: 'Compare with my profile' }));
    const heading = screen.getByRole('heading', { level: 2, name: comparisonHeading });
    expect(document.activeElement).toBe(heading);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.instances[0]).toBe(heading);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
  });

  it('lands focus on the heading once the profile has loaded', async () => {
    fetcher.mockImplementation(async input => {
      if (String(input) === '/api/member/skill-profile') return Response.json({ skillProfile: profile, hasAiResumeExtraction: true, hasInterestProfiler: true, certNames: [], resumeSkills: profile });
      throw new Error(`Unexpected request: ${input}`);
    });
    show({ initialRun: saved });
    fireEvent.click(screen.getByRole('button', { name: 'Compare with my profile' }));
    const heading = await screen.findByRole('heading', { level: 2, name: comparisonHeading });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('does not steal focus when the profile tab is opened from the tab strip', () => {
    show({ preview: true, initialRun: saved, initialMemberProfile: profile });
    fireEvent.click(screen.getByRole('button', { name: 'My Skills Profile' }));
    expect(document.activeElement).not.toBe(screen.getByRole('heading', { level: 2, name: comparisonHeading }));
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('falls back to the profile panel, not <body>, when there is no comparison to show', async () => {
    fetcher.mockImplementation(async input => {
      if (String(input) === '/api/member/skill-profile') return Response.json({ skillProfile: axes.map(axis => ({ axis, value: 0 })), hasAiResumeExtraction: true, hasInterestProfiler: false, certNames: [], resumeSkills: [] });
      throw new Error(`Unexpected request: ${input}`);
    });
    show({ initialRun: saved });
    fireEvent.click(screen.getByRole('button', { name: 'Compare with my profile' }));
    await screen.findByText('Build your skill profile');
    await waitFor(() => expect(document.activeElement).not.toBe(document.body));
    expect(document.activeElement).toHaveAttribute('tabindex', '-1');
    expect(document.activeElement).toContainElement(screen.getByText('Build your skill profile'));
  });

  it('gives each radar a distinct name and an always-present numeric description, and names its table', () => {
    show({ preview: true, initialRun: saved, initialMemberProfile: profile });
    const occupation = screen.getByRole('img', { name: `Occupation skill radar: ${saved.occupationTitle}` });
    expect(document.getElementById(occupation.getAttribute('aria-describedby')!)).toHaveTextContent('Engineering 75%');
    fireEvent.click(screen.getByText('View radar values'));
    const occupationTable = within(screen.getByRole('region', { name: 'Occupation radar values from this lookup' })).getByRole('table', { name: 'Occupation radar values from this lookup' });
    expect(within(occupationTable).getAllByRole('rowheader').map(header => header.textContent)).toEqual(axes);
    expect(within(occupationTable).getAllByRole('columnheader').map(header => header.textContent)).toEqual(['Competency', 'Target occupation']);

    fireEvent.click(screen.getByRole('button', { name: 'Compare with my profile' }));
    const comparison = screen.getByRole('img', { name: `Comparison radar: estimated profile vs ${saved.occupationTitle}` });
    expect(comparison).not.toBe(occupation);
    expect(document.getElementById(comparison.getAttribute('aria-describedby')!)).toHaveTextContent('Engineering 40% versus 75%');
    fireEvent.click(screen.getByText('View radar values'));
    expect(screen.getByRole('table', { name: /Estimated member profile compared with occupation requirements/ })).toBeInTheDocument();
  });

  it('keeps the heading order H2 then H3 on both tabs', () => {
    const { container } = show({ preview: true, initialRun: saved, initialMemberProfile: profile });
    const levels = () => screen.getAllByRole('heading').map(heading => Number(heading.tagName.slice(1)));
    const expectOrdered = () => {
      const found = levels();
      expect(found[0]).toBe(2);
      expect(found).toContain(3);
      expect(found).not.toContain(4);
      found.forEach((level, i) => { if (i > 0) expect(level - found[i - 1]).toBeLessThanOrEqual(1); });
    };
    expectOrdered();
    fireEvent.click(screen.getByRole('button', { name: 'My Skills Profile' }));
    expectOrdered();
    expect(container.querySelector('h1')).toBeNull();
  });

  it('exposes the expanded state of the score explanation toggle', () => {
    show({ preview: true, initialRun: saved });
    const toggle = screen.getByRole('button', { name: /What do these scores measure/ });
    const panel = document.getElementById(toggle.getAttribute('aria-controls')!)!;
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(panel).toHaveAttribute('hidden');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(panel).not.toHaveAttribute('hidden');
    expect(panel).toHaveTextContent('Scores come from O*NET occupational data');
  });

  it('keeps the comparison key under the chart, ahead of the numbers, with dashed and solid line samples', () => {
    const { container } = show({ preview: true, initialRun: saved, initialMemberProfile: profile });
    fireEvent.click(screen.getByRole('button', { name: 'Compare with my profile' }));
    const chart = container.querySelector('svg.skill-mapper-radar-chart')!;
    const legend = container.querySelector('.skill-mapper-legend') as HTMLElement;
    const values = container.querySelector('details')!;
    expect(chart.compareDocumentPosition(legend) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(legend.compareDocumentPosition(values) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const sample = (label: string) => within(legend).getByText(label).querySelector('line')!;
    expect(sample('Your skills')).toHaveAttribute('stroke-dasharray', '4 2');
    expect(sample('Target occupation')).not.toHaveAttribute('stroke-dasharray');
    expect(sample('Target occupation')).toHaveAttribute('stroke', 'var(--wa-accent)');
  });

  it('shows the synthetic proof controls as disabled, not just inert', () => {
    show({ preview: true, initialRun: saved, initialTarget: { code: saved.occupationCode, title: saved.occupationTitle }, initialMemberProfile: profile });
    const search = screen.getByRole('button', { name: 'Search' });
    const exportMap = screen.getByRole('button', { name: 'Export Skill Map PDF' });
    for (const button of [search, exportMap]) {
      expect(button).toBeDisabled();
      expect(button.style.opacity).toBe('0.6');
      expect(button.style.cursor).toBe('not-allowed');
    }
    fireEvent.click(screen.getByRole('button', { name: 'Compare with my profile' }));
    const exportComparison = screen.getByRole('button', { name: 'Export Comparison PDF' });
    expect(exportComparison).toBeDisabled();
    expect(exportComparison.style.opacity).toBe('0.6');
    expect(exportComparison.style.cursor).toBe('not-allowed');
  });

  it('keeps live controls looking enabled outside the proof', () => {
    show({ initialRun: saved, initialTarget: { code: saved.occupationCode, title: saved.occupationTitle } });
    expect(screen.getByRole('button', { name: 'Search' }).style.opacity).toBe('1');
    expect(screen.getByRole('button', { name: 'Export Skill Map PDF' }).style.cursor).toBe('pointer');
  });
});
