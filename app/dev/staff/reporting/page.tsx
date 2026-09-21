import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FileDown } from 'lucide-react';
import { ReportingHubKit, ReportingSubsection } from '@/components/portal/kit/pages/admin-subviews/ReportingHubKit';
import { AnalyticsKit } from '@/components/portal/kit/pages/admin-subviews/AnalyticsKit';
import { EnrollmentOutcomesPanel } from '@/components/portal/kit/pages/admin-subviews/EnrollmentOutcomesPanel';
import { BoardOutcomesKit } from '@/components/portal/kit/pages/admin-subviews/BoardOutcomesKit';
import { CourseraSyncKit } from '@/components/portal/kit/pages/admin-subviews/CourseraSyncKit';
import { ExportsKit } from '@/components/portal/kit/pages/admin-subviews/ExportsKit';
import {
  StudentsRosterKit,
  type StudentRow,
} from '@/components/portal/kit/pages/admin-subviews/StudentsRosterKit';
import type { TrainingPace } from '@/lib/admin/trainingProgressPrograms';
import { initialsFrom } from '@/lib/admin/studentsRosterView';
import { buildEnrollmentOutcomesPanel } from '@/lib/admin/analyticsTabs';
import {
  REPORTING_PERIODS,
  REPORTING_PERIOD_LABELS,
  parseReportingTab,
  reportingTabHref,
  type ReportingTabId,
} from '@/lib/admin/reportingHub';

/**
 * Showcase-only render of the admin reporting hub — every tab with mock data,
 * no auth/DB — so screenshot tooling can photograph the hub the way
 * `/admin/reporting?tab=…` renders it for an org admin.
 */
export const dynamic = 'force-dynamic';

const PROGRAMS = [
  'IT Support Professional Certificate (IBM)',
  'AI and Software Developer Professional Certificate',
  'Google Cybersecurity Professional Certificate',
  'AWS Cloud Solutions Architect Professional Certificate',
] as const;

const PACES: readonly TrainingPace[] = ['On track', 'Ahead', 'Behind', 'Stalled'];
const NAMES = ['Noel Gonzalez', 'Joseph David Ring', 'Avery Stone', 'Maria Santos', 'Priya Kapoor', 'James Whitmore'] as const;

const TRAINING_ROWS: StudentRow[] = Array.from({ length: 18 }, (_, index) => {
  const program = PROGRAMS[index % PROGRAMS.length];
  const modulesTotal = 10 + (index % 8);
  const modulesDone = Math.min(modulesTotal, Math.floor((index * 7) % (modulesTotal + 1)));
  const percentComplete = modulesTotal > 0 ? Math.round((modulesDone / modulesTotal) * 100) : 0;
  const name = NAMES[index % NAMES.length];
  return {
    id: `u${index}:prog-${index % 4}`,
    name,
    email: `${name.toLowerCase().replace(/\s+/g, '.')}@example.test`,
    initials: initialsFrom(name),
    program,
    progress: percentComplete,
    progressKnown: true,
    training: { modulesDone, modulesTotal, pace: PACES[index % PACES.length] },
    courseraGrade: index % 5 === 0 ? null : 70 + (index % 28),
    inWap: true,
    lastActive: index % 4 === 0 ? '16d ago' : index % 2 === 0 ? '2h ago' : '1d ago',
    lastActiveAt: Date.now() - index * 86_400_000,
  };
});

const METRICS = {
  totalMembers: 128,
  weeklyActiveMembers: 41,
  aiToolRuns: 612,
  placementStats: { enrolled: 96, placed: 23, certifications: 57, placementRate: 24 },
  enrollmentByProgram: [
    { program: 'IT Support (IBM)', count: 44 },
    { program: 'Google Cybersecurity', count: 27 },
    { program: 'AI & Software Developer', count: 16 },
    { program: 'AWS Cloud Architect', count: 9 },
  ],
  careerOsMetrics: { completionEventsReceived: 212, actionsCreated: 180, actionsPending: 38, actionsCompleted: 121, followThroughRate: 67 },
};

function OverviewShowcase() {
  return (
    <>
      <ReportingSubsection id="enrollment" title="Enrollment and outcomes" caption="Members, weekly active, placements and certificates for this organization">
        <EnrollmentOutcomesPanel data={buildEnrollmentOutcomesPanel(METRICS)} />
      </ReportingSubsection>
      <ReportingSubsection id="engagement" title="Engagement" caption="Portal activity in the last 7 days and the AI tools members save results from">
        <AnalyticsKit
          embedded
          kpis={[
            { label: 'WAU', value: '41', delta: 'members with any portal event, 7 days', deltaTone: 'muted' },
            { label: 'Avg Session', value: '14m' },
            { label: 'AI Tool Uses', value: '612', delta: 'saved results + voice sessions, members only, all time (same definition as "AI tool runs")', deltaTone: 'muted' },
            { label: 'Voice Sessions', value: '87' },
          ]}
          topTools={[
            { label: 'Resume Studio', value: 96, pct: 100, tone: 'info' },
            { label: 'Interview Practice', value: 61, pct: 64, tone: 'info' },
            { label: 'Job Match Scorer', value: 40, pct: 42, tone: 'info' },
            { label: 'Cover Letter', value: 22, pct: 23, tone: 'info' },
          ]}
          activeByProgram={[
            { label: 'IT Support (IBM)', value: 19, pct: 100, tone: 'info' },
            { label: 'Google Cybersecurity', value: 12, pct: 63, tone: 'info' },
            { label: 'AI & Software Developer', value: 7, pct: 37, tone: 'info' },
          ]}
        />
      </ReportingSubsection>
    </>
  );
}

function OutcomesShowcase() {
  return (
    <BoardOutcomesKit
      embedded
      kpis={[
        { label: 'Placement rate', value: '24%', delta: 'placed of members served this period', deltaTone: 'muted' },
        { label: 'Median wage', value: '$52,000', delta: 'annual, placements with a salary', deltaTone: 'muted' },
        { label: 'Credentials earned', value: 57 },
        { label: '90-day retention', value: '88%', delta: 'retained of decided placements', deltaTone: 'muted' },
      ]}
      placementsByMonth={[
        { label: 'Apr 2026', value: 2 },
        { label: 'May 2026', value: 4 },
        { label: 'Jun 2026', value: 3 },
        { label: 'Jul 2026', value: 6 },
        { label: 'Aug 2026', value: 5 },
        { label: 'Sep 2026', value: 3 },
      ]}
      placementsTotal={23}
      periodLabel="All time"
      byProgram={[
        { label: 'IT Support (IBM)', value: 11, pct: 100, tone: 'info' },
        { label: 'Google Cybersecurity', value: 7, pct: 64, tone: 'info' },
        { label: 'AI & Software Developer', value: 5, pct: 45, tone: 'info' },
      ]}
      exportsHref="/dev/staff/reporting?tab=exports"
      headerAction={
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <nav aria-label="Outcomes period" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {REPORTING_PERIODS.map((period, index) => (
              <Link
                key={period}
                href="/dev/staff/reporting?tab=outcomes"
                className={index === 0 ? 'btn btn-primary btn-small' : 'btn btn-muted btn-small'}
                aria-current={index === 0 ? 'page' : undefined}
              >
                {REPORTING_PERIOD_LABELS[period]}
              </Link>
            ))}
          </nav>
          <Link href="/dev/staff/reporting?tab=outcomes" className="btn btn-outline btn-small">
            <FileDown size={14} aria-hidden style={{ marginRight: 6 }} />
            Board report (print)
          </Link>
          <Link href="/dev/staff/reporting?tab=outcomes" className="wa-kit-focus" style={{ fontSize: 13, fontWeight: 700, color: 'var(--wa-accent)', textDecoration: 'none' }}>
            Methodology →
          </Link>
        </div>
      }
    />
  );
}

function CourseraShowcase() {
  return (
    <CourseraSyncKit
      embedded
      health="healthy"
      healthLabel="Recent events received"
      lastSync="12 min ago"
      learnersSynced="74"
      b4bLatency={null}
      errors="0"
      unmatched={[
        { email: 'zed.coursera@example.com', name: 'Zed Coursera', caption: 'Grade 91% · 3 courses', href: '/dev/staff/reporting?tab=coursera', gradePercent: 91 },
        { email: 'a.learner@example.org', name: null, caption: 'IT Support Badge · 40%', href: '/dev/staff/reporting?tab=coursera', gradePercent: null },
      ]}
      unmatchedTotal={2}
      unmatchedLoaded
      hiddenTestCount={1}
      approvedForEnrollment="96"
      activeLast30Days="58"
      unresolvedOrgSentinels="0"
      forceSyncHref="/dev/staff/reporting?tab=coursera"
      headerAction={
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {['Enrollment pipeline →', 'Provisioning queue →', 'Coursera health →', 'Mapping & sync tools →'].map((label) => (
            <Link key={label} href="/dev/staff/reporting?tab=coursera" style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--wa-info)' }}>
              {label}
            </Link>
          ))}
        </div>
      }
    />
  );
}

export default async function DevStaffReportingPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.VERCEL_ENV === 'production') notFound();
  const params = (await searchParams) ?? {};
  const tab: ReportingTabId = parseReportingTab(params.tab);

  let content: React.ReactNode;
  switch (tab) {
    case 'outcomes':
      content = <OutcomesShowcase />;
      break;
    case 'training':
      content = (
        <StudentsRosterKit
          embedded
          view="training"
          viewHrefs={{ roster: '/dev/staff/students-roster', training: '/dev/staff/reporting?tab=training' }}
          students={TRAINING_ROWS}
          total={TRAINING_ROWS.length}
          showingLabel="18 of 128 members have training activity · Showing 18 learners"
        />
      );
      break;
    case 'coursera':
      content = <CourseraShowcase />;
      break;
    case 'exports':
      // Mirrors app/admin/reporting/sections/ExportsSection.tsx (English labels inlined).
      content = (
        <ExportsKit
          embedded
          exports={[
            { id: 'member-training-report', title: 'Member Training Report', description: 'Demographics, progress, certs, placements & eligibility · filterable CSV', href: '/dev/staff/reporting?tab=exports&ui=legacy', iconKey: 'filters', tone: 'accent' },
            { id: 'eligibility-datasheet', title: 'Eligibility screening datasheet', description: 'WS4 fields · in-admin table + CSV (not Google Sheets)', href: '/dev/staff/reporting?tab=exports&ui=legacy#eligibility-datasheet', iconKey: 'csv', tone: 'gold' },
            { id: 'funder-program-summary', title: 'Funder program summary (CSV)', description: 'Grant reporting · per-program enrollment, completion & placements', href: '/api/admin/funder-program-summary', iconKey: 'csv', tone: 'success', download: true, actionLabel: 'Download funder CSV' },
            { id: 'program-catalog', title: 'Program Catalog', description: 'State agency submissions · costs, duration & certifications', href: '/api/admin/programs/export-twc', iconKey: 'roster', tone: 'info', download: true },
            { id: 'outcomes-csv', title: 'Outcomes CSV', description: 'Board-ready · funnel waterfall (counts + conversion), all time', href: '/api/admin/outcomes/snapshot?period=all-time&format=csv', iconKey: 'csv', tone: 'success', download: true },
            { id: 'board-packet-pdf', title: 'Board meeting PDF', description: 'Printable snapshot with KPIs, cohorts and methodology notes, all time', href: '/api/admin/outcomes/snapshot?period=all-time&format=pdf', iconKey: 'download', tone: 'muted', download: true },
          ]}
        />
      );
      break;
    default:
      content = <OverviewShowcase />;
  }

  return (
    <ReportingHubKit activeTab={tab} tabHref={(id) => reportingTabHref(id).replace('/admin/reporting', '/dev/staff/reporting')}>
      {content}
    </ReportingHubKit>
  );
}
