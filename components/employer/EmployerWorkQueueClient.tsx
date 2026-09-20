'use client';

import { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Briefcase, UserRound, TriangleAlert, Clock, CalendarClock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';
import { statusLabel } from '@/lib/employer/statusLabel';
import { QueueRow, WorkQueueItem, StatusTag, type QueueTone, type KitTone } from '@/components/portal/kit';

export type WqApp = {
  id: string;
  jobId: string;
  status: string;
  appliedAt: string;
  jobTitle: string;
  studentName: string;
  studentId: string;
};

export type WqJob = {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
};

type Focus = 'all' | 'review' | 'stale' | 'interview';

const APPLICATION_UPDATE_FAILED = 'Could not update this application. Please try again.';
type SectionId = 'review' | 'stale' | 'interview';

const SECTION_TONE: Record<SectionId, QueueTone> = {
  review: 'red',
  stale: 'red',
  interview: 'blue',
};

const SECTION_STATUS_TONE: Record<SectionId, KitTone> = {
  review: 'alert',
  stale: 'danger',
  interview: 'info',
};

/** Small pill CTA, styled with kit tokens (mirrors EmployerHomeKit's "Post a role" action). */
function pillButton({
  label,
  busy,
  disabled,
  onClick,
  variant = 'accent',
}: {
  label: string;
  busy?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  variant?: 'accent' | 'outline';
}) {
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 14px',
    minHeight: 36,
    fontWeight: 700,
    fontSize: 13,
    borderRadius: 999,
    textDecoration: 'none',
    border: '1px solid transparent',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  } as const;
  const style =
    variant === 'accent'
      ? { ...base, background: 'var(--wa-accent)', color: 'var(--wa-on-accent)' }
      : { ...base, background: 'var(--wa-surface)', color: 'var(--wa-text)', borderColor: 'var(--wa-border)' };
  return (
    <button type="button" className="wa-kit-focus" disabled={disabled} onClick={onClick} style={style}>
      {busy ? '…' : label}
    </button>
  );
}

function pillLink({
  href,
  label,
  variant = 'accent',
}: {
  href: string;
  label: string;
  variant?: 'accent' | 'outline';
}) {
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 14px',
    minHeight: 36,
    fontWeight: 700,
    fontSize: 13,
    borderRadius: 999,
    textDecoration: 'none',
    border: '1px solid transparent',
  } as const;
  const style =
    variant === 'accent'
      ? { ...base, background: 'var(--wa-accent)', color: 'var(--wa-on-accent)' }
      : { ...base, background: 'var(--wa-surface)', color: 'var(--wa-text)', borderColor: 'var(--wa-border)' };

  return (
    <Link href={href} className="wa-kit-focus" style={style}>
      {label}
    </Link>
  );
}

export default function EmployerWorkQueueClient({
  needsReviewTodayApps,
  jobsAwaitingPublish,
  staleApps,
  interviewPending,
  initialFocus = 'all',
}: {
  needsReviewTodayApps: WqApp[];
  jobsAwaitingPublish: WqJob[];
  staleApps: WqApp[];
  interviewPending: WqApp[];
  initialFocus?: Focus;
}) {
  const [focus, setFocus] = useState<Focus>(initialFocus);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const tCommon = useTranslations('common');
  const connectionCopy = tCommon('connectionError');

  const patchApp = useCallback(async (appId: string, status: string) => {
    setBusy(appId);
    setMsg(null);
    try {
      const r = await fetch(`/api/employer/applications/${appId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
      // A server rejection is JSON `{ error }`; a non-JSON answer falls
      // through to the stable sentence.
      const data = (await r.json().catch(() => ({}))) as { error?: unknown };
      if (!r.ok) {
        setMsg(typeof data.error === 'string' && data.error.trim() ? data.error : APPLICATION_UPDATE_FAILED);
        return;
      }
      window.location.reload();
    } catch (err) {
      // Before this catch a dropped connection escaped as an unhandled
      // rejection: the pill re-enabled and the employer read nothing.
      setMsg(requestFailureMessage(err, { connection: connectionCopy, fallback: APPLICATION_UPDATE_FAILED }, 'employer-work-queue-status'));
    } finally {
      setBusy(null);
    }
  }, [connectionCopy]);

  const sections = useMemo(
    () => [
      {
        id: 'review' as const,
        title: 'Needs review today',
        subtitle: 'New applications today and jobs awaiting WorkforceAP publish/review.',
        apps: needsReviewTodayApps,
        jobs: jobsAwaitingPublish,
      },
      {
        id: 'stale' as const,
        title: 'Stale >48h',
        subtitle: 'Applications still in pending or reviewing with no activity for two days.',
        apps: staleApps,
        jobs: [] as WqJob[],
      },
      {
        id: 'interview' as const,
        title: 'Interview pending',
        subtitle: 'Candidates marked interview — keep momentum with next steps.',
        apps: interviewPending,
        jobs: [] as WqJob[],
      },
    ],
    [needsReviewTodayApps, jobsAwaitingPublish, staleApps, interviewPending]
  );

  const visible = sections.filter((s) => focus === 'all' || focus === s.id);

  return (
    <div className="wa-space-y-5">
      {msg ? (
        <p
          role="alert"
          style={{
            margin: 0,
            padding: '0.75rem 1rem',
            borderRadius: 'var(--wa-radius-sm)',
            background: 'var(--wa-accent-soft)',
            color: 'var(--wa-accent)',
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {msg}
        </p>
      ) : null}

      <div role="tablist" aria-label="Queue focus" className="wa-flex wa-flex-wrap wa-gap-2">
        {(
          [
            ['all', 'All queues'],
            ['review', 'Review today'],
            ['stale', 'Stale'],
            ['interview', 'Interview'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={focus === k}
            onClick={() => setFocus(k)}
            className="wa-kit-focus"
            style={{
              padding: '8px 14px',
              minHeight: 36,
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              border: '1px solid var(--wa-border)',
              background: focus === k ? 'var(--wa-accent)' : 'var(--wa-surface)',
              color: focus === k ? 'var(--wa-on-accent)' : 'var(--wa-text)',
              borderColor: focus === k ? 'var(--wa-accent)' : 'var(--wa-border)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {visible.map((sec) => (
        <section key={sec.id} id={`wq-${sec.id}`} className="wa-space-y-3">
          <header>
            <h2 style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-0.01em', margin: 0 }}>{sec.title}</h2>
            <p style={{ fontSize: 13, color: 'var(--wa-muted)', margin: '2px 0 0' }}>{sec.subtitle}</p>
          </header>

          <div className="wa-space-y-2">
            {sec.jobs.map((j) => (
              <WorkQueueItem
                key={j.id}
                icon={<Briefcase size={16} aria-hidden />}
                urgent
                title={j.title}
                detail={`Status: ${statusLabel(j.status)} · Updated ${new Date(j.updatedAt).toLocaleDateString()}`}
                action={pillLink({ label: 'Open job', href: `/employer/jobs/${encodeURIComponent(j.id)}` })}
              />
            ))}

            {sec.apps.map((a) => {
              const Icon = sec.id === 'review' ? UserRound : sec.id === 'stale' ? TriangleAlert : CalendarClock;
              return (
                <QueueRow
                  key={a.id}
                  tone={SECTION_TONE[sec.id]}
                  icon={<Icon size={16} aria-hidden />}
                  title={a.studentName}
                  meta={`${a.jobTitle} · Applied ${new Date(a.appliedAt).toLocaleString()}`}
                  action={
                    <div
                      className="wa-flex wa-items-center wa-gap-2 wa-flex-wrap"
                      style={{ minWidth: 0, flexShrink: 1, justifyContent: 'flex-end' }}
                    >
                      <StatusTag tone={SECTION_STATUS_TONE[sec.id]}>{statusLabel(a.status)}</StatusTag>
                      {pillLink({ label: 'Table view', href: '/employer/applications', variant: 'outline' })}
                      {sec.id === 'review' && a.status === 'pending'
                        ? pillButton({
                            label: 'Start review',
                            busy: busy === a.id,
                            disabled: busy === a.id,
                            onClick: () => void patchApp(a.id, 'reviewing'),
                          })
                        : null}
                      {sec.id === 'stale' && (a.status === 'pending' || a.status === 'reviewing')
                        ? pillButton({
                            label: 'Move to interview',
                            busy: busy === a.id,
                            disabled: busy === a.id,
                            onClick: () => void patchApp(a.id, 'interview'),
                          })
                        : null}
                      {sec.id === 'interview'
                        ? pillButton({
                            label: 'Mark offered',
                            busy: busy === a.id,
                            disabled: busy === a.id,
                            onClick: () => void patchApp(a.id, 'offered'),
                          })
                        : null}
                    </div>
                  }
                />
              );
            })}

            {sec.apps.length === 0 && sec.jobs.length === 0 ? (
              <div className="wa-kit-card wa-kit-card--sm" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Clock size={16} aria-hidden style={{ color: 'var(--wa-muted)', flexShrink: 0 }} />
                <p style={{ margin: 0, fontSize: 13, color: 'var(--wa-muted)' }}>Nothing in this queue right now.</p>
              </div>
            ) : null}
          </div>
        </section>
      ))}
    </div>
  );
}
