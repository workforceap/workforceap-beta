import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

/**
 * Inspection of #2485: the strip promised "we log it ... and alert your
 * counselor" for every confirmation, but a repeat confirmation finds the
 * placement already on record and sends nothing new. The action now returns
 * the outcome and the strip says what actually happened for each case.
 */

const mocks = vi.hoisted(() => ({ confirmPlacement: vi.fn() }));
vi.mock('@/app/(portal)/dashboard/placementAction', () => ({ confirmPlacement: mocks.confirmPlacement }));

import Strip from '@/app/(portal)/dashboard/PlacementConfirmationStrip';

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const inlineStyles = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>('[style]')).map((el) => el.getAttribute('style') ?? '').join('\n');

beforeEach(() => mocks.confirmPlacement.mockReset());
afterEach(cleanup);

async function confirmAcme(outcome: 'created' | 'unchanged' | 'failed', offers = [{ id: 'o1', company: 'Acme' }]) {
  mocks.confirmPlacement.mockResolvedValue({ placementOutcome: outcome });
  const view = render(<Strip offers={offers} />);
  fireEvent.click(screen.getAllByRole('button', { name: /notify my team/ })[0]);
  const status = await screen.findByRole('status');
  return { ...view, status };
}

describe('PlacementConfirmationStrip tells the member what the confirmation did', () => {
  it('first confirmation: the placement was logged as reported and the counselor alerted', async () => {
    const { status } = await confirmAcme('created');
    expect(mocks.confirmPlacement).toHaveBeenCalledWith('o1');
    expect(status).toHaveTextContent(/Placement logged — Acme/);
    expect(status).toHaveTextContent(/logged as a placement you reported/i);
    expect(status).toHaveTextContent(/counselor has been alerted/i);
    expect(screen.queryByText(/Did you accept the role at Acme/)).toBeNull();
  });

  it('repeat confirmation: the placement is already on record and nothing new was sent', async () => {
    const { status } = await confirmAcme('unchanged');
    expect(status).toHaveTextContent(/Already on record/);
    expect(status).toHaveTextContent(/already on record from an earlier confirmation/i);
    expect(status).toHaveTextContent(/nothing new was sent to your counselor/i);
    expect(status).not.toHaveTextContent(/alerted/i);
    expect(status).not.toHaveTextContent(/we log it/i);
  });

  it('failed record write: the confirmation is saved and flagged, never called logged', async () => {
    const { status } = await confirmAcme('failed');
    expect(status).toHaveTextContent(/Saved for review/);
    expect(status).toHaveTextContent(/could not be logged automatically/i);
    expect(status).toHaveTextContent(/flagged for your team to review/i);
    expect(status).not.toHaveTextContent(/counselor has been alerted/i);
  });

  it('confirming one offer leaves the other offer question in place', async () => {
    await confirmAcme('created', [{ id: 'o1', company: 'Acme' }, { id: 'o2', company: 'Beta' }]);
    expect(screen.getByRole('status')).toHaveTextContent(/Acme/);
    expect(screen.getByText(/Did you accept the role at Beta/)).toBeInTheDocument();
    expect(screen.queryByText(/Did you accept the role at Acme/)).toBeNull();
  });

  it('the acknowledgement paints from --wa-* tokens only', async () => {
    const { status } = await confirmAcme('unchanged');
    const styles = inlineStyles(status.parentElement as HTMLElement);
    expect(styles).not.toMatch(HEX);
    expect(styles).toContain('background: var(--wa-success-dark)');
    expect((styles.match(/var\(--wa-on-success\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('legacy (default) keeps its own gutter; kit sits flush in the kit column and spaces stacked offers with a gap', () => {
    const offers = [{ id: 'o1', company: 'Acme' }, { id: 'o2', company: 'Beta' }];
    const legacy = render(<Strip offers={offers} />);
    const legacySection = legacy.container.querySelector('section') as HTMLElement;
    expect(legacySection.style.padding).toBe('0px 1.25rem');
    expect(legacySection.style.marginBottom).toBe('1.25rem');
    for (const card of Array.from(legacySection.children) as HTMLElement[]) expect(card.style.marginBottom).toBe('1rem');
    legacy.unmount();

    // WAP-188: on the kit home the column (wa-space-y-6) owns the inline edge and the gap to its neighbours.
    const kit = render(<Strip offers={offers} variant="kit" />);
    const kitSection = kit.container.querySelector('section') as HTMLElement;
    expect(kitSection.style.padding).toBe('');
    expect(kitSection.style.margin).toBe('');
    expect(kitSection.style.marginBottom).toBe('');
    expect(kitSection.style.display).toBe('grid');
    expect(kitSection.style.gap).toBe('1rem');
    const cards = Array.from(kitSection.children) as HTMLElement[];
    expect(cards).toHaveLength(2);
    for (const card of cards) expect(card.style.marginBottom).toBe('');
  });
});
