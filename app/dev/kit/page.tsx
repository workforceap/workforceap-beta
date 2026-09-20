import { notFound } from 'next/navigation';
import {
  DesignSurface,
  KpiStrip,
  SectionHeader,
  StatusTag,
  ProgressRing,
  ProgressBar,
  Avatar,
  DataTable,
  FeatureTile,
  QueueRow,
  WorkQueueItem,
  KanbanBoard,
  BarChartMini,
  RankBars,
  FormField,
  Toggle,
  ChatThread,
  type Column,
  type SurfaceMode,
} from '@/components/portal/kit';

/**
 * Storybook-lite proof page for the Phase 0 design kit. Renders every shipped
 * primitive in BOTH surface modes so the kit is reviewable on a Vercel preview
 * before any real page is converted. Hidden in production.
 * Spec: docs/PORTAL_DESIGN_KIT.md
 */
export const dynamic = 'force-static';

type Student = { id: string; name: string; program: string; pct: number; readiness: number; status: string; tone: 'ok' | 'warn' | 'alert' | 'info' };

const STUDENTS: Student[] = [
  { id: '1', name: 'Mike Brown', program: 'Cloud & IT', pct: 78, readiness: 84, status: 'Job-Ready', tone: 'warn' },
  { id: '2', name: 'Jasmine Davis', program: 'Healthcare', pct: 92, readiness: 91, status: 'Placed', tone: 'ok' },
  { id: '3', name: 'Carlos Torres', program: 'Skilled Trades', pct: 34, readiness: 41, status: 'At Risk', tone: 'alert' },
];

const COLUMNS: Column<Student>[] = [
  { key: 'name', header: 'Student', render: (r) => <strong>{r.name}</strong> },
  { key: 'program', header: 'Program' },
  { key: 'pct', header: 'Progress', render: (r) => <ProgressBar pct={r.pct} /> },
  { key: 'readiness', header: 'Readiness', render: (r) => <span style={{ fontWeight: 700, color: r.readiness >= 70 ? 'var(--wa-success)' : 'var(--wa-accent)' }}>{r.readiness}</span> },
  { key: 'status', header: 'Status', align: 'right', render: (r) => <StatusTag tone={r.tone}>{r.status}</StatusTag> },
];

function studentCard(r: Student) {
  return (
    <div className="wa-kit-card wa-kit-card--sm" style={{ marginBottom: 8 }}>
      <div className="wa-flex wa-items-center wa-gap-3">
        <Avatar initials={r.name.split(' ').map((s) => s[0]).join('')} size={36} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{r.name}</div>
          <div style={{ fontSize: 13, color: 'var(--wa-muted)' }}>{r.program}</div>
        </div>
        <StatusTag tone={r.tone}>{r.status}</StatusTag>
      </div>
      <div style={{ marginTop: 10 }}>
        <ProgressBar pct={r.pct} />
      </div>
    </div>
  );
}

function Showcase({ surface }: { surface: SurfaceMode }) {
  return (
    <DesignSurface surface={surface}>
      <div style={{ padding: 28, maxWidth: 1100, margin: '0 auto' }}>
        <SectionHeader
          kicker={`Surface: ${surface}`}
          title={surface === 'warm' ? 'Warm — member (Bold + Calm)' : 'Dense — admin / data / staff'}
          goal="Same components, same tokens — only density / radius / pop differ by surface."
        />
        <div style={{ marginBottom: 20 }}>
          <KpiStrip
            items={[
              { label: 'Active Students', value: 847, delta: '↑ 32 this month' },
              { label: 'Placements YTD', value: 213 },
              { label: 'Completion', value: '71%' },
              { label: 'At Risk', value: 19 },
            ]}
          />
        </div>
        <div className="wa-grid wa-grid-cols-1 lg:wa-grid-cols-3 wa-gap-5" style={{ marginBottom: 20 }}>
          <div className="wa-kit-card" style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <ProgressRing pct={78} size={104} />
            <div>
              <StatusTag tone="warn">In Progress</StatusTag>
              <h3 style={{ fontWeight: 800, fontSize: 18, marginTop: 8, letterSpacing: '-0.02em' }}>AWS Cloud Practitioner</h3>
              <p style={{ fontSize: 13, color: 'var(--wa-muted)', marginTop: 2 }}>Next: Shared Responsibility Model</p>
            </div>
          </div>
          <div className="wa-kit-card wa-kit-card--gradient-crimson" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 150 }}>
            <div style={{ fontSize: 22 }}>✦</div>
            <div>
              <h3 style={{ fontWeight: 800, fontSize: 18 }}>Career Toolkit</h3>
              <p style={{ fontSize: 13, opacity: 0.85 }}>gradient in warm · tint in dense</p>
            </div>
          </div>
          <div className="wa-kit-card wa-kit-card--gradient-gold" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 150 }}>
            <div style={{ fontSize: 22 }}>★</div>
            <div>
              <h3 style={{ fontWeight: 800, fontSize: 18 }}>Next Badge</h3>
              <p style={{ fontSize: 13, opacity: 0.85 }}>2 modules to go</p>
            </div>
          </div>
        </div>
        <DataTable columns={COLUMNS} rows={STUDENTS} rowKey={(r) => r.id} mobile="cards" cardRender={studentCard} />

        {/* persona components */}
        <div className="wa-grid wa-grid-cols-1 lg:wa-grid-cols-3 wa-gap-5" style={{ marginTop: 20 }}>
          <FeatureTile icon="✦" badge="AI" title="Career Toolkit" body="Resume audit + cover letters." tone="crimson" />
          <FeatureTile icon="★" badge="NEXT" title="Next Badge" body="2 modules to go." tone="gold" />
          <div className="wa-kit-card">
            <RankBars
              data={[
                { label: 'Cloud & IT', value: 82, pct: 100, color: 'info' },
                { label: 'Healthcare', value: 61, pct: 74, color: 'info' },
                { label: 'Data & AI', value: 38, pct: 46, color: 'info' },
              ]}
            />
          </div>
        </div>

        <div className="wa-grid wa-grid-cols-1 lg:wa-grid-cols-2 wa-gap-5" style={{ marginTop: 20 }}>
          <div className="wa-kit-card">
            <SectionHeader title="Triage" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <QueueRow tone="red" icon="!" title="Carlos Torres" meta="No activity 16d · Trades" flag="Inactive" action={<StatusTag tone="alert">Call</StatusTag>} />
              <QueueRow tone="yellow" icon="◷" title="Sam Cole" meta="Assessment incomplete" flag="Watch" action={<StatusTag tone="warn">Nudge</StatusTag>} />
              <QueueRow tone="blue" icon="★" title="Aisha Williams" meta="Cert earned" flag="Win" action={<StatusTag tone="info">Send</StatusTag>} />
            </div>
          </div>
          <div className="wa-kit-card">
            <SectionHeader title="What needs you today" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <WorkQueueItem icon="!" title="5 students inactive 14d+" detail="Cloud & IT cohort" urgent action={<StatusTag tone="alert">Assign</StatusTag>} />
              <WorkQueueItem icon="✓" title="12 certs to approve" detail="Verify for outcomes" action={<StatusTag tone="muted">Review</StatusTag>} />
            </div>
          </div>
        </div>

        <div className="wa-grid wa-grid-cols-1 lg:wa-grid-cols-3 wa-gap-5" style={{ marginTop: 20 }}>
          <div className="wa-kit-card lg:wa-col-span-2">
            <SectionHeader title="Placements by month" />
            <BarChartMini data={[{ label: 'Jan', value: 38 }, { label: 'Feb', value: 46 }, { label: 'Mar', value: 55 }, { label: 'Apr', value: 62 }, { label: 'May', value: 78 }, { label: 'Jun', value: 90 }]} highlightLast />
          </div>
          <div className="wa-kit-card">
            <SectionHeader title="Pipeline" />
            <KanbanBoard
              columns={[
                { label: 'New', count: 2, tone: 'muted', cards: [{ id: 'a', title: 'Candidate A', meta: '88% match' }] },
                { label: 'Interview', count: 1, tone: 'warn', cards: [{ id: 'b', title: 'Candidate B', meta: '84% match' }] },
              ]}
            />
          </div>
        </div>

        <div className="wa-grid wa-grid-cols-1 lg:wa-grid-cols-2 wa-gap-5" style={{ marginTop: 20 }}>
          <div className="wa-kit-card">
            <SectionHeader title="Profile" />
            <div className="wa-grid wa-grid-cols-1 sm:wa-grid-cols-2 wa-gap-4">
              <FormField label="Full Name" defaultValue="Mike Brown" />
              <FormField label="Email" defaultValue="mike@example.com" />
            </div>
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Toggle label="Job matches" checked />
              <Toggle label="Course reminders" />
            </div>
          </div>
          <div className="wa-kit-card" style={{ height: 320 }}>
            <SectionHeader title="AI Advisor" />
            <div style={{ height: 'calc(100% - 48px)' }}>
              <ChatThread
                messages={[
                  { id: '1', from: 'other', author: 'AI', text: "You're 78% through AWS. Want a cover letter drafted?" },
                  { id: '2', from: 'self', text: 'Yes, tailor it to Austin.' },
                ]}
              />
            </div>
          </div>
        </div>
      </div>
    </DesignSurface>
  );
}

export default function DevKitPage() {
  // Visible in dev + Vercel preview; hidden in production.
  if (process.env.VERCEL_ENV === 'production') notFound();
  return (
    <main>
      <div style={{ background: '#1a1a1a', color: '#fff', padding: '16px 28px' }}>
        <div style={{ fontWeight: 800, letterSpacing: '-0.02em' }}>Portal Design Kit — Phase 0 proof</div>
        <div style={{ fontSize: 13, color: '#a3a3a3' }}>Every shipped primitive, both surface modes. Resize to mobile to see the table → cards fallback. Hidden in production.</div>
      </div>
      <Showcase surface="warm" />
      <div style={{ height: 1, background: 'var(--wa-border)' }} />
      <Showcase surface="dense" />
    </main>
  );
}
