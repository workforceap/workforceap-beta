import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { KanbanBoard } from '@/components/portal/kit';

// WAP-253 item 4: an overflowing scroller is a keyboard tab stop. The Kanban
// scroller has no clipping ancestor, so the kit focus class on the scroller
// itself draws the shared ring. (DataTable's clipped wrap is checked in a real
// browser by tests/e2e/kit-table-focus-ring.spec.ts.)

afterEach(cleanup);

it('the KanbanBoard scroller wears the kit focus ring class', () => {
  const { container } = render(
    <KanbanBoard columns={[{ label: 'Applied', count: 1, cards: [{ id: 'c1', title: 'Candidate', meta: 'Today' }] }]} />,
  );
  expect(container.querySelector('.wa-overflow-x-auto')).toHaveClass('wa-kit-focus');
});
