import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ThemeInitScript from '@/components/theme/ThemeInitScript';

let systemDark = false;
let mediaListeners: Array<(event: MediaQueryListEvent) => void>;

beforeEach(() => {
  systemDark = false;
  mediaListeners = [];
  localStorage.clear();
  document.documentElement.classList.remove('dark');
  document.documentElement.removeAttribute('data-theme');
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    get matches() { return systemDark; },
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => mediaListeners.push(listener),
    removeEventListener: vi.fn(),
  })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.classList.remove('dark');
  document.documentElement.removeAttribute('data-theme');
});

function runThemeBootstrap() {
  const script = ThemeInitScript();
  window.eval(script.props.dangerouslySetInnerHTML.__html);
}

function changeSystemTheme(dark: boolean) {
  systemDark = dark;
  for (const listener of mediaListeners) listener({ matches: dark } as MediaQueryListEvent);
}

describe('root system-theme synchronization', () => {
  it('tracks OS changes while the collapsed sidebar leaves ThemeSelector unmounted', () => {
    localStorage.setItem('wap-theme', 'system');
    runThemeBootstrap();
    expect(document.querySelector('[aria-label="Appearance"]')).toBeNull();
    expect(document.documentElement).not.toHaveClass('dark');

    changeSystemTheme(true);
    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement).not.toHaveAttribute('data-theme');

    changeSystemTheme(false);
    expect(document.documentElement).not.toHaveClass('dark');
  });

  it.each(['light', 'dark'] as const)('does not replace an explicit %s choice on later OS changes', (theme) => {
    localStorage.setItem('wap-theme', 'system');
    runThemeBootstrap();

    // Model a preference change after bootstrap (the setting applies the root
    // class synchronously and persists its choice in the same tab).
    localStorage.setItem('wap-theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.setAttribute('data-theme', theme);
    changeSystemTheme(theme !== 'dark');

    expect(document.documentElement.classList.contains('dark')).toBe(theme === 'dark');
    expect(document.documentElement).toHaveAttribute('data-theme', theme);
  });
});
