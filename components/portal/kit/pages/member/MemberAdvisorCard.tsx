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
      className="wa-kit-card wa-kit-people-card"
      aria-labelledby="member-advisor-heading"
      data-testid="member-advisor-card"
    >
      <div className="wa-kit-people-card__head">
        {advisor.avatar ? (
          <Avatar initials={initials || '?'} size={48} src={advisor.avatar} />
        ) : (
          <span className="wa-kit-people-card__avatar" aria-hidden="true">{initials || '?'}</span>
        )}
        <div>
          <h3 id="member-advisor-heading" className="wa-kit-people-card__name" style={{ overflowWrap: 'anywhere' }}>
            {advisor.name}
          </h3>
          <p className="wa-kit-people-card__role">Your career advisor</p>
        </div>
      </div>
      <Link
        href={advisor.messagingHref}
        className="wa-kit-cta wa-kit-cta--ghost wa-kit-cta--block wa-kit-focus hover:wa-opacity-90"
        style={{ marginTop: 16 }}
      >
        <MessageSquare size={18} aria-hidden />
        Message {advisor.firstName}
      </Link>
    </section>
  );
}
