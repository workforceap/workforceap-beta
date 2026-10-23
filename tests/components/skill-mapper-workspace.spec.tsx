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
    expect(chart).toHaveAccessibleDescription(/Exact percentages.*Higher values mean/);
    expect(screen.getByText('Troubleshooting')).toBeInTheDocument();
    expect(screen.getByText('86%')).toBeInTheDocument();
    fireEvent.click(screen.getByText('View radar values'));
    const values = within(screen.getByRole('region', { name: 'Occupation radar values from this lookup' })).getByRole('table');
    expect(document.getElementById(chart.getAttribute('aria-details')!)).toContainElement(values);
    expect(within(values).getAllByRole('row')).toHaveLength(7);
    expect(within(values).getByRole('cell', { name: 'Engineering' }).closest('tr')).toHaveTextContent('75%');
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
    const engineering = within(table).getByRole('cell', { name: 'Engineering' }).closest('tr')!;
    expect(within(engineering).getAllByRole('cell').map(cell => cell.textContent)).toEqual(['Engineering', '40%', '75%']);
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
    expect(chart).toHaveAccessibleDescription(/Exact percentages follow.*not a proficiency assessment/);
  });

  it('focuses the next useful heading when Compare has no member profile to chart', async () => {
    show({ preview: true, initialRun: saved, initialMemberProfile: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Compare with my profile' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Build your skill profile' })).toHaveFocus());
    expect(fetcher).not.toHaveBeenCalled();
  });
});
