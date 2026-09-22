'use client';

import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

type Props = {
  dailyActivity: { date: string; events: number; aiTools: number; applications: number }[];
  enrollmentByProgram: { program: string; count: number }[];
  placementStats: { enrolled: number; placed: number; certifications: number; placementRate: number };
  inactive14Days: number;
  applicationsSubmitted: number;
  resourcesCompleted: number;
  aiToolStats?: {
    runsLastNDays: number;
    trend: number;
    totalRuns: number;
    breakdown: { toolType: string; count: number }[];
  };
};

// Series colours read the `--wa-*` tokens directly. Recharts writes these
// into SVG presentation attributes (fill / stroke / stop-color), which take
// `var()` and `color-mix()` like any CSS colour, so the charts follow the
// theme with no getComputedStyle pass. Teal and orange are mixed from brand
// hues rather than added as new literals so they adapt in dark mode too.
const ACCENT = 'var(--wa-accent)';
const BLUE = 'var(--wa-info)';
const GOLD = 'var(--wa-gold)';
const GREEN = 'var(--wa-success)';
const VIOLET = 'var(--wa-violet)';
const TEAL = 'color-mix(in srgb, var(--wa-info) 50%, var(--wa-success))';
const ORANGE = 'color-mix(in srgb, var(--wa-gold) 45%, var(--wa-danger))';
const MUTED = 'var(--wa-muted)';

const PROGRAM_COLORS = [ACCENT, BLUE, GOLD, GREEN, VIOLET, TEAL, ORANGE, MUTED];

function SectionLabel({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: '0.875rem' }}>
      <h2 style={{ fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-on-surface-variant)', margin: 0 }}>{title}</h2>
      {sub && <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0.25rem 0 0' }}>{sub}</p>}
    </div>
  );
}

const tooltipStyle = {
  contentStyle: {
    background: 'var(--surface-container-high)',
    border: '1px solid var(--outline-variant)',
    borderRadius: '0.625rem',
    fontSize: '0.875rem',
    color: 'var(--color-on-surface)',
    padding: '0.65rem 0.85rem',
    boxShadow: '0 8px 28px rgba(0,0,0,0.18)',
  },
  labelStyle: { fontWeight: 700, color: 'var(--color-on-surface)', marginBottom: '0.25rem' },
  itemStyle: { color: 'var(--color-on-surface-variant)', paddingTop: '0.15rem' },
};

const axisTick = { fontSize: 13, fill: MUTED };

function ActivityLegend({ payload }: { payload?: Array<{ color?: string; value?: string }> }) {
  if (!payload?.length) return null;

  return (
    <ul
      aria-label="Activity chart legend"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: '0.5rem 1rem',
        padding: 0,
        margin: '0.5rem 0 0',
        listStyle: 'none',
        fontSize: '0.8125rem',
        color: 'var(--color-on-surface-variant)',
      }}
    >
      {payload.map((entry) => (
        <li key={entry.value} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', whiteSpace: 'nowrap' }}>
          <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', background: entry.color ?? MUTED }} />
          <span>{entry.value}</span>
        </li>
      ))}
    </ul>
  );
}

const TOOL_LABEL: Record<string, string> = {
  cover_letter: 'Cover Letter',
  elevator_pitch: 'Elevator Pitch',
  gap_analyzer: 'Gap Analyzer',
  interview_practice: 'Interview Practice',
  job_match_scorer: 'Job Match',
  linkedin_about: 'LinkedIn About',
  linkedin_headline: 'LinkedIn Headline',
  resume_rewriter: 'Resume Rewriter',
  skill_assessment: 'Skill Assessment',
  interest_profiler: 'Interest Profiler',
  voice_interview_video: 'Voice Interview',
  readiness_voice_session: 'Readiness Coach',
  wioa_prequalification_voice_session: 'WIOA Pre-qual',
  employer_voice_session: 'Employer Voice',
  partner_voice_session: 'Partner Voice',
};

export default function AdminAnalyticsCharts({ dailyActivity, enrollmentByProgram, placementStats, inactive14Days, applicationsSubmitted, resourcesCompleted, aiToolStats }: Props) {
  const aiBreakdown = (aiToolStats?.breakdown ?? []).map((r) => ({
    tool: TOOL_LABEL[r.toolType] ?? r.toolType,
    count: r.count,
  }));

  // The chart renders an empty rectangle if every day is zero — it
  // looks like the page is broken. Detect "no activity yet" and show
  // a clear empty state instead. Same pattern as the AI tools chart
  // empty state from #751.
  const hasActivity = dailyActivity.some(
    (d) => d.events > 0 || d.aiTools > 0 || d.applications > 0,
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Activity trend — 14-day area chart */}
      <div className="portal-card portal-card--flat" style={{ padding: '1.25rem' }}>
        <SectionLabel title="Activity — Last 14 Days" sub="Member events, AI tool runs, and job applications per day" />
        {hasActivity ? (
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={dailyActivity} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gEvents" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={ACCENT} stopOpacity={0.3} />
                <stop offset="95%" stopColor={ACCENT} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gAI" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={BLUE} stopOpacity={0.3} />
                <stop offset="95%" stopColor={BLUE} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gApps" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={GREEN} stopOpacity={0.3} />
                <stop offset="95%" stopColor={GREEN} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="date" tick={{ fontSize: 13, fill: MUTED }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 13, fill: MUTED }} tickLine={false} axisLine={false} />
            <Tooltip {...tooltipStyle} />
            <Legend verticalAlign="bottom" content={<ActivityLegend />} />
            <Area type="monotone" dataKey="events" name="Member events" stroke={ACCENT} fill="url(#gEvents)" strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="aiTools" name="AI tool runs" stroke={BLUE} fill="url(#gAI)" strokeWidth={2} dot={false} />
            <Area type="monotone" dataKey="applications" name="Applications" stroke={GREEN} fill="url(#gApps)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
        ) : (
          <div
            style={{
              height: 240,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '2rem 1rem',
              textAlign: 'center',
            }}
          >
            <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-on-surface)' }}>
              No activity in the last 14 days yet
            </p>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', maxWidth: '32rem' }}>
              Once members start using the platform, daily counts of events, AI tool runs, and job applications will graph here.
            </p>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>

        {/* Enrollment by program — bar chart */}
        <div className="portal-card portal-card--flat" style={{ padding: '1.25rem' }}>
          <SectionLabel title="Enrollment by Program" sub="Active members per program track" />
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={enrollmentByProgram} layout="vertical" margin={{ left: 8, right: 16, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 13, fill: MUTED }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="program" tick={{ fontSize: 13, fill: MUTED }} tickLine={false} axisLine={false} width={110}
                tickFormatter={(v: string) => v.length > 18 ? v.slice(0, 18) + '…' : v} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="count" name="Enrolled" radius={[0, 4, 4, 0]}>
                {enrollmentByProgram.map((_, i) => (
                  <Cell key={i} fill={PROGRAM_COLORS[i % PROGRAM_COLORS.length]} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Placement funnel — pie + stats */}
        <div className="portal-card portal-card--flat" style={{ padding: '1.25rem' }}>
          <SectionLabel title="Placement Funnel" sub="From enrolled to hired" />
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie data={[
                  { name: 'Placed', value: placementStats.placed },
                  { name: 'In Progress', value: Math.max(0, placementStats.enrolled - placementStats.placed) },
                ]} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" strokeWidth={0} stroke="none">
                  <Cell fill={GREEN} />
                  <Cell fill="var(--wa-track)" />
                </Pie>
                <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" fill={GREEN} fontSize={20} fontWeight={800}>
                  {placementStats.placementRate}%
                </text>
                <text x="50%" y="60%" textAnchor="middle" dominantBaseline="middle" fill={MUTED} fontSize={13}>
                  placed
                </text>
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1 }}>
              {[
                { label: 'Enrolled', value: placementStats.enrolled, color: BLUE },
                { label: 'Placed', value: placementStats.placed, color: GREEN },
                { label: 'Certificates', value: placementStats.certifications, color: GOLD },
                { label: 'Applications', value: applicationsSubmitted, color: ACCENT },
                { label: 'Resources Done', value: resourcesCompleted, color: MUTED },
                { label: 'Inactive 14d', value: inactive14Days, color: 'var(--color-on-surface-variant)' },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                    <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>{s.label}</span>
                  </div>
                  <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-on-surface)', fontVariantNumeric: 'tabular-nums' }}>{s.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* AI tool usage breakdown */}
      {aiBreakdown.length > 0 && (
        <div className="portal-card portal-card--flat" style={{ padding: '1.25rem' }}>
          <SectionLabel
            title="AI Tool Usage — Last 7 Days"
            sub={`${aiToolStats?.runsLastNDays ?? 0} runs${aiToolStats?.trend !== 0 ? ` · ${aiToolStats!.trend > 0 ? '+' : ''}${aiToolStats!.trend}% vs prior week` : ''} · ${aiToolStats?.totalRuns ?? 0} all-time`}
          />
          <ResponsiveContainer width="100%" height={Math.max(180, aiBreakdown.length * 36)}>
            <BarChart data={aiBreakdown} layout="vertical" margin={{ left: 8, right: 40, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 13, fill: MUTED }} tickLine={false} axisLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="tool" tick={{ fontSize: 13, fill: MUTED }} tickLine={false} axisLine={false} width={130} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="count" name="Runs" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 13, fill: MUTED }}>
                {aiBreakdown.map((_, i) => (
                  <Cell key={i} fill={PROGRAM_COLORS[i % PROGRAM_COLORS.length]} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {aiBreakdown.length === 0 && aiToolStats !== undefined && (
        <div className="portal-card portal-card--flat" style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--color-on-surface-variant)', fontSize: '0.875rem' }}>
          No AI tool runs recorded in the last 7 days.
        </div>
      )}

    </div>
  );
}
