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
    expect(screen.getByRole('img', { name: 'Skill radar chart' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('View radar values'));
    expect(screen.getByRole('region', { name: /Estimated member profile compared with occupation requirements/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export Comparison PDF' })).toBeDisabled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('hydrates the O*NET occupation graph, scored skill list and numeric alternative without rerunning a provider', () => {
    show({ initialRun: saved });
    expect(screen.getByRole('img', { name: 'Skill radar chart' }).tagName.toLowerCase()).toBe('svg');
    expect(screen.getByText('Troubleshooting')).toBeInTheDocument();
    expect(screen.getByText('86%')).toBeInTheDocument();
    fireEvent.click(screen.getByText('View radar values'));
    const values = within(screen.getByRole('region', { name: 'Occupation radar values from this lookup' })).getByRole('table');
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
    await screen.findByRole('heading', { name: `Your Skills vs. ${saved.occupationTitle}` });
    expect(screen.getByRole('img', { name: 'Skill radar chart' })).toBeInTheDocument();
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
    await screen.findByRole('img', { name: 'Skill radar chart' });
    expect(fetcher).toHaveBeenCalledWith(`/api/ai/skill-mapper?code=${saved.occupationCode}&title=${encodeURIComponent(saved.occupationTitle)}`);
    expect(screen.getByRole('status')).toHaveTextContent('lookup could not be saved');
    expect(screen.queryByRole('link', { name: /Training options for this lookup/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Training options' })).toHaveAttribute('href', '/dashboard/ai-tools/training-bridge');
  });
});
