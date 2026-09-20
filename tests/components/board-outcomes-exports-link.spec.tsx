import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * /admin/outcomes keeps one pointer to the exports page instead of its own
 * copy of the funder file list (admin audit 2026-09-20, Outcomes): every
 * export is listed once, on /admin/exports, with one verb per row type.
 */

vi.mock('@astryxdesign/core/Card', () => ({
  Card: ({ children }: { children?: React.ReactNode }) => <section>{children}</section>,
}));

import { ADMIN_EXPORTS_HREF, BoardOutcomesKit } from '@/components/portal/kit/pages/admin-subviews/BoardOutcomesKit';

afterEach(cleanup);

describe('BoardOutcomesKit funder exports', () => {
  it('links to /admin/exports once and lists no file endpoints of its own', () => {
    const { container } = render(<BoardOutcomesKit />);
    expect(screen.getByRole('heading', { name: 'Funder exports' })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Open exports/ });
    expect(link).toHaveAttribute('href', '/admin/exports');
    expect(ADMIN_EXPORTS_HREF).toBe('/admin/exports');
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/admin/exports']);
    expect(screen.queryByText(/Demographics report/)).toBeNull();
    expect(container.querySelector('a[href*="/api/admin/outcomes/snapshot"]')).toBeNull();
    expect(container.querySelector('.material-symbols-outlined')).toBeNull();
    for (const el of Array.from(container.querySelectorAll<HTMLElement>('[style]'))) {
      expect(el.getAttribute('style')).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    }
  });

  it('hides the pointer on the board view', () => {
    render(<BoardOutcomesKit showExports={false} />);
    expect(screen.queryByText('Funder exports')).toBeNull();
    expect(screen.queryByRole('link', { name: /Open exports/ })).toBeNull();
  });
});
