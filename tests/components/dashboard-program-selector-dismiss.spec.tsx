import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DashboardProgramSelector from '@/components/portal/DashboardProgramSelector';

/**
 * WAP-229: the member-home program switcher is a disclosure that closes on
 * Escape, on a pointer outside, and when focus leaves it, and puts focus back
 * on its trigger after Escape or a switch.
 */

const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const options = [
  { id: 'e1', programSlug: 'it-support', programTitle: 'IT Support', isPrimary: true },
  { id: 'e2', programSlug: 'cyber', programTitle: 'Cybersecurity Analyst with a Very Long Program Name', isPrimary: false },
];

function renderSelector() {
  render(
    <>
      <DashboardProgramSelector activeProgramSlug="it-support" options={options} />
      <a href="/dashboard/after">After the switcher</a>
    </>,
  );
  return screen.getByTestId('dashboard-program-selector');
}

const menu = () => screen.queryByTestId('dashboard-program-selector-menu');

describe('DashboardProgramSelector dismissal (WAP-229)', () => {
  beforeEach(() => push.mockClear());

  it('opens from the keyboard as a disclosure with plain buttons and the current program marked', async () => {
    const user = userEvent.setup();
    const trigger = renderSelector();
    await user.tab();
    expect(trigger).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).not.toHaveAttribute('aria-haspopup');
    expect(trigger).toHaveAttribute('aria-controls', menu()!.id);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByRole('button', { name: /IT Support/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: /Cybersecurity/ })).not.toHaveAttribute('aria-current');
  });

  it('Escape closes it and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    const trigger = renderSelector();
    await user.click(trigger);
    await user.tab();
    expect(screen.getByRole('button', { name: /IT Support/ })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(menu()).toBeNull();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  it('a pointer outside closes it', async () => {
    const trigger = renderSelector();
    fireEvent.click(trigger);
    expect(menu()).not.toBeNull();

    fireEvent.pointerDown(document.body);
    expect(menu()).toBeNull();
  });

  it('a pointer inside keeps it open', () => {
    const trigger = renderSelector();
    fireEvent.click(trigger);
    fireEvent.pointerDown(screen.getByRole('button', { name: /Cybersecurity/ }));
    expect(menu()).not.toBeNull();
  });

  it('tabbing past the last program closes it', async () => {
    const user = userEvent.setup();
    const trigger = renderSelector();
    await user.click(trigger);
    await user.tab();
    await user.tab();
    expect(menu()).not.toBeNull();

    await user.tab();
    expect(screen.getByRole('link', { name: 'After the switcher' })).toHaveFocus();
    expect(menu()).toBeNull();
  });

  it('switching programs navigates and leaves focus on the trigger', async () => {
    const user = userEvent.setup();
    const trigger = renderSelector();
    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: /Cybersecurity/ }));

    expect(push).toHaveBeenCalledWith('/dashboard?program=cyber');
    expect(menu()).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('lets a long program name wrap instead of cutting it off', () => {
    const trigger = renderSelector();
    fireEvent.click(trigger);
    const name = screen.getByText(/Very Long Program Name/);
    expect(name.style.whiteSpace).not.toBe('nowrap');
    expect(name.style.textOverflow).not.toBe('ellipsis');
  });
});
