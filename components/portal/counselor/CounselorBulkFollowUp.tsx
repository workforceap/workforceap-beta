'use client';

import { useId, useState } from 'react';
import CounselorPriorityQueue, { type CounselorPriorityQueueProps } from '@/components/portal/counselor/CounselorPriorityQueue';

/**
 * Bulk follow-up on the default counselor overview (WAP-193): a disclosure
 * that opens the priority queue's select-members + send-template tool, the
 * same /api/counselor/bulk-followup fan-out as the ?ui=legacy overview.
 * Collapsed by default so it doesn't repeat the "Needs attention" list.
 */
export function CounselorBulkFollowUp({ rows, totals }: CounselorPriorityQueueProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  if (rows.length === 0) return null;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <button
        type="button"
        className="btn btn-outline btn-sm wa-kit-focus"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        style={{ justifySelf: 'start' }}
      >
        {open ? 'Hide bulk follow-up' : `Bulk follow-up (${rows.length} ${rows.length === 1 ? 'member' : 'members'})`}
      </button>
      {open ? (
        <div id={panelId}>
          <CounselorPriorityQueue rows={rows} totals={totals} />
        </div>
      ) : null}
    </div>
  );
}
