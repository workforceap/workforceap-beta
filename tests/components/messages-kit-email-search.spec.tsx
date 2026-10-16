import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Admin Messages kit (`/admin/messages`): staff often look up a thread by the
 * member's email (or local-part). Search previously matched only display name
 * and subject; the loader already had email and now passes it through.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@astryxdesign/core/SegmentedControl', () => ({
  SegmentedControl: ({
    children,
    value,
    onChange,
    label,
  }: {
    children?: ReactNode;
    value: string;
    onChange: (v: string) => void;
    label?: string;
  }) => (
    <div role="radiogroup" aria-label={label}>
      {Children.toArray(children).map((child) => {
        if (!isValidElement(child)) return null;
        const props = child.props as { value: string; label: string };
        return (
          <label key={props.value}>
            <input
              type="radio"
              name="message-filter"
              value={props.value}
              checked={value === props.value}
              onChange={() => onChange(props.value)}
              aria-label={props.label}
            />
            {props.label}
          </label>
        );
      })}
    </div>
  ),
  SegmentedControlItem: (_props: { value: string; label: string }) => null as unknown as ReactElement,
}));

vi.mock('@astryxdesign/core/Token', () => ({
  Token: ({ label }: { label: string }) => <span>{label}</span>,
}));

vi.mock('@astryxdesign/core/Card', () => ({
  Card: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

import {
  MessagesKit,
  matchesMessageSearch,
  type MessageThread,
} from '@/components/portal/kit/pages/admin-subviews/MessagesKit';

afterEach(cleanup);

const threads: MessageThread[] = [
  {
    id: 'mb',
    from: 'Michael Brown',
    email: 'michael.brown@workforceap.org',
    initials: 'MB',
    subject: 'Question about exam voucher',
    channel: 'In-app',
    unread: true,
    lastActive: '2h ago',
  },
  {
    id: 'mj',
    from: 'Michael Jones',
    email: 'michael.jones@example.com',
    initials: 'MJ',
    subject: 'Enrollment paperwork',
    channel: 'In-app',
    unread: true,
    lastActive: '3h ago',
  },
  {
    id: 'tr',
    from: 'Tanya Reed',
    email: 'tanya.reed@example.com',
    initials: 'TR',
    subject: 'Schedule change request',
    channel: 'In-app',
    lastActive: '5h ago',
  },
];

describe('matchesMessageSearch', () => {
  const row = threads[0]!;

  it('matches full email and local-part case-insensitively', () => {
    expect(matchesMessageSearch(row, 'michael.brown@workforceap.org')).toBe(true);
    expect(matchesMessageSearch(row, 'MICHAEL.BROWN')).toBe(true);
    expect(matchesMessageSearch(row, 'WorkforceAP.org')).toBe(true);
  });

  it('still matches display name and subject', () => {
    expect(matchesMessageSearch(row, 'michael brown')).toBe(true);
    expect(matchesMessageSearch(row, 'exam voucher')).toBe(true);
  });

  it('does not match unrelated queries', () => {
    expect(matchesMessageSearch(row, 'tanya')).toBe(false);
    expect(matchesMessageSearch({ ...row, email: undefined }, 'michael.brown@')).toBe(false);
  });
});

describe('MessagesKit email search', () => {
  it('filters the table by member email and shows muted email under From', () => {
    render(<MessagesKit threads={threads} unansweredCount={2} />);

    // Default filter is Unanswered — both Michaels are unread; Tanya is not.
    fireEvent.click(screen.getByRole('radio', { name: /All messages/i }));

    const table = screen.getByRole('table');
    expect(within(table).getByText('michael.brown@workforceap.org')).toBeTruthy();
    expect(within(table).getByText('michael.jones@example.com')).toBeTruthy();

    const search = screen.getByLabelText('Search messages');
    fireEvent.change(search, { target: { value: 'michael.brown@workforceap.org' } });

    expect(within(table).getByText('Michael Brown')).toBeTruthy();
    expect(within(table).queryByText('Michael Jones')).toBeNull();
    expect(within(table).queryByText('Tanya Reed')).toBeNull();

    fireEvent.change(search, { target: { value: 'michael.brown' } });
    expect(within(table).getByText('Michael Brown')).toBeTruthy();
    expect(within(table).queryByText('Michael Jones')).toBeNull();
  });

  it('advertises email in the search placeholder', () => {
    render(<MessagesKit threads={threads} />);
    expect(screen.getByPlaceholderText('Name, email, or subject')).toBeTruthy();
  });
});
