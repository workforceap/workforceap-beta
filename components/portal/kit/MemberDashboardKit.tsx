import { Play, Sparkles, ArrowRight, GraduationCap, Briefcase } from 'lucide-react';
import { DesignSurface } from './DesignSurface';
import { SectionHeader } from './SectionHeader';
import { KpiStrip } from './KpiStrip';
import { ProgressRing } from './ProgressRing';
import { ProgressBar } from './ProgressBar';
import { FeatureTile } from './FeatureTile';

/**
 * Phase 1 — REAL member dashboard on the design kit (warm = Bold + Calm).
 * Content-only (the (portal) layout provides nav/chrome). Fed by the same data
 * page.tsx already computes for DesktopDashboard. Rendered behind `?ui=kit` so
 * the live dashboard stays the default until approved.
 * Spec: docs/PORTAL_DESIGN_KIT.md
 */
export interface MemberDashboardKitProps {
  firstName: string;
  progressPercent: number;
  programTitle?: string | null;
  completedCount: number;
  totalCourses: number;
  nextMilestone?: string | null;
  recommendedActions: Array<{ label: string; href: string }>;
  aiToolsUsedCount: number;
  jobSearchUrl?: string | null;
}

export function MemberDashboardKit({
  firstName,
  progressPercent,
  programTitle,
  completedCount,
  totalCourses,
  nextMilestone,
  recommendedActions,
  aiToolsUsedCount,
  jobSearchUrl,
}: MemberDashboardKitProps) {
  const pct = Math.max(0, Math.min(100, Math.round(progressPercent)));
  const topActions = recommendedActions.slice(0, 2);

  return (
    <DesignSurface surface="warm">
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
        {/* BOLD — gradient hero + ring + momentum */}
        <div className="wa-kit-card wa-kit-card--gradient-crimson" style={{ display: 'flex', alignItems: 'center', gap: 22, marginBottom: 20 }}>
          <ProgressRing pct={pct} size={112} onDark />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 'var(--wa-type-meta)', fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', opacity: 0.75 }}>Member Portal</div>
            <h2 className="h-font" style={{ fontSize: 26, margin: '4px 0 2px', fontWeight: 800, letterSpacing: '-.03em' }}>{firstName}</h2>
            <p className="wa-kit-lede" style={{ opacity: 0.85, margin: 0, color: 'inherit' }}>
              {programTitle ? `${pct}% through ${programTitle}.` : 'No program enrolled.'}
              {nextMilestone ? ` Next: ${nextMilestone}.` : ''}
            </p>
            {programTitle ? (
              <a
                href="/dashboard/program"
                className="wa-kit-cta wa-kit-focus"
                style={{ marginTop: 12, background: 'var(--wa-on-accent)', color: 'var(--wa-accent)', fontWeight: 700 }}
              >
                <Play size={13} /> Resume program
              </a>
            ) : null}
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <KpiStrip
            items={[
              { label: 'Course', value: `${pct}%` },
              { label: 'Modules', value: `${completedCount}/${totalCourses}` },
              { label: 'AI Tools Used', value: aiToolsUsedCount },
              { label: 'Next Steps', value: recommendedActions.length },
            ]}
          />
        </div>

        {/* CALM — single next action */}
        {nextMilestone ? (
          <div className="wa-kit-card" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
            <div style={{ width: 44, height: 44, borderRadius: 'var(--wa-radius-sm)', background: 'var(--wa-accent-soft)', color: 'var(--wa-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowRight size={20} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 'var(--wa-type-meta)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--wa-accent)' }}>Do this next</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{nextMilestone}</div>
            </div>
          </div>
        ) : null}

        {/* feature tiles from recommended actions + toolkit */}
        <div className="wa-grid wa-grid-cols-1 lg:wa-grid-cols-3 wa-gap-5" style={{ marginBottom: 20 }}>
          <FeatureTile icon={<Sparkles size={22} />} badge="AI" title="AI Career Tools" body="Resume audit, cover letters, interview prep." tone="crimson" href="/dashboard/ai-tools" />
          {topActions[0] ? (
            <FeatureTile icon={<GraduationCap size={22} />} badge="NEXT" title={topActions[0].label} body="Your recommended next step." tone="gold" href={topActions[0].href} />
          ) : null}
          {jobSearchUrl ? (
            <div className="wa-kit-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ width: 44, height: 44, borderRadius: 'var(--wa-radius-sm)', background: 'var(--wa-info-soft)', color: 'var(--wa-info)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Briefcase size={20} /></div>
                <h3 style={{ fontWeight: 800, fontSize: 17, marginTop: 14, letterSpacing: '-.02em' }}>Find Jobs</h3>
                <p className="wa-kit-lede" style={{ marginTop: 2 }}>Roles matched to your program.</p>
              </div>
              <a href={jobSearchUrl} className="wa-page-action" style={{ marginTop: 12, justifyContent: 'flex-start', padding: 0 }}>Browse jobs <ArrowRight size={13} /></a>
            </div>
          ) : null}
        </div>

        {/* program progress */}
        {programTitle ? (
          <div className="wa-kit-card">
            <SectionHeader title={programTitle} goal={`${completedCount} of ${totalCourses} modules complete`} />
            <ProgressBar pct={pct} aria-label={`Program progress ${pct}%`} />
          </div>
        ) : null}
      </div>
    </DesignSurface>
  );
}
