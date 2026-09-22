import Link from 'next/link';
import dynamic from 'next/dynamic';
import ErrorBoundary from '@/components/error/ErrorBoundary';
import DashboardErrorFallback from '@/components/error/DashboardErrorFallback';
import type { DashboardTranslator, PointsSummary, PointsTransactionSummary } from './types';

const PointsWidget = dynamic(() => import('@/components/portal/PointsWidget'), {
  loading: () => null,
});

/* Points widget (mobile) - extracted verbatim from page.tsx. */
export default function MobilePointsSection({
  t,
  memberPoints,
  recentTx,
}: {
  t: DashboardTranslator;
  memberPoints: PointsSummary | null;
  recentTx: PointsTransactionSummary[];
}) {
  return (
        <ErrorBoundary fallback={<DashboardErrorFallback section="points" />}>
          <section aria-label="Points and rewards" style={{ padding: '0 1.25rem', marginBottom: '1.25rem' }}>
            {memberPoints ? (
              <PointsWidget
                total={memberPoints.total}
                level={memberPoints.level}
                recent={recentTx}
                compact
              />
          ) : (
            <div className="portal-card portal-card--flat" style={{ padding: '1rem', borderRadius: '0.875rem' }}>
              <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-on-surface)' }}>{t('yourFirstPointsWaiting')}</p>
              <p style={{ margin: '0.35rem 0 0.75rem', fontSize: '0.8125rem', lineHeight: 1.5, color: 'var(--color-on-surface-variant)' }}>
                {t('earnPointsDescription')}
              </p>
              <Link href="/dashboard/ai-tools/resume-studio?view=rewrite" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                {t('uploadImproveResume')}
              </Link>
              <Link
                href="/dashboard/points"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  marginTop: '0.75rem',
                  fontSize: '0.8125rem',
                  fontWeight: 700,
                  color: 'var(--wa-accent-text)',
                  textDecoration: 'none',
                }}
              >
                How to earn points
                <span className="material-symbols-outlined" style={{ fontSize: '1rem' }} aria-hidden="true">
                  arrow_forward
                </span>
              </Link>
            </div>
          )}
          </section>
        </ErrorBoundary>
  );
}
