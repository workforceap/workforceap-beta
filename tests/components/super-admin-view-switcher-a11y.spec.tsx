import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import SuperAdminViewSwitcher from '@/components/super-admin-view-switcher';

/**
 * Round 2: Escape from the portal view switcher returns focus to its trigger
 * (it used to drop to <body>), and the panel is a disclosure of navigation
 * buttons, not a listbox it does not behave like.
 */

const push = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin',
  useRouter: () => ({ push }),
}));

afterEach(() => {
  cleanup();
  push.mockClear();
});

const trigger = () => screen.getByRole('button', { name: /Switch portal view/ });

describe('SuperAdminViewSwitcher keyboard behavior', () => {
  it('returns focus to the trigger on Escape', () => {
    render(<SuperAdminViewSwitcher initialIsSuperAdmin />);
    fireEvent.click(trigger());
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');

    screen.getByRole('button', { name: 'Partner Portal' }).focus();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(trigger());
  });

  it('does not steal focus when Escape is pressed with focus elsewhere', () => {
    render(
      <>
        <input aria-label="elsewhere" />
        <SuperAdminViewSwitcher initialIsSuperAdmin />
      </>,
    );
    fireEvent.click(trigger());
    const input = screen.getByLabelText('elsewhere');
    input.focus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.activeElement).toBe(input);
  });

  it('keeps focus on the trigger after choosing a view', () => {
    render(<SuperAdminViewSwitcher initialIsSuperAdmin />);
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('button', { name: 'Employer Portal' }));
    expect(push).toHaveBeenCalledWith('/employer');
    expect(document.activeElement).toBe(trigger());
  });

  it('is a disclosure of buttons with the current view marked by aria-current', () => {
    render(<SuperAdminViewSwitcher initialIsSuperAdmin />);
    expect(trigger()).not.toHaveAttribute('aria-haspopup');
    fireEvent.click(trigger());
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Admin Portal' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'Partner Portal' })).not.toHaveAttribute('aria-current');
  });
});
