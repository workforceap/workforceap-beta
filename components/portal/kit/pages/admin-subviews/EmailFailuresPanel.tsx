'use client';

import { useState } from 'react';
import { Card } from '@astryxdesign/core/Card';
import { Button } from '@astryxdesign/core/Button';
import { DataTable, StatusTag, type KitTone } from '@/components/portal/kit';

/**
 * Failed email sends section for /admin/diagnostics (WAP-163). A section
 * (no `Kit` suffix): `DiagnosticsKit` owns the page h1 via `PageOpener`.
 *
 * Every row is a `workflow_diagnostics` `email_send` error. The page loader
 * parses the stored failure record and hands plain data across the
 * server→client boundary; this component renders it and owns the "Resend"
 * action, which POSTs to `/api/admin/email-failures/[id]/resend`. Rows
 * recorded before templates were stored render a disabled control with the
 * reason, so a human can see the backlog without being able to replay it
 * from here by accident.
 */
export interface EmailFailureRow {
  id: string;
  /** ISO timestamp of the failure. */
  createdAt: string;
  template: string | null;
  templateLabel: string | null;
  subject: string;
  to: string[];
  errorClass: string;
  retryable: boolean;
  resendable: boolean;
  failureReason: string | null;
  resentAt: string | null;
  resentOk: boolean | null;
}

export interface EmailFailuresPanelProps {
  rows: EmailFailureRow[];
  /** Failures in the alert window (matches the cron alert). */
  failures24h: number;
  windowDays: number;
  threshold: number;
}

const ERROR_TONE: Record<string, KitTone> = {
  rate_limit: 'warn',
  header_invalid: 'alert',
  provider_rejected: 'danger',
  provider_unavailable: 'warn',
  network: 'warn',
  unknown: 'muted',
};

const ERROR_LABEL: Record<string, string> = {
  rate_limit: 'Rate limited',
  header_invalid: 'Bad header',
  provider_rejected: 'Rejected',
  provider_unavailable: 'Provider down',
  network: 'Network',
  unknown: 'Unknown',
};

type RowState = { pending: boolean; message: string | null; ok: boolean | null; resentAt: string | null };

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function EmailFailuresPanel({ rows, failures24h, windowDays, threshold }: EmailFailuresPanelProps) {
  const [state, setState] = useState<Record<string, RowState>>({});

  const rowState = (id: string): RowState =>
    state[id] ?? { pending: false, message: null, ok: null, resentAt: null };

  async function resend(row: EmailFailureRow) {
    if (!row.resendable || rowState(row.id).pending) return;
    setState((prev) => ({ ...prev, [row.id]: { pending: true, message: null, ok: null, resentAt: null } }));
    try {
      const res = await fetch(`/api/admin/email-failures/${encodeURIComponent(row.id)}/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; resentAt?: string };
      if (!res.ok) {
        setState((prev) => ({
          ...prev,
          [row.id]: { pending: false, ok: false, resentAt: null, message: data.error ?? `Re-send failed (${res.status})` },
        }));
        return;
      }
      setState((prev) => ({
        ...prev,
        [row.id]: { pending: false, ok: true, resentAt: data.resentAt ?? new Date().toISOString(), message: 'Re-sent' },
      }));
    } catch {
      setState((prev) => ({
        ...prev,
        [row.id]: { pending: false, ok: false, resentAt: null, message: 'Network error, try again' },
      }));
    }
  }

  const statusFor = (row: EmailFailureRow) => {
    const local = rowState(row.id);
    const resentOk = local.ok ?? row.resentOk;
    const resentAt = local.resentAt ?? row.resentAt;
    if (resentOk === true) return { tone: 'ok' as KitTone, label: `Re-sent ${resentAt ? formatWhen(resentAt) : ''}`.trim() };
    if (resentOk === false) return { tone: 'danger' as KitTone, label: 'Re-send failed' };
    return { tone: 'alert' as KitTone, label: 'Failed' };
  };

  const headline = failures24h > threshold
    ? `${failures24h} failed in the last 24h`
    : 'No failures in the last 24h';

  return (
    <Card className="wa-mb-5" data-testid="email-failures">
      <div className="wa-flex wa-flex-col md:wa-flex-row md:wa-items-end wa-justify-between wa-gap-3 wa-mb-4">
        <div>
          <div
            style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--wa-muted)' }}
          >
            Email delivery
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: '2px 0 0', letterSpacing: '-0.02em', color: 'var(--wa-text)' }}>
            Failed sends
          </h2>
          <p style={{ fontSize: 13, color: 'var(--wa-muted)', margin: '4px 0 0' }}>
            Last {windowDays} days, newest first. Resend replays the same template with the same payload and records the outcome.
          </p>
        </div>
        <StatusTag tone={failures24h > threshold ? 'alert' : 'ok'} data-testid="email-failures-24h">
          {headline}
        </StatusTag>
      </div>

      <DataTable<EmailFailureRow>
        rows={rows}
        rowKey={(row) => row.id}
        minWidth={760}
        emptyTitle="No failed sends recorded"
        emptyDescription={`Nothing failed in the last ${windowDays} days.`}
        columns={[
          {
            key: 'when',
            header: 'When',
            render: (row) => <span style={{ whiteSpace: 'nowrap' }}>{formatWhen(row.createdAt)}</span>,
          },
          {
            key: 'template',
            header: 'Template',
            render: (row) => (
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: 'var(--wa-text)' }}>{row.templateLabel ?? row.template ?? 'Untyped'}</div>
                <div style={{ fontSize: 13, color: 'var(--wa-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
                  {row.subject}
                </div>
              </div>
            ),
          },
          {
            key: 'to',
            header: 'Recipient',
            render: (row) => <span style={{ wordBreak: 'break-all' }}>{row.to.join(', ') || '—'}</span>,
          },
          {
            key: 'error',
            header: 'Error',
            render: (row) => (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                <StatusTag tone={ERROR_TONE[row.errorClass] ?? 'muted'}>{ERROR_LABEL[row.errorClass] ?? row.errorClass}</StatusTag>
                {row.failureReason ? (
                  <span style={{ fontSize: 13, color: 'var(--wa-muted)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.failureReason}>
                    {row.failureReason}
                  </span>
                ) : null}
              </div>
            ),
          },
          {
            key: 'retryable',
            header: 'Retryable',
            render: (row) => <StatusTag tone={row.retryable ? 'info' : 'muted'}>{row.retryable ? 'Yes' : 'No'}</StatusTag>,
          },
          {
            key: 'status',
            header: 'Status',
            render: (row) => {
              const status = statusFor(row);
              return <StatusTag tone={status.tone}>{status.label}</StatusTag>;
            },
          },
          {
            key: 'action',
            header: 'Action',
            align: 'right',
            render: (row) => {
              const local = rowState(row.id);
              const alreadyOk = (local.ok ?? row.resentOk) === true;
              const disabledReason = !row.resendable
                ? 'Recorded without a template; re-send from the original workflow'
                : alreadyOk
                ? 'Already re-sent'
                : undefined;
              return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <Button
                    label={local.pending ? 'Sending…' : alreadyOk ? 'Re-sent' : 'Resend'}
                    size="sm"
                    variant={row.resendable && !alreadyOk ? 'primary' : 'ghost'}
                    isDisabled={Boolean(disabledReason) || local.pending}
                    tooltip={disabledReason}
                    onClick={() => void resend(row)}
                    data-testid={`resend-${row.id}`}
                  />
                  {disabledReason && !alreadyOk ? (
                    <span style={{ fontSize: 13, color: 'var(--wa-muted)', textAlign: 'right', maxWidth: 220 }}>{disabledReason}</span>
                  ) : null}
                  {local.message ? (
                    <span
                      role={local.ok ? 'status' : 'alert'}
                      data-testid={`resend-message-${row.id}`}
                      style={{ fontSize: 13, color: local.ok ? 'var(--wa-success)' : 'var(--wa-danger)', textAlign: 'right', maxWidth: 220 }}
                    >
                      {local.message}
                    </span>
                  ) : null}
                </div>
              );
            },
          },
        ]}
      />
    </Card>
  );
}
