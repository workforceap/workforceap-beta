import { Award, Briefcase, GraduationCap, Info, TrendingUp, Users } from 'lucide-react';
import type { BoardOutcomes } from '@/lib/admin/boardOutcomes';
import DataTable from '@/components/portal/ui/DataTable';
import { programDisplayTitle } from '@/lib/content/programTitle';

/**
 * Board / Funder outcomes dashboard.
 *
 * Renders the BoardOutcomes aggregation as a board-pitch-ready view: hero
 * KPIs first, then funnel, programs, demographics, placements list. Uses
 * pure CSS bars (no chart lib) so this works in print and SSR.
 *
 * Per /plan-ceo-review (2026-04-26): the workforce board is the SaaS buyer.
 * This is the surface that justifies a paid license — real-time outcome
 * data the board would otherwise compile manually from case files.
 */
export default function BoardOutcomesView({
  outcomes,
  programs,
  boardName,
}: {
  outcomes: BoardOutcomes;
  programs: Array<BoardOutcomes['programs'][number] & { title: string }>;
  boardName: string;
}) {
  const t = outcomes.totals;

  // Pilot-phase framing: when the cohort is small or pre-placement, raw
  // metrics ("Placement rate: 0%") read as "broken platform" to a buyer.
  // Frame the data instead — show cohort size + trajectory so the demo
  // lands as "early in the cycle" not "doesn't work." Hidden once we
  // hit ≥5 placements, when the metrics speak for themselves.
  const isPilotPhase = t.membersPlaced < 5;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1100px' }}>
      {isPilotPhase ? <PilotPhaseBanner totals={t} /> : null}
      {/* Header band */}
      <section
        style={{
          padding: '1.25rem 1.5rem',
          background: 'linear-gradient(135deg, color-mix(in srgb, var(--color-accent) 8%, white), white 75%)',
          border: '1px solid color-mix(in srgb, var(--color-accent) 18%, var(--outline-variant))',
          borderRadius: '0.875rem',
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: '0.8125rem',
            fontWeight: 800,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--color-accent-dark)',
          }}
        >
          {boardName}
        </p>
        <h2 style={{ margin: '0.25rem 0 0.5rem', fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-on-surface)', letterSpacing: '-0.02em' }}>
          Outcomes &mdash; {outcomes.period.label}
        </h2>
        <p style={{ margin: 0, color: 'var(--color-on-surface-variant)', fontSize: '0.95rem' }}>
          {outcomes.period.startDate
            ? `${outcomes.period.startDate.toLocaleDateString()} — ${outcomes.period.endDate.toLocaleDateString()}`
            : `Through ${outcomes.period.endDate.toLocaleDateString()}`}
        </p>
      </section>

      {/* Hero KPI cards */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
          gap: '1rem',
        }}
      >
        <Kpi
          icon={Users}
          label="Members served"
          value={t.membersServed.toString()}
          accent="#2b7bb9"
        />
        <Kpi
          icon={Briefcase}
          label="Placement rate"
          value={`${t.placementRate}%`}
          subline={`${t.membersPlaced} placed`}
          accent="var(--color-accent)"
          highlight
        />
        <Kpi
          icon={TrendingUp}
          label="Median annual wage"
          value={t.medianAnnualSalary ? `$${formatThousands(t.medianAnnualSalary)}` : '—'}
          subline="At placement"
          accent="var(--color-green, #4a9b4f)"
        />
        <Kpi
          icon={Award}
          label="Total wage value"
          value={t.totalAnnualSalaryValue ? `$${formatThousands(t.totalAnnualSalaryValue)}` : '$0'}
          subline="Sum of placed-member wages"
          accent="var(--color-gold, #a47f38)"
        />
      </section>

      {/* Funnel */}
      <section className="portal-card portal-card--flat" style={{ padding: '1.25rem 1.5rem' }}>
        <header style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--color-on-surface)' }}>
            Member journey funnel
          </h3>
          {t.averageWeeksToPlacement !== null ? (
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
              Avg. <strong>{t.averageWeeksToPlacement}</strong> weeks from enrollment to placement
            </p>
          ) : null}
        </header>
        <FunnelBars funnel={outcomes.funnel} />
      </section>

      {/* Programs breakdown */}
      {programs.length > 0 ? (
        <section className="portal-card portal-card--flat" style={{ padding: '1.25rem 1.5rem' }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 700, color: 'var(--color-on-surface)' }}>
            Programs
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <DataTable
              density="compact"
              scrollX={false}
              rows={programs}
              rowKey={(p) => p.programSlug}
              columns={[
                {
                  key: 'program',
                  header: (
                    <span style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Program
                    </span>
                  ),
                  cell: (p) => <span style={{ color: 'var(--color-on-surface)' }}>{p.title}</span>,
                },
                {
                  key: 'enrolled',
                  header: (
                    <span style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Enrolled
                    </span>
                  ),
                  align: 'right',
                  cell: (p) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{p.enrolled}</span>,
                },
                {
                  key: 'certified',
                  header: (
                    <span style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Training completed
                    </span>
                  ),
                  align: 'right',
                  cell: (p) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{p.certified}</span>,
                },
                {
                  key: 'placed',
                  header: (
                    <span style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Placed
                    </span>
                  ),
                  align: 'right',
                  cell: (p) => (
                    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--color-accent)' }}>{p.placed}</span>
                  ),
                },
                {
                  key: 'rate',
                  header: (
                    <span style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Placement rate
                    </span>
                  ),
                  align: 'right',
                  cell: (p) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{p.placementRate}%</span>,
                },
              ]}
            />
          </div>
        </section>
      ) : null}

      {/* Demographics */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '1rem' }}>
        <DemographicCard
          title="Veteran status"
          breakdown={outcomes.demographics.veteranBreakdown}
          icon={GraduationCap}
        />
        <DemographicCard
          title="Employment entering program"
          breakdown={outcomes.demographics.employmentEnteringBreakdown}
          icon={Briefcase}
        />
        <DemographicCard
          title="Household income"
          breakdown={outcomes.demographics.incomeBreakdown}
          icon={TrendingUp}
        />
        <DemographicCard
          title="Education entering program"
          breakdown={outcomes.demographics.educationBreakdown}
          icon={GraduationCap}
        />
        <DemographicCard
          title="Race / ethnicity"
          breakdown={outcomes.demographics.ethnicityBreakdown}
          icon={Users}
        />
      </section>

      {/* Placements (anonymized) */}
      {outcomes.placements.length > 0 ? (
        <section className="portal-card portal-card--flat" style={{ padding: '1.25rem 1.5rem' }}>
          <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 700, color: 'var(--color-on-surface)' }}>
            Placements
          </h3>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.825rem', color: 'var(--color-on-surface-variant)' }}>
            Member identities are not shown on the funder view. PII lives only on the admin member detail page.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <DataTable
              density="compact"
              scrollX={false}
              rows={outcomes.placements}
              rowKey={(p, idx) => `${idx}-${p.jobTitle}-${p.placedAt?.toISOString?.() ?? ''}`}
              columns={[
                {
                  key: 'job',
                  header: (
                    <span style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Job title
                    </span>
                  ),
                  cell: (p) => <span style={{ color: 'var(--color-on-surface)' }}>{p.jobTitle}</span>,
                },
                {
                  key: 'prog',
                  header: (
                    <span style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Program
                    </span>
                  ),
                  cell: (p) => <span style={{ color: 'var(--color-on-surface-variant)' }}>{p.enrolledProgram ? programDisplayTitle(p.enrolledProgram) : '—'}</span>,
                },
                {
                  key: 'wage',
                  header: (
                    <span style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Annual wage
                    </span>
                  ),
                  align: 'right',
                  cell: (p) => (
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {p.annualSalary ? `$${formatThousands(p.annualSalary)}` : '—'}
                    </span>
                  ),
                },
                {
                  key: 'weeks',
                  header: (
                    <span style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Weeks to placement
                    </span>
                  ),
                  align: 'right',
                  cell: (p) => (
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{p.weeksFromEnrollmentToPlacement ?? '—'}</span>
                  ),
                },
                {
                  key: 'placed',
                  header: (
                    <span style={{ color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Placed
                    </span>
                  ),
                  align: 'right',
                  cell: (p) => (
                    <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--color-on-surface-variant)' }}>
                      {p.placedAt.toLocaleDateString()}
                    </span>
                  ),
                },
              ]}
            />
          </div>
        </section>
      ) : null}

      <p style={{ padding: '0.75rem 0', fontSize: '0.825rem', color: 'var(--color-on-surface-variant)', textAlign: 'center', margin: 0 }}>
        Generated {new Date().toLocaleString()} &middot; Powered by WorkforceAP
      </p>
    </div>
  );
}

/**
 * Pilot-phase framing for the buyer demo. When membersPlaced < 5, the
 * raw "0% placement rate" headline is misleading — a workforce board
 * reading the page cold needs context that the cohort is mid-training
 * (typical 12-week program), not failed. Removes itself once placements
 * accumulate.
 */
function PilotPhaseBanner({ totals }: { totals: BoardOutcomes['totals'] }) {
  const { membersServed, membersEnrolled, membersInTraining, membersCertified, membersPlaced } = totals;

  // What's the most accurate "where we are" phrase given the data?
  let phase: string;
  if (membersPlaced > 0) {
    phase = `Recorded outcomes: ${membersPlaced} placed, ${membersInTraining} still in training.`;
  } else if (membersCertified > 0) {
    phase = `${membersCertified} member${membersCertified === 1 ? ' has' : 's have'} completed assigned training. Credential verification and job placement are separate milestones.`;
  } else if (membersInTraining > 0) {
    phase = `${membersInTraining} member${membersInTraining === 1 ? ' is' : 's are'} in training. Completion and placement are reported as they are recorded.`;
  } else if (membersEnrolled > 0) {
    phase = `${membersEnrolled} member${membersEnrolled === 1 ? ' is' : 's are'} enrolled; no training completions or placements are recorded yet.`;
  } else {
    phase = 'No enrollments are recorded for this reporting period.';
  }

  return (
    <section
      style={{
        padding: '1rem 1.25rem',
        background: 'color-mix(in srgb, var(--color-blue, #2b7bb9) 8%, white)',
        border: '1px solid color-mix(in srgb, var(--color-blue, #2b7bb9) 22%, var(--outline-variant))',
        borderRadius: '0.875rem',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.875rem',
      }}
    >
      <span
        aria-hidden
        style={{
          background: 'color-mix(in srgb, var(--color-blue, #2b7bb9) 14%, transparent)',
          color: 'var(--color-blue, #2b7bb9)',
          width: '2.25rem',
          height: '2.25rem',
          borderRadius: 'var(--radius-md)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Info size={18} aria-hidden />
      </span>
      <div style={{ minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontSize: '0.8125rem',
            fontWeight: 800,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--color-blue, #2b7bb9)',
          }}
        >
          Reporting context &middot; {membersServed} member{membersServed === 1 ? '' : 's'} served
        </p>
        <p style={{ margin: '0.35rem 0 0', fontSize: '0.95rem', color: 'var(--color-on-surface)', lineHeight: 1.5 }}>
          {phase}
        </p>
        <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.5 }}>
          These figures reflect recorded activity. Training completion, credential review, and employment outcomes should be read separately.
        </p>
      </div>
    </section>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  subline,
  accent,
  highlight,
}: {
  icon: React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;
  label: string;
  value: string;
  subline?: string;
  accent: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="portal-card portal-card--flat"
      style={{
        padding: '1.25rem 1.25rem 1rem',
        background: highlight ? `color-mix(in srgb, ${accent} 8%, white)` : undefined,
        border: highlight ? `2px solid ${accent}` : undefined,
      }}
    >
      <span
        aria-hidden
        style={{
          background: `color-mix(in srgb, ${accent} 14%, transparent)`,
          color: accent,
          width: '2.5rem',
          height: '2.5rem',
          borderRadius: 'var(--radius-md)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={20} aria-hidden />
      </span>
      <p
        style={{
          margin: '0.75rem 0 0.25rem',
          fontSize: '0.8125rem',
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--color-on-surface-variant)',
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: 0,
          fontSize: '1.875rem',
          fontWeight: 800,
          letterSpacing: '-0.02em',
          color: 'var(--color-on-surface)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </p>
      {subline ? (
        <p style={{ margin: '0.15rem 0 0', fontSize: '0.825rem', color: 'var(--color-on-surface-variant)' }}>{subline}</p>
      ) : null}
    </div>
  );
}

function FunnelBars({ funnel }: { funnel: Array<{ stage: string; count: number }> }) {
  const max = Math.max(...funnel.map((f) => f.count), 1);
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {funnel.map((row) => {
        const pct = Math.round((row.count / max) * 100);
        return (
          <li key={row.stage}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-on-surface)' }}>{row.stage}</span>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-on-surface)', fontVariantNumeric: 'tabular-nums' }}>{row.count}</span>
            </div>
            <div style={{ height: '10px', background: 'var(--surface-container-low)', borderRadius: '999px', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, var(--color-accent), color-mix(in srgb, var(--color-accent) 80%, var(--color-gold, #a47f38)))',
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function DemographicCard({
  title,
  breakdown,
  icon: Icon,
}: {
  title: string;
  breakdown: Array<{ label: string; count: number }>;
  icon: React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;
}) {
  if (breakdown.length === 0) {
    return (
      <div className="portal-card portal-card--flat" style={{ padding: '1.25rem 1.5rem' }}>
        <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-on-surface)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Icon size={16} aria-hidden /> {title}
        </h4>
        <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>No data reported yet.</p>
      </div>
    );
  }
  const total = breakdown.reduce((a, b) => a + b.count, 0);
  return (
    <div className="portal-card portal-card--flat" style={{ padding: '1.25rem 1.5rem' }}>
      <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-on-surface)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Icon size={16} aria-hidden /> {title}
      </h4>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {breakdown.map((row) => {
          const pct = total > 0 ? Math.round((row.count / total) * 100) : 0;
          return (
            <li key={row.label}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.15rem', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--color-on-surface)' }}>{row.label}</span>
                <span style={{ color: 'var(--color-on-surface-variant)', fontVariantNumeric: 'tabular-nums' }}>
                  {row.count} ({pct}%)
                </span>
              </div>
              <div style={{ height: '6px', background: 'var(--surface-container-low)', borderRadius: '999px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${pct}%`,
                    height: '100%',
                    background: 'color-mix(in srgb, var(--color-blue, #2b7bb9) 80%, var(--color-accent))',
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatThousands(n: number): string {
  return n.toLocaleString('en-US');
}
