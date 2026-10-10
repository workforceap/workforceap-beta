'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getProgramBySlug, PROGRAMS } from '@/lib/content/programs';

export type ProgramOption = {
  slug: string;
  name: string;
  status?: string;
  curriculumMigrationPending?: boolean;
};

type ActionFeedback = { kind: 'success' | 'error'; text: string };

async function responseError(response: Response, fallback: string): Promise<string> {
  const payload = (await response.json().catch(() => ({}))) as { error?: unknown };
  return typeof payload.error === 'string' && payload.error.trim() ? payload.error : fallback;
}

type MemberDetailActionsProps = {
  userId: string;
  memberName: string;
  enrollmentGateBlocked: boolean;
  currentProgramSlug: string | null;
  assessmentCompleted: boolean;
  programOptions: ProgramOption[];
};

export default function MemberDetailActions({
  userId,
  memberName,
  enrollmentGateBlocked,
  currentProgramSlug,
  assessmentCompleted,
  programOptions,
}: MemberDetailActionsProps) {
  const router = useRouter();
  const [programSlug, setProgramSlug] = useState(currentProgramSlug ?? '');
  const [loading, setLoading] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);

  const options: ProgramOption[] =
    programOptions.length > 0
      ? programOptions
      : PROGRAMS
          .filter((program) => (
            !program.curriculumMigrationPending || program.slug === currentProgramSlug
          ))
          .map((program) => ({
            slug: program.slug,
            name: program.title,
            curriculumMigrationPending: program.curriculumMigrationPending === true,
          }));
  const resolvedCurrentProgramSlug = currentProgramSlug
    ? getProgramBySlug(currentProgramSlug)?.slug ?? currentProgramSlug
    : null;
  const selectedProgram = options.find((option) => option.slug === programSlug);
  const assignmentBlocked = selectedProgram?.curriculumMigrationPending === true
    || Boolean(selectedProgram?.status && selectedProgram.status !== 'active');

  const handleChangeProgram = async () => {
    if (!programSlug || assignmentBlocked || programSlug === resolvedCurrentProgramSlug) return;
    const selected = options.find((o) => o.slug === programSlug);
    const label = selected?.name ?? programSlug;
    if (enrollmentGateBlocked) {
      const ok = window.confirm(
        `Enroll ${memberName} in ${label}?\n\nThis member is not yet verified for self-serve training enrollment. Admin enrollment will still work and create an admin bypass.`
      );
      if (!ok) return;
    }
    setLoading('program');
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/members/${userId}/program`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programSlug }),
      });
      if (!res.ok) {
        setFeedback({
          kind: 'error',
          text: await responseError(res, 'Could not change this member\'s program.'),
        });
        return;
      }
      setFeedback({ kind: 'success', text: `${memberName} is now assigned to ${label}.` });
      router.refresh();
    } catch {
      setFeedback({ kind: 'error', text: 'Could not reach the server.' });
    } finally {
      setLoading('');
    }
  };

  const handleResetAssessment = async () => {
    setLoading('assessment');
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/members/${userId}/reset-assessment`, { method: 'POST' });
      if (!res.ok) {
        setFeedback({
          kind: 'error',
          text: await responseError(res, 'Could not reset this assessment.'),
        });
        return;
      }
      setFeedback({ kind: 'success', text: 'Assessment reset.' });
      router.refresh();
    } catch {
      setFeedback({ kind: 'error', text: 'Could not reach the server.' });
    } finally {
      setLoading('');
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setLoading('delete');
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/members/${userId}/delete`, { method: 'POST' });
      if (!res.ok) {
        setFeedback({
          kind: 'error',
          text: await responseError(res, 'Could not delete this account.'),
        });
        return;
      }
      window.location.href = '/admin/members';
    } catch {
      setFeedback({ kind: 'error', text: 'Could not reach the server.' });
    } finally {
      setLoading('');
    }
  };

  return (
    <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {enrollmentGateBlocked && (
        <p style={{ fontSize: '0.9rem', color: 'var(--color-on-surface)', margin: 0 }}>
          WIOA status is still blocking self-serve training enrollment — admin program changes still apply and set an admin enrollment bypass.
        </p>
      )}
      <div>
        <label htmlFor="admin-member-program" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.9rem' }}>Change program (admin only)</label>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <select
            id="admin-member-program"
            value={programSlug}
            onChange={(e) => {
              setProgramSlug(e.target.value);
              setFeedback(null);
            }}
            disabled={!!loading}
            style={{ flex: 1, maxWidth: '300px', padding: '0.5rem' }}
          >
            <option value="">— Select —</option>
            {options.map((p) => (
              <option
                key={p.slug}
                value={p.slug}
                disabled={
                  p.curriculumMigrationPending === true
                  || Boolean(p.status && p.status !== 'active')
                }
              >
                {p.name}
                {'status' in p && p.status && p.status !== 'active' ? ` (${p.status})` : ''}
                {p.curriculumMigrationPending ? ' (curriculum activation pending)' : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => void handleChangeProgram()}
            disabled={
              !programSlug
              || programSlug === resolvedCurrentProgramSlug
              || assignmentBlocked
              || !!loading
            }
          >
            {loading === 'program' ? '...' : 'Save'}
          </button>
        </div>
        {assignmentBlocked ? (
          <p role="status" style={{ margin: '0.4rem 0 0', fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
            This current enrollment remains visible for continuity. It cannot be re-assigned while the program is inactive or awaiting curriculum activation.
          </p>
        ) : null}
      </div>

      {feedback ? (
        <p
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          style={{
            margin: 0,
            fontSize: '0.9rem',
            color:
              feedback.kind === 'error'
                ? 'var(--color-error, #c00)'
                : 'var(--color-success, #166534)',
          }}
        >
          {feedback.text}
        </p>
      ) : null}

      {assessmentCompleted && (
        <button
          type="button"
          className="btn btn-outline"
          onClick={handleResetAssessment}
          disabled={!!loading}
        >
          {loading === 'assessment' ? '...' : 'Reset Assessment'}
        </button>
      )}

      <div>
        <button
          type="button"
          className="btn"
          style={{ background: 'var(--color-error, #c00)', color: 'white' }}
          onClick={() => setConfirmDelete(true)}
          disabled={!!loading}
        >
          Soft Delete Account
        </button>
        {confirmDelete && (
          <div style={{ marginTop: '0.5rem' }}>
            <p style={{ marginBottom: '0.5rem', fontSize: '0.9rem' }}>Confirm soft delete?</p>
            <button type="button" className="btn btn-outline" onClick={() => setConfirmDelete(false)}>Cancel</button>
            <button type="button" className="btn" style={{ background: '#c00', color: 'white', marginLeft: '0.5rem' }} onClick={handleDelete} disabled={loading === 'delete'}>
              {loading === 'delete' ? '...' : 'Yes, Delete'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
