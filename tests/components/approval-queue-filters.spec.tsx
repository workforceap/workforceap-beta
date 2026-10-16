import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
              name="approval-filter"
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

import {
  APPROVAL_QUEUE_PAGE_SIZE,
  CounselorApprovalQueue,
} from '@/components/portal/kit/pages/counselor/CounselorApprovalQueue';
import type { ApprovalQueue, ApprovalQueueRow } from '@/lib/counselor/approvalQueue';

afterEach(cleanup);

function makeRow(over: Partial<ApprovalQueueRow> & Pick<ApprovalQueueRow, 'key' | 'tone' | 'kind'>): ApprovalQueueRow {
  return {
    memberId: over.memberId ?? over.key,
    memberName: over.memberName ?? `Member ${over.key}`,
    memberEmail: over.memberEmail ?? `${over.key}@example.com`,
    enrolledProgram: null,
    awaiting: over.kind === 'intake' ? 'Intake verification' : 'Application decision',
    programInterest: over.kind === 'application' ? 'aws-ai' : null,
    applicationId: over.kind === 'application' ? `app-${over.key}` : null,
    detail: over.kind === 'intake' ? 'Pending' : null,
    waitingSince: new Date('2026-01-01T00:00:00.000Z'),
    daysWaiting: 5,
    businessDaysWaiting: 5,
    ageLabel: '5 days waiting',
    ...over,
  };
}

function queueWith(rows: ApprovalQueueRow[]): ApprovalQueue {
  return {
    rows,
    totals: {
      waiting: rows.length,
      overSla: rows.filter((r) => r.tone === 'warn' || r.tone === 'alert').length,
      overDoubleSla: rows.filter((r) => r.tone === 'alert').length,
    },
    slaBusinessDays: 2,
  };
}

describe('CounselorApprovalQueue filters (UI-07)', () => {
  it('filters by urgency and WIOA chips', async () => {
    const user = userEvent.setup();
    const rows = [
      makeRow({ key: 'a1', tone: 'alert', kind: 'application', memberName: 'Alert App' }),
      makeRow({ key: 'w1', tone: 'warn', kind: 'application', memberName: 'Warn App' }),
      makeRow({ key: 'i1', tone: 'muted', kind: 'intake', memberName: 'Intake Row' }),
    ];
    render(<CounselorApprovalQueue queue={queueWith(rows)} />);

    const section = screen.getByTestId('today-approval-queue');
    expect(within(section).getAllByTestId('approval-row')).toHaveLength(3);

    await user.click(screen.getByRole('radio', { name: /Overdue >4d/i }));
    expect(within(section).getAllByTestId('approval-row')).toHaveLength(1);
    expect(within(section).getByTestId('approval-row')).toHaveTextContent('Alert App');

    await user.click(screen.getByRole('radio', { name: /WIOA pending/i }));
    expect(within(section).getAllByTestId('approval-row')).toHaveLength(1);
    expect(within(section).getByTestId('approval-row')).toHaveTextContent('Intake Row');
  });

  it('paginates when more than the page size load', async () => {
    const user = userEvent.setup();
    const rows = Array.from({ length: APPROVAL_QUEUE_PAGE_SIZE + 3 }, (_, i) =>
      makeRow({ key: `r${i}`, tone: 'muted', kind: 'application', memberName: `Member ${i}` }),
    );
    render(<CounselorApprovalQueue queue={queueWith(rows)} />);

    const section = screen.getByTestId('today-approval-queue');
    expect(within(section).getAllByTestId('approval-row')).toHaveLength(APPROVAL_QUEUE_PAGE_SIZE);
    const nav = within(section).getByTestId('approval-queue-pagination');
    await user.click(within(nav).getByRole('button', { name: 'Next' }));
    expect(within(section).getAllByTestId('approval-row')).toHaveLength(3);
  });
});
