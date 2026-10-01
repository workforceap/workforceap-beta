import Link from 'next/link';
import { AlertTriangle, MessageSquare, Sparkles } from 'lucide-react';
import type { CommandCenter } from '@/lib/counselor/commandCenter';
import { programDisplayTitle } from '@/lib/content/programTitle';
import { describeInactivity } from '@/lib/counselor/lastActivity';

/**
 * Counselor Command Center — Today's priorities.
 *
 * Three sections, one screen, one click to act on each row:
 *   - Needs reply now (oldest first; threads where a 48h SLA breach is pending)
 *   - Members with unresolved saved risk alerts
 *   - Interviewing this week (interview_practice tool was run recently)
 *
 * Per /plan-ceo-review (2026-04-26): this is the force multiplier that
 * makes 1 counselor manageable for 30+ members. Without it, the counselor
 * scrolls a roster and doesn't know who needs them most. With it, the
 * platform answers "who first?" before they ask.
 */
export default function CounselorCommandCenter({ data }: { data: CommandCenter }) {
  const totalToday = data.totals.needsReplyCount + data.totals.atRiskCount + data.totals.interviewingCount;
  const slaBreach = data.totals.slaBreachCount;

  return (
    <section
      aria-label="Today's priorities"
      style={{
        background: 'linear-gradient(135deg, color-mix(in srgb, var(--color-accent) 7%, white), white 75%)',
        border: '1px solid color-mix(in srgb, var(--color-accent) 18%, var(--outline-variant))',
        borderRadius: '0.875rem',
        padding: '1.25rem 1.5rem',
        marginBottom: '1.5rem',
      }}
    >
      <header style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: 0, fontSize: '0.8125rem', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-accent-dark)' }}>
            Today
          </p>
          <h2 className="portal-section-heading" style={{ margin: '0.15rem 0 0' }}>
            {totalToday === 0
              ? "You're caught up — nice work."
              : `${totalToday} ${totalToday === 1 ? 'thing' : 'things'} that need you`}
          </h2>
        </div>
        {slaBreach > 0 ? (
          <span
            role="status"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.4rem 0.7rem',
              borderRadius: '999px',
              background: 'rgba(173,44,77,0.12)',
              color: 'var(--wa-accent-text)',
              fontSize: '0.8125rem',
              fontWeight: 700,
            }}
          >
            <AlertTriangle size={14} aria-hidden /> {slaBreach} past 48h SLA
          </span>
        ) : null}
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '1rem' }}>
        <PrioritySection
          icon={MessageSquare}
          accent="var(--color-accent)"
          title="Needs reply"
          count={data.totals.needsReplyCount}
          empty="Inbox zero. When members reply, you'll see them here."
        >
          {data.needsReply.map((row) => (
            <PriorityRow
              key={row.threadId}
              name={row.memberName}
              meta={`${formatHours(row.hoursWaiting)} waiting`}
              preview={row.lastMessageBody?.slice(0, 80)}
              actionLabel="Reply"
              actionHref={`/counselor/messages?thread=${row.threadId}`}
              urgent={row.hoursWaiting >= 48}
            />
          ))}
        </PrioritySection>

        <PrioritySection
          icon={AlertTriangle}
          accent="var(--color-gold, #a47f38)"
          title="Saved risk alerts"
          count={data.totals.atRiskCount}
          empty="No members have an active saved risk alert."
        >
          {data.atRisk.map((row) => (
            <PriorityRow
              key={row.memberId}
              name={row.memberName}
              meta={`Saved risk score ${row.riskScore ?? "unknown"} · ${row.alertStatus ?? "active"} · ${describeInactivity(row.daysInactive)}`}
              preview={row.enrolledProgram ? programDisplayTitle(row.enrolledProgram) : null}
              actionLabel="Check in"
              actionHref={`/counselor/students/${row.memberId}`}
              urgent={(row.riskScore ?? 0) >= 70}
            />
          ))}
        </PrioritySection>

        <PrioritySection
          icon={Sparkles}
          accent="var(--color-blue, #2b7bb9)"
          title="Interviewing this week"
          count={data.totals.interviewingCount}
          empty="No interview prep run this week."
        >
          {data.interviewing.map((row) => (
            <PriorityRow
              key={row.memberId}
              name={row.memberName}
              meta={formatRelativeShort(row.lastRunAt)}
              preview={row.role ? `For: ${row.role}` : null}
              actionLabel="Run prep"
              actionHref={`/counselor/sessions/${row.memberId}/run`}
            />
          ))}
        </PrioritySection>
      </div>
    </section>
  );
}

function PrioritySection({
  icon: Icon,
  accent,
  title,
  count,
  empty,
  children,
}: {
  icon: React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;
  accent: string;
  title: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ background: 'white', borderRadius: '0.75rem', padding: '1rem 1.25rem', border: '1px solid var(--outline-variant)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <span
          aria-hidden
          style={{
            background: `color-mix(in srgb, ${accent} 14%, transparent)`,
            color: accent,
            width: '1.75rem',
            height: '1.75rem',
            borderRadius: '999px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={14} aria-hidden />
        </span>
        <h3 style={{ flex: 1, margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-on-surface)' }}>
          {title}
        </h3>
        <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-on-surface)', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
      </header>
      {count === 0 ? (
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>{empty}</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {children}
        </ul>
      )}
    </div>
  );
}

function PriorityRow({
  name,
  meta,
  preview,
  actionLabel,
  actionHref,
  urgent,
}: {
  name: string;
  meta: string;
  preview: string | null | undefined;
  actionLabel: string;
  actionHref: string;
  urgent?: boolean;
}) {
  return (
    <li>
      <Link
        href={actionHref}
        style={{
          display: 'block',
          padding: '0.6rem 0.75rem',
          borderRadius: '0.5rem',
          textDecoration: 'none',
          color: 'inherit',
          background: urgent ? 'color-mix(in srgb, var(--color-accent) 6%, white)' : 'var(--surface-container-low)',
          border: urgent ? '1px solid color-mix(in srgb, var(--color-accent) 28%, transparent)' : '1px solid transparent',
          transition: 'background 0.15s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-on-surface)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {name}
            </p>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: urgent ? 'var(--wa-accent-text)' : 'var(--color-on-surface-variant)', fontWeight: urgent ? 600 : 400 }}>
              {meta}
            </p>
            {preview ? (
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {preview}
              </p>
            ) : null}
          </div>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--wa-accent-text)', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {actionLabel} &rarr;
          </span>
        </div>
      </Link>
    </li>
  );
}

function formatHours(hours: number): string {
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function formatRelativeShort(d: Date): string {
  const ms = Date.now() - d.getTime();
  const hours = Math.round(ms / (60 * 60 * 1000));
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
