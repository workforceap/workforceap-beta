import Link from 'next/link';
import { Card } from '@astryxdesign/core/Card';
import { Token, type TokenColor } from '@astryxdesign/core/Token';
import {
  DesignSurface,
  PageOpener,
  KpiStrip,
  Avatar,
  KitEmptyState,
  type KpiItem,
} from '@/components/portal/kit';
import { MENTORS_ADMIN_EMPTY } from '@/lib/member/mentorsEmptyState';

/**
 * Mentors directory — industry volunteers paired with members, as a responsive
 * 3-col card grid. Mockup: workforceap-admin-full.html "mentors" view.
 * Target route: /admin/mentors
 *
 * Server-rendered (no interactivity) so it stays a plain RSC. Each card shows
 * an avatar/icon tile, the mentor name, and a "{Role} @ {Company} · {N} mentees"
 * description line. Mentee counts are real (distinct members from mentor
 * sessions, supplied by the page).
 */
export interface MentorCard {
  id: string;
  /** Mentor display name. */
  name: string;
  initials: string;
  /** Role/title, e.g. "Cloud Architect". */
  role: string;
  /** Company, e.g. "AWS". */
  company: string;
  /** Distinct members this mentor has session(s) with. */
  mentees: number;
  /** Approved + active → mentor is live and pairable. */
  isActive: boolean;
  /** Approved at all (vs. pending review). */
  isApproved: boolean;
}

export interface MentorsDirectoryKitProps {
  mentors?: MentorCard[];
  /** Total mentor count (full table, not just the rendered page). */
  total?: number;
  /** Active mentor count (approved + isActive). */
  activeCount?: number;
}

const DEFAULT_MENTORS: MentorCard[] = [
  { id: 'dk', name: 'David Kim', initials: 'DK', role: 'Cloud Architect', company: 'AWS', mentees: 4, isActive: true, isApproved: true },
  { id: 'mg', name: 'Maria Gonzalez', initials: 'MG', role: 'RN', company: "St. David's", mentees: 3, isActive: true, isApproved: true },
  { id: 'jo', name: 'James Okoro', initials: 'JO', role: 'Data Lead', company: 'IBM', mentees: 5, isActive: true, isApproved: true },
];

function mentorTone(m: MentorCard): { color: TokenColor; label: string } {
  if (!m.isApproved) return { color: 'yellow', label: 'Pending' };
  if (m.isActive) return { color: 'green', label: 'Active' };
  return { color: 'gray', label: 'Inactive' };
}

export function MentorsDirectoryKit({
  mentors = DEFAULT_MENTORS,
  total,
  activeCount,
}: MentorsDirectoryKitProps) {
  const mentorTotal = total ?? mentors.length;
  const active = activeCount ?? mentors.filter((m) => m.isActive && m.isApproved).length;
  const totalMentees = mentors.reduce((sum, m) => sum + m.mentees, 0);
  const avgMentees = mentors.length > 0 ? Math.round((totalMentees / mentors.length) * 10) / 10 : 0;

  const kpis: KpiItem[] = [
    { label: 'Mentors', value: mentorTotal, color: 'accent' },
    { label: 'Active', value: active, color: 'success' },
    { label: 'Active pairings', value: totalMentees, color: 'info' },
    { label: 'Avg mentees', value: avgMentees, color: 'gold' },
  ];

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener className="wa-mb-5"
        title="Mentors"
        kicker="Partners & Employers"
        lede="Industry volunteers paired with members"
      />

      <div className="wa-mb-5">
        <KpiStrip items={kpis} />
      </div>

      {mentors.length === 0 ? (
        <div className="wa-kit-card">
          <KitEmptyState
            title={MENTORS_ADMIN_EMPTY.title}
            description={MENTORS_ADMIN_EMPTY.description}
            action={
              <Link
                href={MENTORS_ADMIN_EMPTY.primaryCta.href}
                className="wa-kit-cta wa-kit-focus hover:wa-opacity-90"
              >
                {MENTORS_ADMIN_EMPTY.primaryCta.label}
              </Link>
            }
          />
        </div>
      ) : (
        <div className="wa-grid wa-grid-cols-1 md:wa-grid-cols-2 lg:wa-grid-cols-3 wa-gap-4">
          {mentors.map((m) => {
            const { color, label } = mentorTone(m);
            return (
              <Card key={m.id} className="wa-kit-card--hover">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <Avatar initials={m.initials} size={44} gradient={m.isActive && m.isApproved} />
                    <Token label={label} size="sm" color={color} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <h4 style={{ fontWeight: 800, fontSize: 16, letterSpacing: '-0.01em', margin: 0 }}>
                      {m.name}
                    </h4>
                    <p style={{ fontSize: 13, color: 'var(--wa-muted)', margin: '4px 0 0' }}>
                      {m.role} @ {m.company} · {m.mentees} {m.mentees === 1 ? 'mentee' : 'mentees'}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </DesignSurface>
  );
}
