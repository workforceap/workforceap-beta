'use client';

import { useCallback, useRef } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { useTheme, type Theme } from '@/lib/hooks/useTheme';

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'dark', label: 'Dark', icon: Moon },
];

/**
 * A selection counts as the member's choice only this soon after a pointer
 * press or key press inside the control. The Astryx SegmentedControl selects
 * whichever radio receives focus (APG selection-follows-focus), so a focus that
 * no input caused — a screen-reader virtual cursor, find-in-page, a test
 * harness calling `.focus()` — would otherwise flip and save the theme.
 */
const ACTIVATION_WINDOW_MS = 500;

/**
 * Appearance picker (profile settings) — Astryx SegmentedControl over the
 * app's own theme system (`useTheme` still owns the html.dark/data-theme
 * flip); the control's colors resolve through the shared token names, so it
 * follows the brand accent and dark mode automatically.
 */
export default function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  const lastActivationAt = useRef(0);

  const markActivation = useCallback(() => {
    lastActivationAt.current = Date.now();
  }, []);

  const handleChange = useCallback(
    (next: string) => {
      // Click, Enter/Space and the arrow/Home/End keys all start with a
      // pointerdown or keydown inside the group; a bare focus does not.
      if (Date.now() - lastActivationAt.current > ACTIVATION_WINDOW_MS) return;
      setTheme(next as Theme);
    },
    [setTheme],
  );

  return (
    <div onPointerDownCapture={markActivation} onKeyDownCapture={markActivation} style={{ display: 'contents' }}>
      <SegmentedControl value={theme} onChange={handleChange} label="Appearance" size="md">
        {OPTIONS.map(({ value, label, icon: Icon }) => (
          <SegmentedControlItem key={value} value={value} label={label} icon={<Icon size={16} strokeWidth={2} aria-hidden />} />
        ))}
      </SegmentedControl>
    </div>
  );
}
