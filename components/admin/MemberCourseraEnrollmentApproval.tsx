'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import ConfirmDialog from '@/components/admin/ConfirmDialog';

/**
 * Admin toggle for `User.courseraEnrollmentApproved`. Mounted from the
 * admin member detail page. The inline copy is intentionally cautious:
 * every approval translates to a paid Coursera seat the first time the
 * member clicks Enroll on /dashboard/training.
 *
 * Server route: PATCH /api/admin/members/[id]/coursera-enrollment-approval
 * Audit log: actor (admin) + subject (member) + before/after state.
 */
export default function MemberCourseraEnrollmentApproval({
  memberId,
  memberName,
  initialApproved,
  approvedAt,
  approvedByName,
  consentBlocked = false,
}: {
  memberId: string;
  memberName: string;
  initialApproved: boolean;
  approvedAt: string | null;
  /** Pretty-printed admin name for the "Last set by …" label. */
  approvedByName: string | null;
  /** Minors without guardian consent cannot have a seat activated. */
  consentBlocked?: boolean;
}) {
  const router = useRouter();
  const [approved, setApproved] = useState(initialApproved);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [enrollConfirmOpen, setEnrollConfirmOpen] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollResult, setEnrollResult] = useState<{ ok: boolean; text: string } | null>(null);

  const enrollNow = async () => {
    setEnrolling(true);
    setEnrollResult(null);
    try {
      const res = await fetch('/api/admin/coursera/enroll-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        status?: string;
        message?: string;
        courseName?: string;
        error?: string;
      };
      if (!res.ok) {
        setEnrollResult({ ok: false, text: payload.error ?? 'Enrollment failed. Try again.' });
        return;
      }
      const text =
        payload.status === 'invited'
          ? `Coursera invite sent — ${memberName} will get an email to join, then courses unlock.`
          : payload.status === 'already-enrolled'
            ? `Already enrolled${payload.courseName ? ` in ${payload.courseName}` : ''} — nothing to do.`
            : `Enrolled${payload.courseName ? ` in ${payload.courseName}` : ''}. Certificates are not recorded automatically — the member adds each one under My Certificates and staff verify it.`;
      setEnrollResult({ ok: true, text });
      router.refresh();
    } catch {
      setEnrollResult({ ok: false, text: 'Could not reach the server.' });
    } finally {
      setEnrolling(false);
      setEnrollConfirmOpen(false);
    }
  };

  const handleToggle = () => {
    const next = !approved;
    if (next) {
      // Ask once before granting — the cost guardrail. Revoking is a
      // safe action (no seat spend), so we skip the confirm there.
      setConfirmOpen(true);
      return;
    }
    void submit(next);
  };

  const submit = async (next: boolean) => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/members/${encodeURIComponent(memberId)}/coursera-enrollment-approval`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approved: next }),
        },
      );
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? 'Could not update. Please try again.');
        return;
      }
      setApproved(next);
      router.refresh();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setPending(false);
    }
  };

  return (
    <section
      style={{
        padding: '1rem',
        background: 'var(--color-light, #f7f7f7)',
        borderRadius: 'var(--radius-md, 0.5rem)',
        marginTop: '1rem',
      }}
    >
      <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem' }}>
        Coursera enrollment approval
      </h2>
      <p
        style={{
          margin: '0 0 0.75rem',
          fontSize: '0.875rem',
          lineHeight: 1.55,
          color: 'var(--color-on-surface-variant)',
        }}
      >
        Approving lets this member self-enroll in their Coursera courses. Don&apos;t
        approve unless funding is confirmed and counselor has assigned a program.
        Consent gates seat activation for minors — never signup.
      </p>
      {consentBlocked ? (
        <p
          role="status"
          style={{
            margin: '0 0 0.75rem',
            fontSize: '0.875rem',
            color: 'var(--color-error, #c83232)',
          }}
        >
          Guardian consent is required before activating a Coursera seat for this minor.
        </p>
      ) : null}
      <label
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontWeight: 600,
          cursor: pending ? 'wait' : 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={approved}
          onChange={handleToggle}
          disabled={pending || (consentBlocked && !approved)}
          aria-describedby="coursera-approval-hint"
        />
        <span>{approved ? 'Approved' : 'Not approved'}</span>
      </label>
      {approved && approvedAt && (
        <p
          id="coursera-approval-hint"
          style={{
            margin: '0.5rem 0 0',
            fontSize: '0.8125rem',
            color: 'var(--color-on-surface-variant)',
          }}
        >
          Last set: {new Date(approvedAt).toLocaleString()}
          {approvedByName ? ` by ${approvedByName}` : ''}
        </p>
      )}
      {approved && (
        <div style={{ marginTop: '0.75rem' }}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={enrolling}
            onClick={() => setEnrollConfirmOpen(true)}
          >
            {enrolling ? 'Enrolling…' : 'Enroll in Coursera now'}
          </button>
          <p
            style={{
              margin: '0.4rem 0 0',
              fontSize: '0.8125rem',
              color: 'var(--color-on-surface-variant)',
            }}
          >
            Invites them to the Coursera program and starts their first course —
            no waiting for the member to click Enroll themselves.
          </p>
        </div>
      )}
      {enrollResult && (
        <p
          role={enrollResult.ok ? 'status' : 'alert'}
          style={{
            margin: '0.5rem 0 0',
            fontSize: '0.85rem',
            color: enrollResult.ok ? 'var(--color-success, #166534)' : 'var(--color-error, #c83232)',
          }}
        >
          {enrollResult.text}
        </p>
      )}
      {error && (
        <p
          role="alert"
          style={{
            margin: '0.5rem 0 0',
            fontSize: '0.85rem',
            color: 'var(--color-error, #c83232)',
          }}
        >
          {error}
        </p>
      )}
      <ConfirmDialog
        open={enrollConfirmOpen}
        title="Enroll this member in Coursera now?"
        body={
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', whiteSpace: 'pre-line' }}>
            {`Enroll ${memberName} in their assigned program's first course?\n\nIf they're not on Coursera yet, this sends the program invite (they'll get an email). Enrollment uses a paid Coursera seat and is recorded in the audit log.`}
          </p>
        }
        confirmLabel="Enroll now"
        busy={enrolling}
        onConfirm={() => void enrollNow()}
        onCancel={() => setEnrollConfirmOpen(false)}
      />
      <ConfirmDialog
        open={confirmOpen}
        title="Approve Coursera enrollment?"
        body={
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', whiteSpace: 'pre-line' }}>
            {`Approve ${memberName} for Coursera enrollment?\n\nThis lets them self-enroll in their assigned program's courses. Each enrollment uses a paid Coursera seat. Only approve once funding is confirmed and a counselor has assigned a program.`}
          </p>
        }
        confirmLabel="Approve"
        onConfirm={() => {
          setConfirmOpen(false);
          void submit(true);
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </section>
  );
}
