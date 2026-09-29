import Link from 'next/link';
import { MessageSquare } from 'lucide-react';
import { Avatar } from '@/components/portal/kit/Avatar';
import type { AssignedCounselor } from '@/lib/member/counselorContext';

/**
 * "Your career advisor" card on the member home (Stitch member layout). It
 * renders only for a resolved, active counselor assignment
 * (`resolveAssignedCounselor`), so the Message button never routes to nobody.
 * It states no presence or availability: we don't record either.
 */
export default function MemberAdvisorCard({ advisor }: { advisor: AssignedCounselor | null | undefined }) {
  if (!advisor) return null;
  const initials = advisor.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
  return (
    <section
      className="wa-kit-card"
      aria-labelledby="member-advisor-heading"
      data-testid="member-advisor-card"
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
        <Avatar initials={initials || '?'} size={52} src={advisor.avatar ?? undefined} />
        <div style={{ minWidth: 0 }}>
          <p className="wa-kit-meta" style={{ margin: 0, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Your career advisor
          </p>
          <h3 id="member-advisor-heading" style={{ margin: '2px 0 0', fontSize: 18, fontWeight: 800, overflowWrap: 'anywhere' }}>
            {advisor.name}
          </h3>
        </div>
      </div>
      <Link
        href={advisor.messagingHref}
        className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus hover:wa-opacity-90"
        style={{ gap: 8, flex: '1 1 12rem', maxWidth: '22rem', justifyContent: 'center' }}
      >
        <MessageSquare size={18} aria-hidden />
        Message {advisor.firstName}
      </Link>
    </section>
  );
}
