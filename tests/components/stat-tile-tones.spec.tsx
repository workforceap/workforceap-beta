import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { KpiStrip, StatSparkTile, StatTile, toneClass, type KitTone } from '@/components/portal/kit';

/**
 * StatTile / KpiStrip / StatSparkTile speak KitTone and paint only through the
 * kit tone hooks (`.wa-kit-tone--*`, docs/KIT_GUIDE.md §4). The number is
 * neutral whatever the tone (WAP-99); a tone reaches the tile as the edge
 * accent (StatTile) or the icon chip + trend line (StatSparkTile). Nothing in
 * the tree carries a legacy `--color-*` or a `var(--wa-gold)`-style inline
 * colour, so dark mode never resolves an unmapped hue.
 */

const TONES: KitTone[] = ['ok', 'warn', 'alert', 'danger', 'info', 'muted'];

/** Legacy colour names and brand-hue tokens written inline (the hook variables `--wa-kit-tone*` are the sanctioned path). */
const LEGACY_INLINE = /--color-|var\(--wa-(?:gold|accent|success|info|danger|violet)(?:-dark|-soft)?\)/;

function inlineStyles(root: ParentNode): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[style]')).map((el) => el.getAttribute('style') ?? '');
}

afterEach(cleanup);

describe('StatTile on KitTone hooks', () => {
  it.each(TONES)('tone=%s declares only its own hook on the card and keeps the number neutral', (tone) => {
    const { container } = render(<StatTile label="At risk" value={3} tone={tone} />);
    const card = container.querySelector<HTMLElement>('.wa-kit-card')!;
    expect(card.classList.contains(toneClass(tone)!)).toBe(true);
    expect(card.classList.contains('wa-kit-tone-edge')).toBe(true);
    for (const other of TONES.filter((t) => t !== tone)) {
      expect(card.classList.contains(`wa-kit-tone--${other}`)).toBe(false);
    }
    const value = container.querySelector<HTMLElement>('.wa-kit-stat-value')!;
    expect(value).toHaveTextContent('3');
    expect(value.getAttribute('style')).toBeNull();
    for (const style of inlineStyles(container)) expect(style).not.toMatch(LEGACY_INLINE);
  });

  it('an untoned tile has no tone hook and no edge, and the number carries no inline colour', () => {
    const { container } = render(<StatTile label="Saved" value={0} delta="Bookmarked roles" deltaTone="muted" />);
    const card = container.querySelector<HTMLElement>('.wa-kit-card')!;
    expect(card.className).not.toMatch(/wa-kit-tone--/);
    expect(card.classList.contains('wa-kit-tone-edge')).toBe(false);
    expect(container.querySelector<HTMLElement>('.wa-kit-stat-value')!.getAttribute('style')).toBeNull();
    for (const style of inlineStyles(container)) expect(style).not.toMatch(LEGACY_INLINE);
  });

  it('the caption carries its own tone hook: ok for a trend by default, muted for a definition', () => {
    const { container } = render(
      <>
        <StatTile label="Placements YTD" value={213} delta="↑ 18 this month" />
        <StatTile label="Reply owed" value={2} tone="alert" delta="Member message waiting 24h+" deltaTone="muted" />
      </>,
    );
    const deltas = container.querySelectorAll<HTMLElement>('.wa-kit-stat-tile__delta');
    expect(deltas).toHaveLength(2);
    expect(deltas[0].classList.contains('wa-kit-tone--ok')).toBe(true);
    expect(deltas[1].classList.contains('wa-kit-tone--muted')).toBe(true);
    expect(deltas[1].classList.contains('wa-kit-tone--alert')).toBe(false);
    for (const delta of deltas) expect(delta.getAttribute('style')).toBeNull();
  });

  it('KpiStrip forwards tone and deltaTone to each tile', () => {
    const { container } = render(
      <KpiStrip
        items={[
          { label: 'Enabled', value: 4 },
          { label: 'Failing', value: 1, tone: 'danger', delta: 'retrying', deltaTone: 'warn' },
        ]}
      />,
    );
    const cards = container.querySelectorAll<HTMLElement>('.wa-kit-card');
    expect(cards).toHaveLength(2);
    expect(cards[0].className).not.toMatch(/wa-kit-tone--/);
    expect(cards[1].classList.contains('wa-kit-tone--danger')).toBe(true);
    expect(cards[1].querySelector('.wa-kit-stat-tile__delta')!.classList.contains('wa-kit-tone--warn')).toBe(true);
    for (const style of inlineStyles(container)) expect(style).not.toMatch(LEGACY_INLINE);
  });
});

describe('StatSparkTile gates on tone the same way', () => {
  it.each(TONES)('tone=%s paints the icon chip from the hook and keeps the value neutral', (tone) => {
    const { container } = render(
      <StatSparkTile icon={<span data-icon />} label="Critical risk" value={2} tone={tone} spark={{ series: [1, 2, 3] }} />,
    );
    const chip = container.querySelector<HTMLElement>('.wa-kit-tone-icon')!;
    expect(chip.closest(`.${toneClass(tone)}`)).not.toBeNull();
    expect(chip.getAttribute('style')).toBeNull();
    for (const other of TONES.filter((t) => t !== tone)) {
      expect(container.querySelector(`.wa-kit-tone--${other}`)).toBeNull();
    }
    const value = container.querySelector<HTMLElement>('.wa-kit-stat-label')!.previousElementSibling as HTMLElement;
    expect(value).toHaveTextContent('2');
    expect(value.style.color).toBe('var(--wa-text)');
    expect(container.querySelector('polyline')!.getAttribute('stroke')).toBe('var(--wa-kit-tone)');
    for (const style of inlineStyles(container)) expect(style).not.toMatch(LEGACY_INLINE);
  });

  it('an untoned tile has a neutral chip, a neutral value and the brand trend line', () => {
    const { container } = render(
      <StatSparkTile icon={<span data-icon />} label="Total referred" value={86} spark={{ series: [60, 72, 86], delta: '+8%' }} />,
    );
    expect(container.querySelector('[class*="wa-kit-tone--"]')).toBeNull();
    expect(container.querySelector<HTMLElement>('.wa-kit-tone-icon')!.getAttribute('style')).toBeNull();
    const value = container.querySelector<HTMLElement>('.wa-kit-stat-label')!.previousElementSibling as HTMLElement;
    expect(value.style.color).toBe('var(--wa-text)');
    expect(container.querySelector('polyline')!.getAttribute('stroke')).toBe('var(--wa-accent)');
    expect(container).toHaveTextContent('+8%');
  });
});
