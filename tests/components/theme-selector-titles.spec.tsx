import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ThemeSelector from '@/components/theme/ThemeSelector';

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('ThemeSelector tooltips', () => {
  it('gives each radio a title, so the icon-only rail switch names its options on hover', () => {
    render(<ThemeSelector />);
    expect(screen.getByRole('radiogroup', { name: 'Appearance' })).toBeTruthy();
    for (const name of ['Light', 'System', 'Dark']) {
      expect(screen.getByRole('radio', { name }).getAttribute('title')).toBe(name);
    }
  });
});
