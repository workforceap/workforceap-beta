import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ThemeSelector from '@/components/theme/ThemeSelector';

/**
 * Scout 2026-09-22 D3: the Astryx SegmentedControl selects whichever radio
 * receives focus (APG selection-follows-focus) and ThemeSelector persisted the
 * theme in `onChange`, so a focus that no input caused — a screen-reader
 * virtual cursor, find-in-page, a harness calling `.focus()` — flipped
 * `data-theme` and saved `wap-theme`. Only a user-initiated selection (click,
 * Enter/Space, arrow keys) may commit; keyboard operability stays intact.
 */

const html = () => document.documentElement;

beforeEach(() => {
  localStorage.clear();
  html().removeAttribute('data-theme');
  html().classList.remove('dark');
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function radio(name: string) {
  return screen.getByRole('radio', { name });
}

describe('ThemeSelector commits only user-initiated selections', () => {
  it('starts on the stored preference with nothing persisted by rendering', () => {
    render(<ThemeSelector />);
    expect(radio('System')).toHaveAttribute('aria-checked', 'true');
    expect(localStorage.getItem('wap-theme')).toBeNull();
  });

  it('focusing a non-selected radio neither selects it nor persists a theme', () => {
    render(<ThemeSelector />);
    act(() => radio('Dark').focus());
    expect(document.activeElement).toBe(radio('Dark'));
    expect(radio('Dark')).toHaveAttribute('aria-checked', 'false');
    expect(radio('System')).toHaveAttribute('aria-checked', 'true');
    expect(localStorage.getItem('wap-theme')).toBeNull();
    expect(html()).not.toHaveAttribute('data-theme');
    expect(html().classList.contains('dark')).toBe(false);
  });

  it('a click selects and persists', async () => {
    const user = userEvent.setup();
    render(<ThemeSelector />);
    await user.click(radio('Dark'));
    expect(radio('Dark')).toHaveAttribute('aria-checked', 'true');
    expect(localStorage.getItem('wap-theme')).toBe('dark');
    expect(html()).toHaveAttribute('data-theme', 'dark');
    expect(html().classList.contains('dark')).toBe(true);
  });

  it('arrow keys from the selected radio select and persist the neighbour', async () => {
    const user = userEvent.setup();
    render(<ThemeSelector />);
    act(() => radio('System').focus());
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(radio('Light'));
    expect(radio('Light')).toHaveAttribute('aria-checked', 'true');
    expect(localStorage.getItem('wap-theme')).toBe('light');
    expect(html()).toHaveAttribute('data-theme', 'light');
  });

  it('Enter on a radio that was only focused still selects it', async () => {
    const user = userEvent.setup();
    render(<ThemeSelector />);
    act(() => radio('Light').focus());
    expect(localStorage.getItem('wap-theme')).toBeNull();
    await user.keyboard('{Enter}');
    expect(radio('Light')).toHaveAttribute('aria-checked', 'true');
    expect(localStorage.getItem('wap-theme')).toBe('light');
  });
});
