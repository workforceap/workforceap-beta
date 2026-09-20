'use client';

import { useState, useTransition } from 'react';
import DataTable, { type DataTableColumn } from '@/components/portal/ui/DataTable';

type PreviewRow = {
  id: string;
  fullName: string | null;
  email: string | null;
  partnerName: string | null;
  receivingUnemployment: string | null;
  layoffCompany: string | null;
  snapWic: string | null;
  /** WAP-53: staff label for the programs named after a Yes, or null. */
  publicAssistancePrograms: string | null;
  /** WAP-53: yes | no — a follow-up request, not verified enrollment. */
  publicAssistanceHelpRequested: string | null;
  hearAbout: string | null;
  screeningAt: string | null;
};

type Props = {
  previewRows: PreviewRow[];
};

const columns: DataTableColumn<PreviewRow>[] = [
  {
    key: 'name',
    header: 'Name',
    cell: (row) => <a href={`/admin/members/${row.id}`}>{row.fullName ?? '—'}</a>,
  },
  {
    key: 'email',
    header: 'Email',
    cell: (row) => row.email ?? '—',
  },
  {
    key: 'partner',
    header: 'Partner',
    cell: (row) => row.partnerName ?? '—',
  },
  {
    key: 'unemployment',
    header: 'Unemployment',
    cell: (row) => row.receivingUnemployment ?? '—',
  },
  {
    key: 'layoffCompany',
    header: 'Layoff / last employer',
    cell: (row) => row.layoffCompany ?? '—',
  },
  {
    key: 'snapWic',
    header: 'SNAP/WIC',
    cell: (row) => row.snapWic ?? '—',
  },
  {
    key: 'publicAssistancePrograms',
    header: 'Programs',
    cell: (row) => row.publicAssistancePrograms || '—',
  },
  {
    key: 'publicAssistanceHelpRequested',
    header: 'Wants help applying',
    cell: (row) => (row.publicAssistanceHelpRequested === 'yes' ? 'Yes — follow up' : row.publicAssistanceHelpRequested ?? '—'),
  },
  {
    key: 'hearAbout',
    header: 'Heard about',
    cell: (row) => row.hearAbout ?? '—',
  },
  {
    key: 'submitted',
    header: 'Submitted',
    cell: (row) => row.screeningAt ?? '—',
  },
];

/**
 * WS5: in-admin eligibility datasheet preview + CSV download + non-CHS
 * soft-reminder campaign controls. Sept 14 copy is reminder-only (no lockout).
 */
export default function EligibilityDatasheetPanel({ previewRows }: Props) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const runCampaign = (dryRun: boolean) => {
    setFeedback(null);
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/admin/members/send-eligibility-campaign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dryRun, missingScreeningOnly: true, limit: 100 }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          recipientCount?: number;
          sent?: number;
          attempted?: number;
          softDeadline?: string;
          lockout?: boolean;
        };
        if (!res.ok) {
          throw new Error(data.error ?? 'Campaign request failed');
        }
        if (dryRun) {
          setFeedback(
            `Dry run: ${data.recipientCount ?? 0} non-CHS members would get the soft ${data.softDeadline ?? 'Sept 14'} reminder (no lockout).`,
          );
        } else {
          setFeedback(
            `Sent ${data.sent ?? 0} of ${data.attempted ?? 0} eligibility links (soft ${data.softDeadline ?? 'Sept 14'} reminder — accounts stay active).`,
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Campaign request failed');
      }
    });
  };

  return (
    <div className="portal-card portal-card--flat" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <div style={{ padding: '0.5rem', background: 'rgba(173,44,77,0.1)', borderRadius: '0.5rem' }}>
          <span
            className="material-symbols-outlined"
            style={{ color: 'var(--color-accent)', fontSize: '1.25rem' }}
            aria-hidden="true"
          >
            table_chart
          </span>
        </div>
        <div>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--color-on-surface)', margin: 0 }}>
            Eligibility screening datasheet
          </h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0.125rem 0 0' }}>
            WS4 fields (unemployment, layoff/last employer, SNAP/WIC plus which programs and help requested, hear-about, ambassador) · CSV export
            in-admin (not Google Sheets). Member Training Report also includes these columns.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '1.25rem' }}>
        <a
          href="/api/admin/export/eligibility"
          download
          className="btn btn-outline"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }} aria-hidden="true">
            download
          </span>
          Download eligibility CSV
        </a>
        <button
          type="button"
          disabled={isPending}
          onClick={() => runCampaign(true)}
          className="btn btn-outline"
          style={{ cursor: isPending ? 'wait' : 'pointer' }}
        >
          {isPending ? 'Working…' : 'Preview non-CHS campaign (dry run)'}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            if (
              typeof window !== 'undefined' &&
              !window.confirm(
                'Send soft Sept 14 eligibility reminders to up to 100 non-CHS members missing screening? Accounts are NOT disabled for non-response.',
              )
            ) {
              return;
            }
            runCampaign(false);
          }}
          className="btn"
          style={{
            background: 'var(--color-accent)',
            color: '#fff',
            border: 'none',
            cursor: isPending ? 'wait' : 'pointer',
          }}
        >
          {isPending ? 'Sending…' : 'Send non-CHS eligibility campaign'}
        </button>
      </div>

      <p style={{ fontSize: '0.8rem', color: 'var(--color-on-surface-variant)', margin: '0 0 1rem' }}>
        Campaign excludes Concordia High School (CHS) referrals. Soft deadline language only — no hard lockout
        if members miss September 14.
      </p>

      {feedback ? (
        <p role="status" style={{ color: 'var(--color-green, #15803d)', fontSize: '0.875rem' }}>
          {feedback}
        </p>
      ) : null}
      {error ? (
        <p role="alert" style={{ color: 'rgb(153,27,27)', fontSize: '0.875rem' }}>
          {error}
        </p>
      ) : null}

      <div style={{ marginTop: '0.75rem' }}>
        <DataTable<PreviewRow>
          variant="admin"
          tableClassName="admin-table"
          density="compact"
          rows={previewRows}
          rowKey={(row) => row.id}
          columns={columns}
          emptyState={
            <p style={{ padding: '0.75rem', color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem' }}>
              No eligibility screenings yet.
            </p>
          }
        />
      </div>
    </div>
  );
}
