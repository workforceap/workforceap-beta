import { ArrowRight } from 'lucide-react';
import {
  DesignSurface,
  Avatar,
  KitEmptyState,
  PageOpener,
  StatusTag,
} from '@/components/portal/kit';
import { MENTORS_MEMBER_EMPTY } from '@/lib/member/mentorsEmptyState';
import { KitLinkButton } from '@/components/portal/kit/KitLinkButton';
import styles from './memberPages.module.css';

/**
 * Member Portal — MENTOR BROWSE view.
 * Elevates the bespoke `.mentor-browse-card` grid to the Command Center kit
 * language (warm surface, kit cards, initials Avatar).
 *
 * Target route: app/(portal)/dashboard/mentors
 * Surface: warm (member-facing).
 */

export interface MentorSummary {
  id: string;
  fullName: string;
  title: string | null;
  company: string | null;
  industry: string | null;
}

export interface MemberMentorsKitProps {
  mentors: MentorSummary[];
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function MemberMentorsKit({ mentors }: MemberMentorsKitProps) {
  const empty = mentors.length === 0;

  return (
    <DesignSurface surface="warm">
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--wa-pad-sm)' }} className="wa-space-y-6">
        <PageOpener
          title="Find a mentor"
          meta={empty ? MENTORS_MEMBER_EMPTY.lede : 'Browse WorkforceAP mentors and request a session with someone in your field.'}
          aside={
            empty ? (
              <StatusTag tone={MENTORS_MEMBER_EMPTY.statusTone}>{MENTORS_MEMBER_EMPTY.statusLabel}</StatusTag>
            ) : undefined
          }
        />

        {empty ? (
          <div className="wa-kit-card">
            <KitEmptyState
              kind={MENTORS_MEMBER_EMPTY.kind}
              title={MENTORS_MEMBER_EMPTY.title}
              description={MENTORS_MEMBER_EMPTY.description}
              primaryAction={MENTORS_MEMBER_EMPTY.primaryCta}
              secondaryAction={MENTORS_MEMBER_EMPTY.secondaryCta}
            />
          </div>
        ) : (
          <div className={styles.peopleGrid}>
            {mentors.map((mentor) => (
              <section key={mentor.id} className={`wa-kit-card ${styles.personCard}`} aria-label={mentor.fullName}>
                <div className={styles.personCardHead}>
                  <Avatar initials={initialsOf(mentor.fullName)} size={44} />
                  <div style={{ minWidth: 0 }}>
                    <p className={styles.personCardName}>{mentor.fullName}</p>
                    {mentor.title ? <p className={styles.personCardRole}>{mentor.title}</p> : null}
                  </div>
                </div>
                {mentor.company || mentor.industry ? (
                  <div className="wa-flex wa-items-center wa-justify-between wa-gap-2" style={{ flexWrap: 'wrap' }}>
                    {mentor.company ? <span className="wa-kit-meta">{mentor.company}</span> : <span />}
                    {mentor.industry ? <span className="wa-kit-chip wa-kit-chip--blue">{mentor.industry}</span> : null}
                  </div>
                ) : null}
                <div className={styles.personCardFoot}>
                  <KitLinkButton
                    href={`/dashboard/mentors/${mentor.id}`}
                    label="Request session"
                    variant="primary"
                    size="sm"
                    endContent={<ArrowRight size={12} aria-hidden="true" />}
                    style={{ width: '100%' }}
                  />
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </DesignSurface>
  );
}
