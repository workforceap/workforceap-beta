import { notFound } from 'next/navigation';
import { Home, BookOpen, Briefcase, User, Play, Sparkles, Medal, GraduationCap, ArrowRight, Flame, Coins } from 'lucide-react';
import {
  DesignSurface,
  AppShellMember,
  SectionHeader,
  KpiStrip,
  ProgressRing,
  FeatureTile,
  DataTable,
  StatusTag,
  ProgressBar,
  Avatar,
  type Column,
} from '@/components/portal/kit';

/**
 * Phase 1 — the member dashboard home rebuilt on the design kit (warm = Bold + Calm).
 * Preview-only showcase with representative data (no auth/DB), so it renders on the
 * Vercel preview before demo connection strings are wired. Once validated, this
 * becomes the real app/(portal)/dashboard/page.tsx presentation layer.
 * Spec: docs/PORTAL_DESIGN_KIT.md
 */
export const dynamic = 'force-static';

type Job = { id: string; role: string; company: string; stage: string; tone: 'warn' | 'muted' | 'info' };
const JOBS: Job[] = [
  { id: '1', role: 'Salesforce Administrator', company: 'Deloitte · Austin, TX', stage: 'Interviewing', tone: 'warn' },
  { id: '2', role: 'Agentforce Solutions Engineer', company: 'Accenture · Remote', stage: 'Applied', tone: 'muted' },
  { id: '3', role: 'Cloud Support Associate', company: 'Indeed · Austin, TX', stage: 'Screening', tone: 'info' },
];
const JOB_COLS: Column<Job>[] = [
  { key: 'role', header: 'Role', render: (j) => <strong>{j.role}</strong> },
  { key: 'company', header: 'Company' },
  { key: 'stage', header: 'Stage', align: 'right', render: (j) => <StatusTag tone={j.tone}>{j.stage}</StatusTag> },
];
function jobCard(j: Job) {
  return (
    <div className="wa-kit-card wa-kit-card--sm" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <div><div style={{ fontWeight: 700, fontSize: 13 }}>{j.role}</div><div style={{ fontSize: 13, color: 'var(--wa-muted)' }}>{j.company}</div></div>
      <StatusTag tone={j.tone}>{j.stage}</StatusTag>
    </div>
  );
}

const TABS = [
  { id: 'journey', label: 'Journey', icon: <Home size={18} /> },
  { id: 'program', label: 'Program', icon: <BookOpen size={18} /> },
  { id: 'jobs', label: 'Jobs', icon: <Briefcase size={18} /> },
  { id: 'me', label: 'Me', icon: <User size={18} /> },
];

export default function DevDashboardPage() {
  if (process.env.VERCEL_ENV === 'production') notFound();
  return (
    <DesignSurface surface="warm">
      <AppShellMember
        activeId="journey"
        tabs={TABS}
        brand={<span className="h-font">WorkforceAP</span>}
        topRight={
          <>
            <span className="wa-kit-tag wa-kit-tag--alert"><Flame size={11} /> 12-day</span>
            <span className="wa-kit-tag wa-kit-tag--warn"><Coins size={11} /> 1,240</span>
            <Avatar initials="MB" size={32} />
          </>
        }
      >
        {/* BOLD — gradient hero + ring + momentum */}
        <div className="wa-kit-card wa-kit-card--gradient-crimson" style={{ display: 'flex', alignItems: 'center', gap: 22, marginBottom: 20 }}>
          <ProgressRing pct={78} size={112} onDark />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', opacity: 0.75 }}>12-day streak 🔥</div>
            <h2 className="h-font" style={{ fontSize: 26, margin: '4px 0 2px' }}>Mike</h2>
            <p style={{ fontSize: 13, opacity: 0.85, margin: 0 }}>You're 78% to your AWS cert — one module today hits your weekly goal.</p>
            <button style={{ marginTop: 12, padding: '9px 18px', background: '#fff', color: 'var(--wa-accent)', fontWeight: 700, fontSize: 13, borderRadius: 999, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Play size={13} /> Resume module
            </button>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <KpiStrip
            items={[
              { label: 'Course', value: '78%', color: 'accent' },
              { label: 'Active Jobs', value: 4, color: 'info' },
              { label: 'Certs', value: 2, color: 'gold' },
              { label: 'Points', value: '1,240', color: 'success' },
            ]}
          />
        </div>

        {/* CALM — single next action */}
        <div className="wa-kit-card" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <div style={{ width: 44, height: 44, borderRadius: 'var(--wa-radius-sm)', background: 'var(--wa-accent-soft)', color: 'var(--wa-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ArrowRight size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--wa-accent)' }}>Do this next</div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Shared Responsibility Model</div>
            <div style={{ fontSize: 13, color: 'var(--wa-muted)' }}>~25 min · due Thursday</div>
          </div>
        </div>

        {/* bento: feature tiles + pipeline */}
        <div className="wa-grid wa-grid-cols-1 lg:wa-grid-cols-3 wa-gap-5" style={{ marginBottom: 20 }}>
          <FeatureTile icon={<Sparkles size={22} />} badge="AI" title="Career Toolkit" body="Resume audit + cover letters in seconds." tone="crimson" />
          <FeatureTile icon={<Medal size={22} />} badge="NEXT" title="Next Badge" body="2 modules to Cloud Foundations." tone="gold" />
          <div className="wa-kit-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ width: 44, height: 44, borderRadius: 'var(--wa-radius-sm)', background: '#eef5fb', color: 'var(--wa-info)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><GraduationCap size={20} /></div>
              <h3 style={{ fontWeight: 800, fontSize: 17, marginTop: 14, letterSpacing: '-.02em' }}>Learning Hub</h3>
              <p style={{ fontSize: 13, color: 'var(--wa-muted)', marginTop: 2 }}>Your connected Coursera courses.</p>
            </div>
            <a href="/dashboard/learning" style={{ fontSize: 13, fontWeight: 700, marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>Go to courses <ArrowRight size={13} /></a>
          </div>
        </div>

        {/* AWS program progress */}
        <div className="wa-kit-card" style={{ marginBottom: 20 }}>
          <SectionHeader title="AWS Cloud Practitioner" goal="7 of 9 modules · about 4 hours left" />
          <ProgressBar pct={78} aria-label="Course progress 78%" />
        </div>

        {/* job pipeline */}
        <SectionHeader title="Active Job Pipeline" goal="Tracking your local interview stages" />
        <DataTable columns={JOB_COLS} rows={JOBS} rowKey={(j) => j.id} mobile="cards" cardRender={jobCard} />
      </AppShellMember>
    </DesignSurface>
  );
}
