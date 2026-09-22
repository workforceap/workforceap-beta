import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import MobileStateANextStepCard from '@/app/(portal)/dashboard/_components/MobileStateANextStepCard';
import type { DashboardTranslator } from '@/app/(portal)/dashboard/_components/types';
import CertificationsEarnMoreCard from '@/components/portal/CertificationsEarnMoreCard';
import { readCss, loadRootTokens, colorOf, contrast as tokenContrast } from '@/lib/ui/cssTokenContrast.test-helpers';

/**
 * The member dashboard's white CTA pills keep `background: #fff` in both
 * colour modes. Their label used to be `var(--color-accent)`, which is
 * #ad2c4d in light mode (6.5:1) but #e0658a in dark mode — 3.28:1 on the
 * still-white pill. A white pill's label must be a fixed colour that clears
 * WCAG AA on white.
 */

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
/** jsdom serialises inline hex colours as `rgb(r, g, b)`; a `var()` stays as written. */
function cssColorToHex(value: string): string | null {
  const m = value.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (m) return '#' + m.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('');
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  return hex ? `#${hex[1].toLowerCase()}` : null;
}

const t = ((key: string) => key) as unknown as DashboardTranslator;

describe('mobile State A next-step pill', () => {
  it('pairs the white pill with a fixed label colour that clears 4.5:1', () => {
    const { getByText } = render(<MobileStateANextStepCard t={t} noApplicationOnFile />);
    const pill = getByText('startApplication').parentElement as HTMLElement;

    const bg = cssColorToHex(pill.style.background || pill.style.backgroundColor);
    const fg = cssColorToHex(pill.style.color);
    expect(bg).toBe('#ffffff');
    expect(fg, `pill label colour "${pill.style.color}" must be a fixed hex, not a mode-flipping token`).not.toBeNull();
    expect(contrast(fg as string, bg as string)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('certifications page "Earn More Credentials" pill', () => {
  it('keeps a white pill whose label clears 4.5:1 in both colour modes', () => {
    // The pill now paints from the hero-action token pair. Resolve those
    // through the real token files for both schemes: the background must stay
    // white and the label must clear AA on it in light AND dark, which is the
    // guarantee the old fixed-hex rule was standing in for.
    const { getByRole } = render(<CertificationsEarnMoreCard />);
    const pill = getByRole('link', { name: /view pathway/i });
    const style = pill.getAttribute('style') ?? '';
    const bgExpr = style.match(/(?:^|;)\s*background:\s*([^;]+)/)?.[1]?.trim();
    const fgExpr = style.match(/(?:^|;)\s*color:\s*([^;]+)/)?.[1]?.trim();
    expect(bgExpr, 'pill background').toBeTruthy();
    expect(fgExpr, 'pill label colour').toBeTruthy();
    expect(fgExpr).not.toMatch(/var\(--color-accent\)|var\(--wa-accent\)/);

    const tokens = loadRootTokens(readCss('css/wa-brand-tokens.css'), readCss('css/portal-tokens.css'));
    for (const scheme of ['light', 'dark'] as const) {
      const bg = colorOf(bgExpr as string, tokens, scheme);
      const fg = colorOf(fgExpr as string, tokens, scheme);
      expect(bg, `${scheme} pill background`).toEqual({ r: 255, g: 255, b: 255, a: 1 });
      expect(tokenContrast(fg, bg), `${scheme} label "${fgExpr}" on the white pill`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
