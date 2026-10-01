import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }));
vi.mock('@astryxdesign/core/CommandPalette', () => ({
  CommandPalette: () => null,
  CommandPaletteInput: () => null,
}));
vi.mock('@astryxdesign/core/Badge', () => ({ Badge: ({ label }: { label: string }) => <span>{label}</span> }));
vi.mock('@astryxdesign/core/Text', () => ({ Text: ({ children }: { children?: React.ReactNode }) => <span>{children}</span> }));
vi.mock('@astryxdesign/core/Button', () => ({ Button: ({ label }: { label: string }) => <button type="button">{label}</button> }));
vi.mock('@/lib/admin/globalSearchSource', () => ({
  createGlobalSearchSource: () => ({ cancel: vi.fn(), resolveHref: () => null }),
}));

import GlobalSearch from '@/components/portal/GlobalSearch';
import VoiceAgentSurface from '@/components/portal/VoiceAgentSurface';
import { partnerVoiceSurface, readinessVoiceSurface } from '@/lib/portal/voice';

afterEach(cleanup);

/**
 * Scout 2026-09-22 D4 / D5 — two labels the audit measured under AA from the
 * rendered colours:
 *
 *   - The ⌘K hint inside the rail search button painted `--wa-muted`
 *     (#6b6b6b), 3.14:1 on the admin rail's dark search button (#2b1820). It
 *     now inherits the button's own text colour: `--wa-text` on the surface
 *     button (17.4:1) and the admin rule's `--wa-sidebar-label` (4.85:1).
 *   - The gold voice surfaces (partner assistant, readiness) painted their
 *     badge in the glow colour, brand gold #a47f38: 3.7:1 on white. The badge
 *     reads `--wa-gold-dark`, the text-on-gold token (5.9:1 light / 9.0:1
 *     dark); the ring and glow keep the brand gold.
 */

describe('⌘K hint inherits the search button colour', () => {
  it('carries no muted colour of its own', () => {
    render(<GlobalSearch />);
    const hint = screen.getByText('⌘K');
    expect(hint.tagName).toBe('KBD');
    expect(hint.style.color).toBe('inherit');
    expect(hint.style.color).not.toBe('var(--wa-muted)');
    const button = hint.closest('button')!;
    expect(button.style.color).toBe('var(--wa-text)');
  });
});

describe('gold voice surfaces paint the badge from the text-on-gold token', () => {
  it.each([
    ['partnerVoiceSurface', partnerVoiceSurface],
    ['readinessVoiceSurface', readinessVoiceSurface],
  ] as const)('%s: badge is --wa-gold-dark; glow stays brand gold', (_name, surface) => {
    const { container } = render(
      <VoiceAgentSurface {...surface}>
        <p>panel</p>
      </VoiceAgentSurface>,
    );
    const badge = screen.getByText(surface.badge);
    expect(badge.style.color).toBe('var(--wa-gold-dark)');
    expect(badge.style.color).not.toBe(surface.glowColor);
    const ring = container.firstElementChild as HTMLElement;
    expect(ring.style.boxShadow).toContain(surface.glowColor);
  });
});
