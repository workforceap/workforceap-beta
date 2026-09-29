import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '@/messages/en.json';
import { CounselorHomeKit } from '@/components/portal/kit/pages/counselor/CounselorHomeKit';
import { CounselorBulkFollowUp } from '@/components/portal/counselor/CounselorBulkFollowUp';
import type { PriorityQueueRow } from '@/lib/attention/counselorViews';

/**
 * WAP-193: selecting members and sending a follow-up template used to exist
 * only on /counselor/overview?ui=legacy.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/counselor/overview',
  useSearchParams: () => new URLSearchParams(),
}));

const ROW: PriorityQueueRow = {
  memberId: 'm1',
  memberName: 'Jordan Lee',
  memberEmail: 'jordan@example.org',
  enrolledProgram: null,
  bucket: 'critical',
  daysSinceLogin: 12,
  hoursWaitingReply: null,
  blockerReason: 'No login in 12 days',
  lastContactAt: null,
  flags: [],
  threadId: null,
};
const TOTALS = { critical: 1, warning: 0, ontrack: 0, total: 1 };

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, sent: 1, failed: 0 }) } as Response);
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderKit(queueRows: [] | null = []) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CounselorHomeKit
        firstName="Dana"
        assignedCount={1}
        queueRows={queueRows === null ? null : [{ memberId: 'm1', memberName: 'Jordan Lee', bucket: 'critical', blockerReason: 'No login in 12 days', enrolledProgram: null, daysSinceLogin: 12, hoursWaitingReply: null }]}
        queueTotal={1}
        bulkFollowUp={<CounselorBulkFollowUp rows={[ROW]} totals={TOTALS} />}
      />
    </NextIntlClientProvider>,
  );
}

describe('CounselorHomeKit bulk follow-up', () => {
  it('opens the bulk tool and sends a template to the selected members', async () => {
    renderKit();
    fireEvent.click(screen.getByRole('button', { name: 'Bulk follow-up (1 member)' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Jordan Lee' }));
    const toolbar = screen.getByRole('region', { name: 'Bulk follow-up toolbar' });
    const select = within(toolbar).getByRole('combobox', { name: 'Choose a template…' }) as HTMLSelectElement;
    const templateId = Array.from(select.options).find((o) => o.value)!.value;
    fireEvent.change(select, { target: { value: templateId } });
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Send follow-up' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/counselor/bulk-followup');
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ memberIds: ['m1'], templateId });
  });

  it('hides the bulk tool while the queue failed to load', () => {
    renderKit(null);
    expect(screen.queryByRole('button', { name: /Bulk follow-up/ })).toBeNull();
  });
});
