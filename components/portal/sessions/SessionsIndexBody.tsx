import Link from 'next/link';
import { Sparkles, UserPlus, Users } from 'lucide-react';
import PageHeader from '@/components/portal/PageHeader';
import { prisma } from '@/lib/db/prisma';
import SessionsHistoryClient, {
  type SessionRow,
} from '@/components/portal/sessions/SessionsHistoryClient';

/**
 * Shared body for the In-office sessions index page. Used by both
 * /counselor/sessions and /admin/sessions so admin clicking
 * "In-office sessions" stays inside admin chrome (per user direction
 * 2026-04-26: "if opened from admin, should stay in admin, not
 * counselor"). The two callers pass `actor` to control breadcrumbs +
 * outbound links; the data-fetching logic lives here once.
 *
 * Scope:
 *  - counselor → filtered to sessions where metadata.actorUserId is
 *    the current counselor (their own sessions)
 *  - admin → sessions for members in the actor org (`organizationId`);
 *    super-admins omit that filter and see every tenant (platform ops)
 */
type Actor = 'counselor' | 'admin';

const ACTOR_PATHS: Record<Actor, {
  base: string;
  walkInHref: string;
  pickMemberHref: string;
  runHrefFor: (memberId: string) => string;
  rootCrumb: { label: string; href: string };
  recentLimit: number;
  recentHeading: string;
  recentEmptyTitle: string;
  recentEmptyBody: string;
}> = {
  counselor: {
    base: '/counselor/sessions',
    walkInHref: '/counselor/sessions/walk-in',
    pickMemberHref: '/counselor/students',
    runHrefFor: (memberId) => `/counselor/sessions/${memberId}/run`,
    rootCrumb: { label: 'Counselor', href: '/counselor' },
    recentLimit: 12,
    recentHeading: 'Your recent sessions',
    recentEmptyTitle: 'No sessions yet',
    recentEmptyBody: 'Start your first walk-in or existing-member session above.',
  },
  admin: {
    base: '/admin/sessions',
    walkInHref: '/admin/sessions/walk-in',
    pickMemberHref: '/admin/members',
    runHrefFor: (memberId) => `/admin/sessions/${memberId}/run`,
    rootCrumb: { label: 'Admin', href: '/admin' },
    recentLimit: 100,
    recentHeading: 'All in-office sessions',
    recentEmptyTitle: 'No sessions yet',
    recentEmptyBody: 'Once any counselor or admin runs a session, it lands here. Search by member name, email, or counselor.',
  },
};

export default async function SessionsIndexBody({
  actor,
  actorUserId,
  organizationId,
}: {
  actor: Actor;
  actorUserId: string;
  /** Admin home-org filter. `null`/omitted = unscoped (super-admin or counselor). */
  organizationId?: string | null;
}) {
  const paths = ACTOR_PATHS[actor];

  // Counselor scope: only their own sessions. Admin scope: every session.
  // Both queries hit the same MemberEvent rows; only the metadata filter
  // changes. Group rows by sessionId in JS afterwards (one row per
  // ai_tool_run_completed event; multiple events per session expected).
  const recent = await prisma.memberEvent.findMany({
    where: {
      eventName: 'ai_tool_run_completed',
      sessionId: { not: null },
      ...(organizationId ? { user: { organizationId } } : {}),
      ...(actor === 'counselor'
        ? {
            metadata: {
              path: ['actorUserId'],
              equals: actorUserId,
            },
          }
        : {}),
    },
    orderBy: { createdAt: 'desc' },
    // Pull more raw rows than recentLimit because multiple events per
    // session collapse to one row. 6x is a comfortable margin for
    // typical 3-tool sessions.
    take: paths.recentLimit * 6,
    select: {
      id: true,
      userId: true,
      sessionId: true,
      createdAt: true,
      metadata: true,
      user: { select: { id: true, fullName: true, email: true } },
    },
  });

  type SessionGroup = {
    sessionId: string;
    memberId: string;
    memberName: string;
    memberEmail: string;
    actorUserId: string | null;
    actorName: string | null;
    startedAt: Date;
    toolCount: number;
  };
  const grouped = new Map<string, SessionGroup>();
  for (const ev of recent) {
    if (!ev.sessionId) continue;
    const meta = (ev.metadata ?? {}) as { actorUserId?: string; actorName?: string };
    const evActorUserId = meta.actorUserId ?? null;
    const evActorName = meta.actorName ?? null;

    const existing = grouped.get(ev.sessionId);
    if (existing) {
      existing.toolCount += 1;
      if (ev.createdAt < existing.startedAt) existing.startedAt = ev.createdAt;
      // Prefer non-null actor info if any event in the session has it.
      if (!existing.actorName && evActorName) existing.actorName = evActorName;
      if (!existing.actorUserId && evActorUserId) existing.actorUserId = evActorUserId;
    } else {
      grouped.set(ev.sessionId, {
        sessionId: ev.sessionId,
        memberId: ev.userId,
        memberName: ev.user.fullName ?? ev.user.email,
        memberEmail: ev.user.email,
        actorUserId: evActorUserId,
        actorName: evActorName,
        startedAt: ev.createdAt,
        toolCount: 1,
      });
    }
  }
  const sessions: SessionRow[] = [...grouped.values()]
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
    .slice(0, paths.recentLimit)
    .map((s) => ({
      sessionId: s.sessionId,
      memberId: s.memberId,
      memberName: s.memberName,
      memberEmail: s.memberEmail,
      actorName: s.actorName,
      // Serialize Date for client component
      startedAt: s.startedAt.toISOString(),
      toolCount: s.toolCount,
      runHref: `${paths.runHrefFor(s.memberId)}?sid=${s.sessionId}`,
    }));

  return (
    <div className="wa-pb-24 md:wa-pb-0">
      <PageHeader
        title="In-office sessions"
        subtitle="Sit with a member for 30 minutes. Walk out with a polished resume, tailored cover letter, and interview prep — emailed to them automatically."
        breadcrumbs={[paths.rootCrumb, { label: 'In-office sessions' }]}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <Link
          href={paths.walkInHref}
          className="portal-card portal-card--flat"
          style={{ display: 'block', padding: '1.5rem', textDecoration: 'none', color: 'inherit', border: '2px solid var(--color-accent)', boxShadow: '0 8px 24px rgba(173,44,77,0.12)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <span style={{ background: 'var(--wa-accent-soft)', color: 'var(--wa-accent)', borderRadius: 'var(--radius-md)', padding: '0.5rem', display: 'inline-flex' }}>
              <UserPlus size={22} />
            </span>
            <h2 className="portal-section-heading" style={{ margin: 0 }}>Walk-in</h2>
          </div>
          <p style={{ fontSize: '0.95rem', lineHeight: 1.5, color: 'var(--color-on-surface-variant)', margin: 0 }}>
            Someone new sat down. Create their account, build their profile, and ship them resume + cover letter + interview prep in one session.
          </p>
          <div style={{ marginTop: '1rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-accent)' }}>
            Start walk-in &rarr;
          </div>
        </Link>

        <Link
          href={paths.pickMemberHref}
          className="portal-card portal-card--flat"
          style={{ display: 'block', padding: '1.5rem', textDecoration: 'none', color: 'inherit', border: '1px solid var(--outline-variant)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <span style={{ background: 'var(--wa-accent-soft)', color: 'var(--wa-accent)', borderRadius: 'var(--radius-md)', padding: '0.5rem', display: 'inline-flex' }}>
              <Users size={22} />
            </span>
            <h2 className="portal-section-heading" style={{ margin: 0 }}>Existing member</h2>
          </div>
          <p style={{ fontSize: '0.95rem', lineHeight: 1.5, color: 'var(--color-on-surface-variant)', margin: 0 }}>
            Pick someone from your roster. Update their profile, then run the same 4-step build &mdash; outputs save to their portal and email.
          </p>
          <div style={{ marginTop: '1rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-accent)' }}>
            Pick a member &rarr;
          </div>
        </Link>
      </div>

      <SessionsHistoryClient
        sessions={sessions}
        scope={actor}
        heading={paths.recentHeading}
        emptyTitle={paths.recentEmptyTitle}
        emptyBody={paths.recentEmptyBody}
      />
    </div>
  );
}
