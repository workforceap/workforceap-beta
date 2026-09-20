'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { Pagination } from '@astryxdesign/core/Pagination';
import { adminQueueHref, type AdminQueueKey } from '@/lib/admin/commandCenterHelpers';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import ApplicantTriageChip from '@/components/admin/ApplicantTriageChip';
import type {
  AdminApplicationPendingRow,
  AdminAtRiskRow,
  AdminCommandCenter,
  AdminInterviewingRow,
  AdminNeedsReplyRow,
} from '@/lib/admin/commandCenter';
import { programDisplayTitle } from '@/lib/content/programTitle';
import { describeInactivity } from '@/lib/counselor/lastActivity';
import { DENIAL_REASON_REQUIRED_MESSAGE, isMissingDenialReason } from '@/lib/wioa/denialReason';

type ReviewStatus = 'APPROVED' | 'NEEDS_INFO' | 'DENIED';

const REVIEW_ACTIONS: Array<{ status: ReviewStatus; label: string; tone: 'primary' | 'outline' | 'danger' }> = [
  { status: 'APPROVED', label: 'Approve', tone: 'primary' },
  { status: 'NEEDS_INFO', label: 'Ask for info', tone: 'outline' },
  { status: 'DENIED', label: 'Not a fit', tone: 'danger' },
];

const BULK_LABEL: Record<ReviewStatus, string> = {
  APPROVED: 'Approve',
  NEEDS_INFO: 'Ask for info',
  DENIED: 'Not a fit',
};

const UNCERTAIN_REVIEW = 'The review response could not be confirmed. Reload the queue before retrying; some items may have completed.';

export default function AdminCommandCenterClient({ data }: { data: AdminCommandCenter }) {
  const router = useRouter();
  const total =
    data.totals.needsReplyCount +
    data.totals.atRiskCount +
    data.totals.interviewingCount +
    data.totals.applicationsPendingCount;
  const pagination = data.pagination;
  const showQueue = (queue: AdminQueueKey) => !pagination || pagination.queue === queue;
  const oldest = data.totals.oldestPendingApplicationDays;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<ReviewStatus | null>(null);
  const [attested, setAttested] = useState(false);
  // WAP-184 G-3: a bulk denial carries one written reason for the batch; the
  // server refuses the batch without it, so the dialog collects it up front.
  const [bulkReason, setBulkReason] = useState('');
  const bulkReasonMissing = bulkAction === 'DENIED' && isMissingDenialReason('application_decision', bulkAction, bulkReason);
  const [bulkPending, startBulkTransition] = useTransition();
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<string | null>(null);
  // Closing/reopening the dialog does not make an ambiguous write safe to retry.
  // A fresh server queue snapshot is required before another submission.
  const [uncertainSnapshot, setUncertainSnapshot] = useState<AdminCommandCenter | null>(null);
  const outcomeUncertain = uncertainSnapshot === data;

  const pendingIds = useMemo(() => data.applicationsPending.map((r) => r.applicationId), [data.applicationsPending]);
  const activeSelected = useMemo(() => new Set(pendingIds.filter((id) => selected.has(id))), [pendingIds, selected]);
  const allSelected = pendingIds.length > 0 && pendingIds.every((id) => selected.has(id));

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      if (allSelected) return new Set();
      return new Set(pendingIds);
    });
  }

  function openBulk(status: ReviewStatus) {
    setBulkError(outcomeUncertain ? UNCERTAIN_REVIEW : null);
    setBulkResult(null);
    setAttested(false);
    setBulkAction(status);
  }

  function submitBulk() {
    if (!bulkAction || outcomeUncertain) return;
    const ids = pendingIds.filter((id) => selected.has(id));
    if (ids.length === 0) return;
    setBulkError(null);
    startBulkTransition(async () => {
      try {
        const response = await fetch('/api/admin/applications/bulk-review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            applicationIds: ids,
            status: bulkAction,
            notes: bulkAction === 'DENIED'
              ? bulkReason.trim()
              : `Bulk-reviewed from Command Center (${ids.length} application${ids.length === 1 ? '' : 's'}).`,
            verified: bulkAction === 'APPROVED' ? attested : undefined,
          }),
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) {
          // A server/proxy failure can arrive after one or more reviews commit.
          if (response.status >= 500 || response.status === 408) throw new Error('Unconfirmed review outcome');
          setBulkError(typeof json.error === 'string' ? json.error : 'Bulk review failed. Try again.');
          return;
        }
        if (!Number.isInteger(json.processedCount) || json.processedCount < 0
          || !Number.isInteger(json.failedCount) || json.failedCount < 0
          || json.processedCount + json.failedCount !== ids.length
          || !Array.isArray(json.failures) || json.failures.length !== json.failedCount
          || !json.failures.every((failure: unknown) => failure != null && typeof failure === 'object'
            && 'applicationId' in failure && typeof failure.applicationId === 'string' && ids.includes(failure.applicationId))
          || new Set(json.failures.map((failure: { applicationId: string }) => failure.applicationId)).size !== json.failedCount) {
          throw new Error('Missing or inconsistent review receipt');
        }
        setBulkResult(
          `${BULK_LABEL[bulkAction]}: ${json.processedCount} done${
            json.failedCount ? `, ${json.failedCount} failed` : ''
          }.`,
        );
        const failedIds = new Set<string>((json.failures ?? []).map((failure: { applicationId: string }) => failure.applicationId));
        setSelected(new Set(ids.filter((id) => failedIds.has(id))));
        setBulkAction(null);
        setBulkReason('');
        router.refresh();
      } catch {
        setUncertainSnapshot(data);
        setBulkError(UNCERTAIN_REVIEW);
      }
    });
  }

  return (
    <div style={{ padding: '0 1.5rem 2rem' }}>
      <section
        className="portal-card portal-card--flat"
        style={{
          padding: '1.25rem',
          marginBottom: '1.25rem',
          border: '1px solid color-mix(in srgb, var(--color-accent) 22%, var(--outline-variant))',
          background: 'var(--wa-surface)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <p style={{ margin: 0, fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 800, color: 'var(--color-accent)' }}>
              Today&apos;s walk-in plan
            </p>
            <h2 style={{ margin: '0.25rem 0 0', fontSize: 'clamp(1.35rem, 4vw, 2rem)', lineHeight: 1.1 }}>
              {total === 0 ? 'No pending items in these queues.' : `${total} ${total === 1 ? 'item needs' : 'items need'} a next step`}
            </h2>
            <p style={{ margin: '0.45rem 0 0', color: 'var(--color-on-surface-variant)', maxWidth: '48rem' }}>
              Replies, check-ins, interview opportunities, and applications for your organization. A member may appear in more than one queue.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(7.5rem, 1fr))', gap: '0.6rem', minWidth: 'min(100%, 20rem)' }}>
            <Metric label="Needs reply" value={data.totals.needsReplyCount} />
            <Metric label="At risk" value={data.totals.atRiskCount} />
            <Metric label="Interviewing" value={data.totals.interviewingCount} />
            <Metric label="Applications" value={data.totals.applicationsPendingCount} accent={oldest != null && oldest >= 7} />
          </div>
        </div>
        {oldest != null ? (
          <p style={{ margin: '1rem 0 0', fontSize: '0.9rem', color: oldest >= 7 ? 'var(--color-accent)' : 'var(--color-on-surface-variant)', fontWeight: oldest >= 7 ? 700 : 500 }}>
            Oldest pending application: {oldest === 0 ? 'submitted today' : `${oldest} ${oldest === 1 ? 'day' : 'days'} old`}.
          </p>
        ) : null}
      </section>

      {pagination ? <p><Link href="/admin/command-center">All queues</Link></p> : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 20rem), 1fr))', gap: '1rem' }}>
        {showQueue('needs-reply') && <Bucket queue="needs-reply" pagination={pagination} title="Needs Reply" count={data.totals.needsReplyCount} icon="mark_email_unread" empty="No member messages waiting for a reply.">
          {data.needsReply.map((row) => <NeedsReplyCard key={row.threadId} row={row} />)}
        </Bucket>}

        {showQueue('at-risk') && <Bucket queue="at-risk" pagination={pagination} title="At Risk" count={data.totals.atRiskCount} icon="warning" empty="No enrolled students have gone quiet for 14+ days.">
          {data.atRisk.map((row) => <AtRiskCard key={row.memberId} row={row} />)}
        </Bucket>}

        {showQueue('interviewing') && <Bucket queue="interviewing" pagination={pagination} title="Interview prep" count={data.totals.interviewingCount} icon="record_voice_over" empty="No active interviews or offers to prep right now.">
          {data.interviewing.map((row) => <InterviewingCard key={`${row.memberId}-${row.company}-${row.role}`} row={row} />)}
        </Bucket>}

        {showQueue('applications') && <Bucket queue="applications" pagination={pagination} title="Applications Pending" count={data.totals.applicationsPendingCount} icon="assignment_ind" empty="No applications are waiting for review.">
          {data.applicationsPending.length > 0 ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.6rem',
                flexWrap: 'wrap',
                padding: '0.5rem 0.6rem',
                marginBottom: '0.25rem',
                background: 'var(--surface-container-low)',
                border: '1px solid var(--outline-variant)',
                borderRadius: '0.6rem',
              }}
            >
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                {activeSelected.size > 0 ? `${activeSelected.size} selected` : 'Select this page'}
              </label>
              {activeSelected.size > 0 ? (
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  {REVIEW_ACTIONS.map((action) => (
                    <button
                      key={action.status}
                      type="button"
                      className={`btn btn-sm ${action.tone === 'primary' ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => openBulk(action.status)}
                      style={action.tone === 'danger' ? { borderColor: '#fecaca', color: '#b91c1c' } : undefined}
                    >
                      {action.label} ({activeSelected.size})
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          {bulkResult ? <p role="status" style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: '#166534' }}>{bulkResult}</p> : null}
          {data.applicationsPending.map((row) => (
            <ApplicationCard
              key={row.applicationId}
              row={row}
              selected={activeSelected.has(row.applicationId)}
              onToggleSelect={() => toggleOne(row.applicationId)}
            />
          ))}
        </Bucket>}
      </div>

      <ConfirmDialog
        open={bulkAction != null}
        title={
          bulkAction
            ? `${BULK_LABEL[bulkAction]} ${activeSelected.size} application${activeSelected.size === 1 ? '' : 's'}?`
            : 'Bulk review'
        }
        danger={bulkAction === 'DENIED'}
        busy={bulkPending}
        confirmDisabled={outcomeUncertain || bulkReasonMissing}
        body={
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
              {bulkAction === 'APPROVED'
                ? `This approves ${activeSelected.size} member${activeSelected.size === 1 ? '' : 's'} at once and sends each their application decision email.`
                : bulkAction === 'DENIED'
                  ? `This marks ${activeSelected.size} application${activeSelected.size === 1 ? '' : 's'} as not a fit and emails each applicant.`
                  : `This asks ${activeSelected.size} applicant${activeSelected.size === 1 ? '' : 's'} for more information.`}
            </p>
            {bulkAction === 'APPROVED' ? (
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={attested}
                  onChange={(e) => {
                    setAttested(e.target.checked);
                    if (e.target.checked && !outcomeUncertain) setBulkError(null);
                  }}
                  style={{ marginTop: '0.2rem' }}
                />
                <span>I reviewed eligibility for these applicants before approving.</span>
              </label>
            ) : null}
            {bulkAction === 'DENIED' ? (
              <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.85rem' }}>
                <span style={{ fontWeight: 600 }}>Reason (required, recorded with each decision)</span>
                <textarea
                  value={bulkReason}
                  onChange={(e) => setBulkReason(e.target.value)}
                  rows={3}
                  required
                  aria-required="true"
                  placeholder="Why these applications are not a fit"
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', fontFamily: 'inherit' }}
                />
              </label>
            ) : null}
            {bulkError ? <p role="alert" style={{ margin: 0, fontSize: '0.8rem', color: '#b91c1c' }}>{bulkError}</p> : null}
            {outcomeUncertain ? (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => {
                setBulkAction(null);
                router.refresh();
              }}>Reload queue</button>
            ) : null}
          </div>
        }
        confirmLabel={bulkAction ? BULK_LABEL[bulkAction] : 'Confirm'}
        onConfirm={() => {
          if (bulkAction === 'APPROVED' && !attested) {
            setBulkError('Check the box confirming you reviewed eligibility before approving.');
            return;
          }
          if (bulkReasonMissing) {
            setBulkError(DENIAL_REASON_REQUIRED_MESSAGE);
            return;
          }
          submitBulk();
        }}
        onCancel={() => {
          if (!bulkPending) {
            setBulkAction(null);
            setBulkReason('');
          }
        }}
      />
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div style={{ borderRadius: '0.75rem', background: 'var(--wa-surface)', border: '1px solid var(--outline-variant)', padding: '0.75rem' }}>
      <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', fontWeight: 700 }}>{label}</p>
      <p style={{ margin: '0.1rem 0 0', fontSize: '1.45rem', fontWeight: 800, color: accent ? 'var(--color-accent)' : 'var(--color-on-surface)' }}>
        {value}
      </p>
    </div>
  );
}

function Bucket({ title, count, icon, empty, children, queue, pagination }: {
  title: string; count: number; icon: string; empty: string; children: React.ReactNode;
  queue: AdminQueueKey; pagination?: AdminCommandCenter['pagination'];
}) {
  const router = useRouter();
  return (
    <section className="portal-card portal-card--flat" style={{ padding: '1rem', minHeight: '14rem' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.9rem' }}>
        <span className="material-symbols-outlined" aria-hidden style={{ color: 'var(--color-accent)' }}>{icon}</span>
        <h2 style={{ flex: 1, margin: 0, fontSize: '1rem', fontWeight: 800 }}>{title}</h2>
        <span aria-label={`${count} items`} style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
      </header>
      {count === 0 ? (
        <p style={{ margin: 0, color: 'var(--color-on-surface-variant)', fontSize: '0.9rem' }}>{empty}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>{children}</div>
      )}
      {pagination ? (
        <Pagination page={pagination.page} pageSize={pagination.pageSize} totalItems={count}
          onChange={(page) => router.push(adminQueueHref(queue, page))} variant="count" size="sm" label={`${title} pages`} />
      ) : count > 0 ? <p><Link href={adminQueueHref(queue)}>View all {count} items</Link></p> : null}
    </section>
  );
}

function NeedsReplyCard({ row }: { row: AdminNeedsReplyRow }) {
  return (
    <ActionCard
      name={row.memberName}
      meta={`${formatHours(row.hoursWaiting)} waiting`}
      detail={row.lastMessageBody}
      href={`/admin/members/${row.memberId}`}
      action="Open student"
      urgent={row.hoursWaiting >= 48}
    />
  );
}

function AtRiskCard({ row }: { row: AdminAtRiskRow }) {
  return (
    <ActionCard
      name={row.memberName}
      meta={`${row.reason ?? "Saved risk alert"} · ${describeInactivity(row.daysInactive)}`}
      detail={row.enrolledProgram
        ? `Program: ${programDisplayTitle(row.enrolledProgram)}`
        : 'No program label recorded'}
      href={`/admin/members/${row.memberId}`}
      action="Check in"
      urgent={(row.riskScore ?? 0) >= 70}
    />
  );
}

function InterviewingCard({ row }: { row: AdminInterviewingRow }) {
  return (
    <ActionCard
      name={row.memberName}
      meta={`${row.statusLabel} · ${row.company}`}
      detail={`${row.role}${row.nextInterviewDate ? ` · ${formatDate(row.nextInterviewDate)}` : ''}`}
      href={`/admin/members/${row.memberId}`}
      action="Prep them"
    />
  );
}

function ApplicationCard({
  row,
  selected,
  onToggleSelect,
}: {
  row: AdminApplicationPendingRow;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  return (
    <article style={{ border: '1px solid var(--outline-variant)', borderRadius: '0.75rem', padding: '0.85rem', background: 'var(--surface-container-low)' }}>
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', minWidth: 0 }}>
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            aria-label={`Select ${row.memberName}`}
            style={{ marginTop: '0.3rem', flexShrink: 0 }}
          />
          <div style={{ minWidth: 0 }}>
            <Link href={`/admin/members/${row.memberId}`} style={{ color: 'var(--color-on-surface)', textDecoration: 'none', fontWeight: 800 }}>
              {row.memberName}
            </Link>
            <p style={{ margin: '0.2rem 0 0', color: 'var(--color-on-surface-variant)', fontSize: '0.82rem' }}>
              {row.programLabel} · {row.statusLabel}
            </p>
            {row.triage ? (
              <p style={{ margin: '0.3rem 0 0' }}>
                <ApplicantTriageChip bucket={row.triage.bucket} label={row.triage.label} reasons={row.triage.reasons} />
              </p>
            ) : null}
            <p style={{ margin: '0.2rem 0 0', color: row.submittedDaysAgo != null && row.submittedDaysAgo >= 7 ? 'var(--color-accent)' : 'var(--color-on-surface-variant)', fontSize: '0.82rem', fontWeight: row.submittedDaysAgo != null && row.submittedDaysAgo >= 7 ? 700 : 500 }}>
              {row.submittedDaysAgo == null ? 'Submitted recently' : row.submittedDaysAgo === 0 ? 'Submitted today' : `Submitted ${row.submittedDaysAgo}d ago`}
            </p>
          </div>
        </div>
        <a className="btn btn-outline btn-sm" href={row.emailPacket.mailto} style={{ whiteSpace: 'nowrap' }}>
          Email packet
        </a>
      </div>
      {row.recommendedCareerTitle ? (
        <p style={{ margin: '0.55rem 0 0', fontSize: '0.82rem', color: 'var(--color-on-surface-variant)' }}>
          Career match: {row.recommendedCareerTitle}
        </p>
      ) : null}
      <ReviewButtons applicationId={row.applicationId} applicantName={row.memberName} />
    </article>
  );
}

function ReviewButtons({ applicationId, applicantName }: { applicationId: string; applicantName: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const note = useMemo(() => `Reviewed from Dad Command Center for ${applicantName}.`, [applicantName]);
  // WAP-184 G-3: "Not a fit" first reveals a required reason field; the
  // canned note above is not a reason and the server would refuse it.
  const [denialReason, setDenialReason] = useState('');
  const [denialOpen, setDenialOpen] = useState(false);

  function review(status: ReviewStatus) {
    setError(null);
    setDone(null);
    if (status === 'DENIED' && !denialOpen) {
      setDenialOpen(true);
      return;
    }
    if (isMissingDenialReason('application_decision', status, denialReason)) {
      setError(DENIAL_REASON_REQUIRED_MESSAGE);
      return;
    }
    const notes = status === 'DENIED' ? denialReason.trim() : note;
    startTransition(async () => {
      const response = await fetch(`/api/admin/members/${applicationId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, notes }),
      });
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        setError(typeof json.error === 'string' ? json.error : 'Review did not save. Open the student and try again.');
        return;
      }
      setDone(status === 'APPROVED' ? 'Approved' : status === 'NEEDS_INFO' ? 'Marked needs info' : 'Marked not a fit');
      setDenialOpen(false);
      setDenialReason('');
      router.refresh();
    });
  }

  return (
    <div style={{ marginTop: '0.75rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
        {REVIEW_ACTIONS.map((action) => (
          <button
            key={action.status}
            type="button"
            className={`btn btn-sm ${action.tone === 'primary' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => review(action.status)}
            disabled={isPending}
            style={action.tone === 'danger' ? { borderColor: '#fecaca', color: '#b91c1c' } : undefined}
          >
            {isPending ? 'Saving…' : action.status === 'DENIED' && denialOpen ? 'Confirm not a fit' : action.label}
          </button>
        ))}
      </div>
      {denialOpen ? (
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginTop: '0.5rem', fontSize: '0.8rem' }}>
          <span style={{ fontWeight: 600 }}>Reason (required)</span>
          <textarea
            value={denialReason}
            onChange={(e) => setDenialReason(e.target.value)}
            rows={2}
            required
            aria-required="true"
            placeholder={`Why ${applicantName} is not a fit`}
            style={{ width: '100%', padding: '0.4rem', borderRadius: '6px', fontFamily: 'inherit' }}
          />
        </label>
      ) : null}
      {done ? <p role="status" style={{ margin: '0.4rem 0 0', fontSize: '0.78rem', color: '#166534' }}>{done}</p> : null}
      {error ? <p role="alert" style={{ margin: '0.4rem 0 0', fontSize: '0.78rem', color: '#b91c1c' }}>{error}</p> : null}
    </div>
  );
}

function ActionCard({ name, meta, detail, href, action, urgent }: { name: string; meta: string; detail?: string | null; href: string; action: string; urgent?: boolean }) {
  return (
    <Link href={href} style={{ display: 'block', padding: '0.85rem', borderRadius: '0.75rem', textDecoration: 'none', color: 'inherit', background: urgent ? 'color-mix(in srgb, var(--color-accent) 7%, white)' : 'var(--surface-container-low)', border: urgent ? '1px solid color-mix(in srgb, var(--color-accent) 24%, transparent)' : '1px solid var(--outline-variant)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</p>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: urgent ? 'var(--color-accent)' : 'var(--color-on-surface-variant)', fontWeight: urgent ? 700 : 500 }}>{meta}</p>
          {detail ? <p style={{ margin: '0.25rem 0 0', color: 'var(--color-on-surface-variant)', fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detail}</p> : null}
        </div>
        <span style={{ flexShrink: 0, color: 'var(--color-accent)', fontSize: '0.8rem', fontWeight: 800 }}>{action} →</span>
      </div>
    </Link>
  );
}

function formatHours(hours: number): string {
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function formatDate(value: Date | string): string {
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(value));
}
