'use client';

import { useEffect, useRef } from 'react';
import { trackFunnelEvent } from '@/lib/analytics/events';
import { postMemberEvent } from '@/lib/events/client';
import type { DashboardViewFacts } from '@/lib/member/loadMemberDashboardHome';

/**
 * Writes the member home's view / activation events from the kit home, the
 * two rows the legacy `DashboardHomeClient` wrote on mount.
 *
 * `/api/admin/metrics` derives weekly dashboard views and the Activation Rate
 * from `member_dashboard_viewed` / `member_dashboard_activated`, and
 * `lib/admin/healthScore.ts` counts them as member activity, so the payloads,
 * the GTM funnel steps and the activation rule ("past stage A with a course
 * completed") are the legacy ones, fed by the loader's `dashboardViewFacts`.
 *
 * Fires once per mount: the ref keeps a props change (a `router.refresh()`
 * after a server action) or a Strict Mode effect replay from writing a second
 * view. Legacy did not skip the read-only portal audit, so neither does this.
 * Renders nothing.
 */
export function MemberHomeViewEvents({ state, checklistAllDone, completedCount, programTitle }: DashboardViewFacts) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    trackFunnelEvent('member_dashboard', 'dashboard_viewed', { state, checklist_all_done: checklistAllDone });
    void postMemberEvent({
      eventName: 'member_dashboard_viewed',
      sourcePage: '/dashboard',
      metadata: { state, checklistAllDone },
    });
    if (state !== 'A' && completedCount >= 1) {
      trackFunnelEvent('member_dashboard', 'dashboard_activated', {
        state,
        completed_count: completedCount,
        program: programTitle,
      });
      void postMemberEvent({
        eventName: 'member_dashboard_activated',
        sourcePage: '/dashboard',
        metadata: { state, completedCount, programTitle },
      });
    }
  }, [state, checklistAllDone, completedCount, programTitle]);

  return null;
}
