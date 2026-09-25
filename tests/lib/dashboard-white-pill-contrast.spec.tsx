import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import CertificationsEarnMoreCard from '@/components/portal/CertificationsEarnMoreCard';
import { readCss, loadRootTokens, colorOf, contrast as tokenContrast } from '@/lib/ui/cssTokenContrast.test-helpers';

/**
 * The member portal's white CTA pills keep `background: #fff` in both
 * colour modes. Their label used to be `var(--color-accent)`, which is
 * #ad2c4d in light mode (6.5:1) but #e0658a in dark mode — 3.28:1 on the
 * still-white pill. A white pill's label must clear WCAG AA on white.
 * (The mobile State A pill went with the retired ?ui=legacy home, WAP-195.)
 */

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
