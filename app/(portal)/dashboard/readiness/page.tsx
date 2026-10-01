import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import { getUser } from '@/lib/auth/server';
import { getScoreBreakdownSafeResult } from '@/lib/readiness/score';
import PageHeader from '@/components/portal/PageHeader';
import ReadinessMemberClient from './ReadinessMemberClient';
import ReadinessMobileScoreCard from '@/components/portal/ReadinessMobileScoreCard';
import CompactReadinessCoach from '@/components/portal/CompactReadinessCoach';
import ReadinessCoachReturnButton from '@/components/portal/ReadinessCoachReturnButton';
import { ReadinessProgressSummary } from '@/components/portal/ReadinessProgressSummary';
import { getMemberReadinessSections } from '@/lib/readiness/memberReadinessSections';
import { MemberProgressKit } from '@/components/portal/kit/pages/member/MemberProgressKit';
import { buildReadinessProgressView } from '@/lib/readiness/progressView';
import {
  READINESS_SCORE_LOAD_ERROR,
  buildFactualReadinessRecap,
  buildReadinessRecapBreakdown,
} from '@/lib/readiness/progressSummary';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard');
  return buildPageMetadataAsync({
    title: t('readinessMetaTitle'),
    description: t('readinessMetaDesc'),
    path: '/dashboard/readiness',
  });
}

const LEGACY_CATEGORY_META = [
  { icon: 'description', color: 'var(--wa-info)' },
  { icon: 'workspace_premium', color: 'var(--wa-accent)' },
  { icon: 'record_voice_over', color: 'var(--wa-success)' },
  { icon: 'trending_up', color: 'var(--wa-gold)' },
] as const;

export default async function DashboardReadinessPage({
  searchParams,
}: {
  searchParams?: Promise<{ ui?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/readiness');

  const readOnlyAudit = isReadOnlyPortalAuditHeader(await headers());
  const params = await searchParams;
  const requestedUi = typeof params?.ui === 'string' ? params.ui : null;

  const [scoreResult, checklistSections] = await Promise.all([
    getScoreBreakdownSafeResult(user.id),
    getMemberReadinessSections(user.id).catch((e) => {
      console.error('[dashboard/readiness] checklist load failed', e);
      return null;
    }),
  ]);
  const scoreLoadFailed = scoreResult.loadFailed;
  const checklistLoadFailed = checklistSections === null;
  const view = buildReadinessProgressView(scoreResult.breakdown);
  const overallScore = view.overallScore;
  const factualSummary = scoreLoadFailed
    ? READINESS_SCORE_LOAD_ERROR
    : buildFactualReadinessRecap(view);
  const categories = view.categories.map((cat, i) => ({
    label: cat.label,
    pct: cat.pct,
    icon: LEGACY_CATEGORY_META[i]?.icon ?? 'trending_up',
    color: LEGACY_CATEGORY_META[i]?.color ?? 'var(--wa-accent)',
  }));
  const priorityAction = view.priorityAction
    ? { label: view.priorityAction.label, href: view.priorityAction.href }
    : null;

  // ── v2 KIT is the DEFAULT for Career Readiness (real data); legacy view stays
  // reachable via ?ui=legacy. Runs AFTER the auth guard above and reuses the
  // score breakdown + derived categories already loaded — no extra queries.
  if (requestedUi !== 'legacy') {
    return (
      <>
        {readOnlyAudit ? (
          <span hidden data-portal-audit-suppressed="member-readiness-summary-generation" />
        ) : null}
        {checklistLoadFailed ? (
          <span hidden data-portal-error-state="member-readiness-checklist-load" />
        ) : null}
        <MemberProgressKit
          readinessScore={scoreLoadFailed ? 0 : view.overallScore}
          readinessNote={view.readinessNote}
          weekStats={scoreLoadFailed ? [] : view.weekStats}
          milestones={scoreLoadFailed ? [] : view.milestones}
          nextAction={scoreLoadFailed ? null : view.priorityAction}
          loadFailed={scoreLoadFailed}
          summary={
            <ReadinessProgressSummary
              factualSummary={factualSummary}
              nextAction={scoreLoadFailed ? null : view.priorityAction}
              breakdown={scoreLoadFailed ? null : buildReadinessRecapBreakdown(view)}
              enableGeneration={!scoreLoadFailed && !readOnlyAudit}
              loadFailed={scoreLoadFailed}
            />
          }
        />
      </>
    );
  }

  return (
    <>
      {scoreLoadFailed || checklistLoadFailed ? (
        <span hidden data-portal-error-state="member-readiness-load" />
      ) : null}
      <PageHeader
        title="Career Readiness"
        subtitle={
          <>
            <span className="wa-block md:wa-hidden">Your readiness score across 4 key categories.</span>
            <span className="wa-hidden md:wa-block">Track your progress from training to landing a job. Your counselor updates this as you hit milestones.</span>
          </>
        }
        breadcrumbs={[{ label: 'Member Portal', href: '/dashboard' }, { label: 'Job Readiness' }]}
      />
      <div className="md:wa-hidden" style={{ paddingBottom: '6rem' }}>
        <ReadinessMobileScoreCard
          overallScore={overallScore}
          categories={categories}
          priorityAction={priorityAction}
        />

        <div id="readiness-coach-panel" className="portal-pad-x" style={{ marginTop: '1rem', scrollMarginTop: '6rem' }}>
          <CompactReadinessCoach />
        </div>

        <ReadinessCoachReturnButton />      </div>

      {/* ── DESKTOP ── */}
      <div className="wa-hidden md:wa-block">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 340px',
            gap: '1.5rem',
            alignItems: 'start',
          }}
        >
          <div>
          {/* Score summary — desktop metric strip */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              {/* Overall score ring */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', padding: '1.25rem', background: 'var(--surface-container-low)', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.05)', flex: '0 0 auto' }}>
                <div style={{ position: 'relative', width: '5rem', height: '5rem', flexShrink: 0 }}>
                  <svg style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }} viewBox="0 0 80 80" aria-hidden>
                    <circle cx="40" cy="40" r="34" fill="transparent" stroke="var(--surface-container-high)" strokeWidth="6" />
                    <circle
                      cx="40" cy="40" r="34" fill="transparent"
                      stroke="var(--color-accent)" strokeWidth="6"
                      strokeDasharray={213.6}
                      strokeDashoffset={213.6 - (213.6 * overallScore) / 100}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--wa-accent-text)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{overallScore}</span>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)' }}>/ 100</span>
                  </div>
                </div>
                <div>
                  <p style={{ fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-on-surface-variant)', margin: '0 0 0.25rem' }}>Overall Score</p>
                  <p style={{ fontSize: '1.375rem', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--color-on-surface)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{overallScore}<span style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}> / 100</span></p>
                  {priorityAction && (
                    <a href={priorityAction.href} className="hover:wa-underline" style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--wa-accent-text)', textDecoration: 'none', display: 'block', marginTop: '0.375rem' }}>
                      Next: {priorityAction.label.slice(0, 50)}{priorityAction.label.length > 50 ? '…' : ''} →
                    </a>
                  )}
                </div>
              </div>

              {/* Category mini-metrics */}
              <div className="portal-metric-strip" style={{ flex: 1 }}>
                {categories.map((cat) => (
                  <div key={cat.label} className="portal-metric-card">
                    <div style={{ width: '2rem', height: '2rem', borderRadius: '0.5rem', background: `${cat.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.25rem' }}>
                      <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '1rem', color: cat.color, fontVariationSettings: "'FILL' 1" }}>{cat.icon}</span>
                    </div>
                    <p className="portal-metric-card__value" style={{ fontSize: '1.375rem', color: cat.pct >= 60 ? cat.color : 'var(--color-on-surface)', fontVariantNumeric: 'tabular-nums' }}>{cat.pct}%</p>
                    <p className="portal-metric-card__label">{cat.label}</p>
                    <div className="portal-progress-bar portal-progress-bar--thin" style={{ marginTop: '0.5rem' }}>
                      <div className="portal-progress-bar__fill" style={{ width: `${cat.pct}%`, background: cat.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <ReadinessMemberClient
            initialSections={checklistSections ?? []}
            loadError={checklistSections === null ? 'Couldn\'t load your checklist — try refreshing the page.' : null}
          />
          </div>

          <aside
            id="readiness-coach-panel"
            style={{
              position: 'sticky',
              top: 'calc(var(--main-nav-layout-height, 4rem) + 1rem)',
              scrollMarginTop: '6rem',
            }}
          >
            <CompactReadinessCoach />
          </aside>
        </div>
      </div>
    </>
  );
}
