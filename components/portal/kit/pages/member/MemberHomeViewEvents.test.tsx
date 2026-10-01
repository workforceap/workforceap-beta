import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  postMemberEvent: vi.fn<(payload: { eventName: string; sourcePage?: string; metadata?: Record<string, unknown> }) => Promise<void>>(
    async () => undefined,
  ),
  trackFunnelEvent: vi.fn(),
}));
vi.mock('@/lib/events/client', () => ({ postMemberEvent: mocks.postMemberEvent }));
vi.mock('@/lib/analytics/events', () => ({ trackFunnelEvent: mocks.trackFunnelEvent }));

import { MemberHomeViewEvents } from './MemberHomeViewEvents';

/**
 * The kit home now writes the two events the legacy `DashboardHomeClient`
 * wrote. `/api/admin/metrics` counts distinct members per event name for
 * Activation Rate and weekly dashboard views, so the names, payloads and the
 * activation rule must be the legacy ones exactly.
 */
beforeEach(() => {
  mocks.postMemberEvent.mockClear();
  mocks.trackFunnelEvent.mockClear();
});
afterEach(cleanup);

describe('MemberHomeViewEvents', () => {
  it('writes member_dashboard_viewed with the legacy payload', () => {
    render(<MemberHomeViewEvents state="C" checklistAllDone={false} completedCount={0} />);
    expect(mocks.postMemberEvent).toHaveBeenCalledTimes(1);
    expect(mocks.postMemberEvent).toHaveBeenCalledWith({
      eventName: 'member_dashboard_viewed',
      sourcePage: '/dashboard',
      metadata: { state: 'C', checklistAllDone: false },
    });
    expect(mocks.trackFunnelEvent).toHaveBeenCalledWith('member_dashboard', 'dashboard_viewed', {
      state: 'C',
      checklist_all_done: false,
    });
  });

  it('also writes member_dashboard_activated once past stage A with a course completed', () => {
    render(<MemberHomeViewEvents state="D" checklistAllDone completedCount={2} programTitle="IT Support" />);
    expect(mocks.postMemberEvent.mock.calls.map(([payload]) => payload)).toEqual([
      { eventName: 'member_dashboard_viewed', sourcePage: '/dashboard', metadata: { state: 'D', checklistAllDone: true } },
      {
        eventName: 'member_dashboard_activated',
        sourcePage: '/dashboard',
        metadata: { state: 'D', completedCount: 2, programTitle: 'IT Support' },
      },
    ]);
    expect(mocks.trackFunnelEvent).toHaveBeenCalledWith('member_dashboard', 'dashboard_activated', {
      state: 'D',
      completed_count: 2,
      program: 'IT Support',
    });
  });

  it('does not activate at stage A or with no course completed', () => {
    render(<MemberHomeViewEvents state="A" checklistAllDone={false} completedCount={3} />);
    cleanup();
    render(<MemberHomeViewEvents state="D" checklistAllDone={false} completedCount={0} />);
    const names = mocks.postMemberEvent.mock.calls.map(([payload]) => payload.eventName);
    expect(names).toEqual(['member_dashboard_viewed', 'member_dashboard_viewed']);
  });

  it('fires once per mount: new props and a Strict Mode effect replay write nothing more', () => {
    const { rerender } = render(
      <StrictMode>
        <MemberHomeViewEvents state="C" checklistAllDone={false} completedCount={0} />
      </StrictMode>,
    );
    rerender(
      <StrictMode>
        <MemberHomeViewEvents state="D" checklistAllDone completedCount={1} programTitle="IT Support" />
      </StrictMode>,
    );
    expect(mocks.postMemberEvent).toHaveBeenCalledTimes(1);
    expect(mocks.trackFunnelEvent).toHaveBeenCalledTimes(1);
  });

  it('renders nothing', () => {
    const { container } = render(<MemberHomeViewEvents state="B" checklistAllDone={false} completedCount={0} />);
    expect(container.innerHTML).toBe('');
  });
});
