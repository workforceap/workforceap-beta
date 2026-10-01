import { Users2, ArrowRight } from 'lucide-react';
import { Card } from '@astryxdesign/core/Card';
import { Token } from '@astryxdesign/core/Token';
import {
  DesignSurface,
  Avatar,
  KitEmptyState,
  PageOpener,
  StatusTag,
} from '@/components/portal/kit';
import { MENTORS_MEMBER_EMPTY } from '@/lib/member/mentorsEmptyState';
import { KitLinkButton } from '@/components/portal/kit/KitLinkButton';

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
          kicker="Mentor network"
          title="Find a mentor"
          lede={empty ? MENTORS_MEMBER_EMPTY.lede : 'Browse WorkforceAP mentors and request a session with someone in your field.'}
          icon={<Users2 size={13} aria-hidden="true" />}
          action={
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
          <div className="wa-grid wa-grid-cols-1 md:wa-grid-cols-3 wa-gap-4">
            {mentors.map((mentor) => (
              <Card key={mentor.id}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
                  <div className="wa-flex wa-items-center wa-gap-3">
                    <Avatar initials={initialsOf(mentor.fullName)} size={40} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 'var(--wa-type-body)', letterSpacing: '-0.01em', color: 'var(--wa-text)' }}>{mentor.fullName}</div>
                      {mentor.title ? <div style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)' }}>{mentor.title}</div> : null}
                    </div>
                  </div>
                  <div className="wa-flex wa-items-center wa-justify-between wa-gap-2" style={{ flexWrap: 'wrap' }}>
                    {mentor.company ? (
                      <span style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)' }}>{mentor.company}</span>
                    ) : <span />}
                    {mentor.industry ? (
                      <Token label={mentor.industry} size="sm" color="blue" />
                    ) : null}
                  </div>
                  <div style={{ marginTop: 'auto', width: '100%' }}>
                    <KitLinkButton
                      href={`/dashboard/mentors/${mentor.id}`}
                      label="Request session"
                      variant="primary"
                      size="sm"
                      endContent={<ArrowRight size={12} aria-hidden="true" />}
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DesignSurface>
  );
}
