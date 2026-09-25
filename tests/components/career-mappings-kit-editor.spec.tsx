import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CareerMappingsKit } from '@/components/portal/kit/pages/admin-subviews/CareerMappingsKit';
import { CareerMappingEditor, CAREER_MAPPING_EDITOR_ID } from '@/components/admin/CareerMappingEditor';
import { PROGRAMS } from '@/lib/content/programs';

/**
 * WAP-193: mapping O*NET occupations to programs used to exist only on
 * /admin/career-mappings?ui=legacy.
 */

const nav = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => nav, usePathname: () => '/admin/career-mappings', useSearchParams: () => new URLSearchParams() }));

const PROGRAM = PROGRAMS[0]!;
const fetchMock = vi.fn();
const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;

beforeEach(() => {
  nav.refresh.mockReset();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.startsWith('/api/admin/onet/search')) return json({ occupations: [{ code: '15-1232.00', title: 'Computer User Support Specialists' }] });
    if (url.startsWith('/api/admin/onet/auto-match'))
      return json({
        matches: [
          { programSlug: PROGRAM.slug, programTitle: PROGRAM.title, score: 0.82, reason: 'Strong fit', recommendationType: 'primary', experienceBand: 'beginner' },
        ],
      });
    if (url.startsWith('/api/admin/onet/mappings') && (!init || init.method !== 'POST')) return json({ mappings: [] });
    if (url === '/api/admin/onet/mappings') return json({ mapping: { id: 'm1' } });
    return json({});
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderKit() {
  render(<CareerMappingsKit paths={[]} editor={<CareerMappingEditor />} editorId={CAREER_MAPPING_EDITOR_ID} />);
}

async function pickOccupation() {
  fireEvent.change(screen.getByLabelText('Search O*NET occupations'), { target: { value: 'help desk' } });
  fireEvent.click(await screen.findByRole('button', { name: /Computer User Support Specialists/ }));
  await screen.findByRole('button', { name: `Approve ${PROGRAM.title}` });
}

const posts = () => fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST');

describe('CareerMappingsKit editor', () => {
  it('renders the editor on the default view and points "Edit mappings" at it', () => {
    renderKit();
    expect(screen.getByRole('heading', { name: 'Map an occupation' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Edit mappings' }).getAttribute('href')).toBe(`#${CAREER_MAPPING_EDITOR_ID}`);
  });

  it('approves a suggested program with the same POST as legacy and refreshes the grid', async () => {
    renderKit();
    await pickOccupation();
    fireEvent.click(screen.getByRole('button', { name: `Approve ${PROGRAM.title}` }));
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled());
    const [url, init] = posts()[0]!;
    expect(url).toBe('/api/admin/onet/mappings');
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      onetCode: '15-1232.00',
      isActive: true,
      programSlug: PROGRAM.slug,
      experienceBand: 'beginner',
      recommendationType: 'primary',
      priority: 1,
      whyRecommended: 'Strong fit',
    });
    expect(screen.getByText(/^Mapped Computer User Support Specialists →/).getAttribute('role')).toBe('status');
  });

  it('rejects an out-of-range manual priority without calling the API', async () => {
    renderKit();
    await pickOccupation();
    fireEvent.change(screen.getByLabelText('Priority (1 = highest)'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save mapping' }));
    expect(screen.getByRole('alert').textContent).toContain('Priority must be a whole number from 1 to 99.');
    expect(posts()).toHaveLength(0);
  });
});
