import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import { CommandCenterKit } from '@/components/portal/kit/pages/admin/CommandCenterKit';
import { buildProgramHealthRows, PROGRAM_HEALTH_CAPTION } from '@/lib/admin/commandCenterHelpers';
import { toneClass } from '@/components/portal/kit';

/**
 * The program-health tone rule (#2444 leftover).
 *
 * `pct` on a program-health row is the program's share of enrolled students —
 * `PROGRAM_HEALTH_CAPTION` says in words, directly above the bars, that it is
 * "not a completion or health score". So the bars carry NO status colour:
 *
 *   - not the blanket `color: 'success'` they used to carry, which painted
 *     every program green under a heading that reads "Program health" and so
 *     re-told, in colour, the completion-score misread #2425 (S21) removed
 *     from the printed numbers;
 *   - and not a tone derived from `pct` either, which would invent a health
 *     threshold the number does not carry.
 *
 * They paint the kit's neutral accent (`.wa-kit-bar-fill`'s CSS default, no
 * inline background). `tone` stays wired up for a future caller whose rows
 * really do have a state — that half is pinned here too.
 */

const barFills = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>('.wa-kit-bar-fill'));

const ROWS = [
  { label: 'Cloud & IT', value: '312 enrolled', pct: 37 },
  { label: 'Data & AI', value: '198 enrolled', pct: 23 },
  { label: 'Skilled Trades', value: '81 enrolled', pct: 10 },
];

afterEach(cleanup);

describe('program-health bars carry no status colour', () => {
  it('renders every bar with no inline fill, so the neutral accent paints', () => {
    const { container } = render(
      <CommandCenterKit programHealth={ROWS} programHealthCaption={PROGRAM_HEALTH_CAPTION} />,
    );
    const fills = barFills(container);
    expect(fills.length).toBeGreaterThanOrEqual(ROWS.length);
    for (const fill of fills) {
      const style = fill.getAttribute('style') ?? '';
      expect(style).toMatch(/width:/);
      expect(style).not.toMatch(/background/);
    }
  });

  it('never paints a program-health bar green', () => {
    const { container } = render(<CommandCenterKit programHealth={ROWS} />);
    const fills = barFills(container);
    // Assert the selector matched before iterating: a loop over an empty
    // NodeList asserts nothing, and this repo has shipped that twice.
    expect(fills.length).toBeGreaterThanOrEqual(ROWS.length);
    for (const fill of fills) {
      expect(fill.getAttribute('style') ?? '').not.toMatch(/--wa-success/);
    }
  });

  it('puts no tone hook on a program-health row', () => {
    const { container } = render(<CommandCenterKit programHealth={ROWS} />);
    // Same guard: without this, the absence assertions below would hold
    // trivially if the bars stopped rendering altogether.
    expect(barFills(container).length).toBeGreaterThanOrEqual(ROWS.length);
    for (const tone of ['ok', 'warn', 'alert', 'danger', 'info', 'muted'] as const) {
      expect(container.querySelector(`.${toneClass(tone)!} .wa-kit-bar-fill`)).toBeNull();
    }
  });

  it('holds for the kit demo defaults, which stand in for a caller that passes nothing', () => {
    const { container } = render(<CommandCenterKit />);
    const fills = barFills(container);
    expect(fills.length).toBeGreaterThan(0);
    for (const fill of fills) {
      expect(fill.getAttribute('style') ?? '').not.toMatch(/background/);
    }
  });

  it('projects live rows with no colour or tone field at all', () => {
    const rows = buildProgramHealthRows(
      [
        { programSlug: 'cloud-it', count: 312 },
        { programSlug: 'data-ai', count: 198 },
      ],
      { limit: 5, labelFor: (slug) => slug },
    );
    expect(rows.length).toBe(2);
    for (const row of rows) {
      expect(row).not.toHaveProperty('color');
      expect(row).not.toHaveProperty('tone');
    }
  });
});

describe('the tone contract still works for rows that do have a state', () => {
  it('paints from the tone hook when a caller sets tone', () => {
    const { container } = render(
      <CommandCenterKit programHealth={[{ label: 'Skilled Trades', value: '81 enrolled', pct: 10, tone: 'warn' }]} />,
    );
    const scoped = container.querySelector<HTMLElement>(`.${toneClass('warn')!} .wa-kit-bar-fill`);
    expect(scoped).not.toBeNull();
    expect(scoped!.getAttribute('style') ?? '').toMatch(/var\(--wa-kit-tone\)/);
  });

  it('keeps the deprecated color prop working for callers that still pass it', () => {
    const { container } = render(
      <CommandCenterKit programHealth={[{ label: 'Cloud & IT', value: '312 enrolled', pct: 37, color: 'info' }]} />,
    );
    const fill = barFills(container)[0];
    expect(fill.getAttribute('style') ?? '').toMatch(/var\(--wa-info\)/);
  });

  it('lets tone win over a deprecated color on the same row', () => {
    const { container } = render(
      <CommandCenterKit programHealth={[{ label: 'Cloud & IT', value: '312 enrolled', pct: 37, tone: 'ok', color: 'info' }]} />,
    );
    const fill = barFills(container)[0];
    const style = fill.getAttribute('style') ?? '';
    expect(style).toMatch(/var\(--wa-kit-tone\)/);
    expect(style).not.toMatch(/var\(--wa-info\)/);
  });
});
