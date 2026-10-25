import { readFileSync } from 'node:fs';
import path from 'node:path';
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
const scrollIntoView = vi.fn();
const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
const descriptionOf = (element: Element) => (element.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean).map(id => document.getElementById(id)?.textContent ?? '').join(' ');
const occupationChartName = `Skill requirements for ${saved.occupationTitle}`;
const comparisonChartName = `Estimated profile compared with ${saved.occupationTitle}`;
const show = (props: Parameters<typeof SkillMapperClient>[0]) => render(<NextIntlClientProvider locale="en" messages={en}><SkillMapperClient {...props} /></NextIntlClientProvider>);
beforeEach(() => {
  fetcher.mockReset(); vi.stubGlobal('fetch', fetcher);
  scrollIntoView.mockReset();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 0));
  vi.stubGlobal('cancelAnimationFrame', (frame: number) => clearTimeout(frame));
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
});
afterEach(() => {
  cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks();
  if (originalScrollIntoView) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
});

describe('actual Skill Mapper saved workspace', () => {
  it('labels a synthetic preview once without implying an occupation service failure', () => {
    show({ preview: true, initialRun: { ...saved, demo: true } });
    expect(screen.getByRole('note', { name: 'Sample data preview' })).toHaveTextContent('Not real O*NET data. Search, extraction and export are disabled.');
    expect(screen.queryByRole('note', { name: 'Sample occupation data' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Explore an occupation' })).toBeNull();
    expect(screen.getByRole('heading', { name: saved.occupationTitle })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled();
    expect(screen.getByRole('link', { name: /Training options for this lookup/ })).toHaveAttribute('href', '/dashboard/ai-tools/training-bridge?result=owned-selected');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ['network', 'Unable to connect to occupation database.'],
    ['provider', 'O*NET occupational search is unavailable.'],
  ])('preserves the real %s failure reason and recovery guidance when showing sample data', async (failure, reason) => {
    if (failure === 'network') fetcher.mockRejectedValue(new Error('Network unavailable'));
    else fetcher.mockResolvedValue(Response.json({ demo: true }));
    show({});
    expect(screen.getByRole('heading', { name: 'Explore an occupation' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search an occupation' }), { target: { value: 'Developer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    const warning = await screen.findByRole('note', { name: 'Sample occupation data' });
    expect(warning).toHaveTextContent(reason);
    expect(warning).toHaveTextContent('Sample data only.');
    expect(warning).toHaveTextContent('Try another occupation or return later for O*NET occupation data.');
    expect(screen.queryByRole('note', { name: 'Sample data preview' })).toBeNull();
    expect(screen.getByRole('img', { name: /Skill requirements for Software Developer/ })).toBeInTheDocument();
  });

  it('focuses and reveals the synthetic comparison without account, provider, extraction or export requests', async () => {
    show({ preview: true, initialRun: { ...saved, demo: true }, initialMemberProfile: axes.map(axis => ({ axis, value: 0.4 })) });
    const compare = screen.getByRole('button', { name: 'Compare with my profile' });
    compare.focus();
    fireEvent.click(compare);
    const heading = screen.getByRole('heading', { name: `Your Skills vs. ${saved.occupationTitle}` });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'instant', block: 'start' });
    expect(scrollIntoView.mock.contexts[0]).toBe(heading);
    const chart = screen.getByRole('img', { name: comparisonChartName });
    expect(chart).toHaveAccessibleDescription(/Dashed line: estimated member profile.*Compare the shape/);
    fireEvent.click(screen.getByText('View radar values'));
    const values = screen.getByRole('region', { name: /Estimated member profile compared with occupation requirements/ });
    const disclosure = document.getElementById(chart.getAttribute('aria-details')!);
    expect(disclosure?.tagName).toBe('DETAILS');
    expect(disclosure).toContainElement(within(values).getByRole('table'));
    expect(screen.getByRole('button', { name: 'Export Comparison PDF' })).toBeDisabled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('hydrates the O*NET occupation graph, scored skill list and numeric alternative without rerunning a provider', () => {
    show({ initialRun: saved });
    const chart = screen.getByRole('img', { name: occupationChartName });
    expect(chart.tagName.toLowerCase()).toBe('svg');
    expect(chart).toHaveAccessibleDescription(/Exact values follow this chart.*Higher values mean/);
    expect(screen.getByText('Troubleshooting')).toBeInTheDocument();
    expect(screen.getByText('86%')).toBeInTheDocument();
    fireEvent.click(screen.getByText('View radar values'));
    const values = within(screen.getByRole('region', { name: 'Occupation radar values from this lookup' })).getByRole('table');
    expect(document.getElementById(chart.getAttribute('aria-details')!)).toContainElement(values);
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
    const heading = await screen.findByRole('heading', { name: `Your Skills vs. ${saved.occupationTitle}` });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByRole('img', { name: comparisonChartName })).toBeInTheDocument();
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
    await screen.findByRole('img', { name: occupationChartName });
    expect(fetcher).toHaveBeenCalledWith(`/api/ai/skill-mapper?code=${saved.occupationCode}&title=${encodeURIComponent(saved.occupationTitle)}`);
    expect(screen.getByRole('status')).toHaveTextContent('lookup could not be saved');
    expect(screen.queryByRole('link', { name: /Training options for this lookup/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Training options' })).toHaveAttribute('href', '/dashboard/ai-tools/training-bridge');
  });

  it('keeps ordinary view selection focused and links a standalone profile chart to its exact percentages', () => {
    show({ preview: true, initialMemberProfile: axes.map(axis => ({ axis, value: 0.4 })) });
    const profileView = screen.getByRole('button', { name: 'My Skills Profile' });
    profileView.focus();
    fireEvent.click(profileView);
    expect(profileView).toHaveFocus();
    expect(scrollIntoView).not.toHaveBeenCalled();
    const chart = screen.getByRole('img', { name: 'Your estimated skill profile' });
    const values = document.getElementById(chart.getAttribute('aria-details')!)!;
    expect(within(values).getAllByText('40%')).toHaveLength(6);
    expect(chart).toHaveAccessibleDescription(/Exact values follow this chart.*not a proficiency assessment/);
  });

  it('focuses the next useful heading when Compare has no member profile to chart', async () => {
    show({ preview: true, initialRun: saved, initialMemberProfile: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Compare with my profile' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Build your skill profile' })).toHaveFocus());
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('Skill Mapper dark-mode contrast tokens', () => {
  const profile = axes.map(axis => ({ axis, value: 0.4 }));
  const strokes = (container: HTMLElement) => Array.from(container.querySelectorAll('svg.skill-mapper-radar-chart polygon')).map(polygon => polygon.getAttribute('stroke'));

  it('keeps the follow-through Astryx primary CTA on the solid accent-fill/control-text pair', () => {
    const css = readFileSync(path.resolve(process.cwd(), 'components/portal/tools/SkillMapperClient.module.css'), 'utf8');
    const rule = css.match(/\.followThrough\s+:global\(a\[data-variant='primary'\]\)\s*\{([^}]+)\}/);
    expect(rule).not.toBeNull();
    expect(rule![1]).toContain('background-color: var(--wa-accent-fill)');
    expect(rule![1]).toContain('color: var(--wa-on-accent-control)');
    expect(rule![1]).not.toContain('background-color: var(--wa-accent)');
  });

  it('draws the occupation series, tab underline and skill bars with the adaptive accent instead of the static one', () => {
    const { container } = show({ preview: true, initialRun: saved });
    expect(strokes(container)).toContain('var(--wa-accent)');
    expect(screen.getByRole('button', { name: 'Occupation Search' })).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelector<HTMLElement>('[class*="requirementFill"]')?.style.width).toBe('86%');
  });

  it('draws the radar grid, comparison series, legend key, large gaps and category chips from AA-safe tokens', async () => {
    fetcher.mockResolvedValue(Response.json({
      occupationTitle: saved.occupationTitle,
      occupationCode: saved.occupationCode,
      radarAxes: saved.radarAxes,
      skills: saved.skills,
      resultId: 'saved-result',
      demo: false,
      matchedPrograms: [{ programSlug: 'it-support', programTitle: 'IT Support', categoryLabel: 'Technology', categoryColor: 'var(--wa-info)', icon: 'computer', duration: '12 weeks', partner: 'WorkforceAP', priority: 1, experienceBand: 'beginner', recommendationType: 'primary', whyRecommended: 'Build foundational troubleshooting skills.' }],
    }));
    const { container } = show({ initialTarget: { code: saved.occupationCode, title: saved.occupationTitle }, initialMemberProfile: profile });
    fireEvent.click(screen.getByRole('button', { name: 'Load this occupation' }));
    await screen.findByText('Technology');
    expect(screen.getByText('primary')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Compare with my profile' }));
    expect(strokes(container)).toEqual(expect.arrayContaining(['var(--skill-radar-grid)', 'var(--skill-radar-grid-quiet)', 'var(--wa-accent)', 'var(--wa-info)']));
    expect(strokes(container)).not.toContain('var(--surface-container-highest)');
    const spokes = Array.from(container.querySelectorAll('svg.skill-mapper-radar-chart line')).map(line => line.getAttribute('stroke'));
    expect(spokes.length).toBe(axes.length);
    expect(spokes.every(stroke => stroke === 'var(--skill-radar-grid)')).toBe(true);
    // 80 - 40 and 75 - 40 are over the 30-point threshold; 70 - 40 is not.
    const engineeringGap = screen.getByText('35-point difference');
    const designGap = screen.getByText('30-point difference');
    expect(engineeringGap).toBeInTheDocument();
    expect(designGap).toBeInTheDocument();
    expect(engineeringGap.closest('[class*="gapRow"]')).toHaveTextContent('Your estimate');
    expect(engineeringGap.closest('[class*="gapRow"]')).toHaveTextContent('40%');
    expect(engineeringGap.closest('[class*="gapRow"]')).toHaveTextContent('75%');
    expect(designGap.closest('[class*="gapRow"]')).toHaveTextContent('70%');
  });
});

describe('Skill Mapper accessibility', () => {
  const profile = axes.map(axis => ({ axis, value: 0.4 }));
  const comparisonHeading = `Your Skills vs. ${saved.occupationTitle}`;

  it('moves focus and the viewport to the comparison heading when Compare with my profile is used', async () => {
    show({ preview: true, initialRun: saved, initialMemberProfile: profile });
    fireEvent.click(screen.getByRole('button', { name: 'Compare with my profile' }));
    const heading = screen.getByRole('heading', { level: 2, name: comparisonHeading });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(heading);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'instant', block: 'start' });
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
    const occupation = screen.getByRole('img', { name: occupationChartName });
    expect(descriptionOf(occupation)).toContain('Engineering 75%');
    fireEvent.click(screen.getByText('View radar values'));
    const occupationTable = within(screen.getByRole('region', { name: 'Occupation radar values from this lookup' })).getByRole('table', { name: 'Occupation radar values from this lookup' });
    expect(within(occupationTable).getAllByRole('rowheader').map(header => header.textContent)).toEqual(axes);
    expect(within(occupationTable).getAllByRole('columnheader').map(header => header.textContent)).toEqual(['Competency', 'Target occupation']);

    fireEvent.click(screen.getByRole('button', { name: 'Compare with my profile' }));
    const comparison = screen.getByRole('img', { name: comparisonChartName });
    expect(comparison).not.toBe(occupation);
    expect(descriptionOf(comparison)).toContain('Engineering 40% versus 75%');
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
    expect(panel).toHaveTextContent('Occupation values summarize how much each area matters for the role.');
    expect(panel).toHaveTextContent('not a proficiency assessment');
  });

  it('keeps the comparison key under the chart, ahead of the numbers, with dashed and solid line samples', () => {
    const { container } = show({ preview: true, initialRun: saved, initialMemberProfile: profile });
    fireEvent.click(screen.getByRole('button', { name: 'Compare with my profile' }));
    const chart = container.querySelector('svg.skill-mapper-radar-chart')!;
    const legend = container.querySelector('dl') as HTMLElement;
    const values = container.querySelector('details')!;
    expect(chart.compareDocumentPosition(legend) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(legend.compareDocumentPosition(values) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const memberSample = within(legend).getByText('Your estimated profile').querySelector('span')!;
    const targetSample = within(legend).getByText('Occupation requirements').querySelector('span')!;
    expect(memberSample).toHaveAttribute('aria-hidden', 'true');
    expect(targetSample).toHaveAttribute('aria-hidden', 'true');
    expect(memberSample.className).not.toBe(targetSample.className);
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
