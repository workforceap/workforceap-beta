import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import LocalizedLink from '@/components/LocalizedLink';
import Footer from '@/components/Footer';
import { auditLog } from '@/lib/audit';
import { withSystemGuc } from '@/lib/db/withRequestGuc';
import { captureApiError } from '@/lib/observability/captureApiError';
import { programDisplayTitle } from '@/lib/content/programTitle';
import {
  MEMBER_APPLICATION_PROGRESS_STEPS,
  buildMemberApplicationStatusView,
} from '@/lib/member/memberApplicationStatus';
import {
  APPLICATION_STATUS_LINK_PARAM,
  APPLICATION_STATUS_LINK_TTL_MINUTES,
  verifyApplicationStatusLinkToken,
} from '@/lib/apply/statusLinkToken';
import { STATUS_LINK_VIEWED_ACTION } from '@/lib/apply/statusLinkRequest';
import {
  counselorNameForStatusLink,
  loadApplicationForStatusLink,
  type StatusLinkApplication,
} from '@/lib/apply/statusLookup';
import '../../apply-funnel-depth.css';

/**
 * Product call 28a: the page a signed status link opens. Verifies the token,
 * reads the application under its own organization and renders the SAME
 * stage label and next step the member dashboard shows
 * (lib/member/memberApplicationStatus.ts). An expired, tampered or stale link
 * renders a calm "request a new one" page; nothing on this route throws to
 * the visitor and no email appears in the URL or the HTML.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('apply');
  return {
    title: t('statusViewMetaTitle'),
    robots: { index: false, follow: false },
    // The token is in the query string; never leak it to linked sites.
    referrer: 'no-referrer',
  };
}

type SearchParams = Record<string, string | string[] | undefined>;

function tokenFrom(searchParams: SearchParams): string {
  const raw = searchParams[APPLICATION_STATUS_LINK_PARAM];
  return typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] ?? '' : '';
}

async function resolveApplication(token: string): Promise<StatusLinkApplication | null> {
  let verified: ReturnType<typeof verifyApplicationStatusLinkToken>;
  try {
    verified = verifyApplicationStatusLinkToken(token);
  } catch (err) {
    // Missing signing secret is an operator problem, not the applicant's.
    captureApiError(err, { route: 'apply/status/view/verify' });
    return null;
  }
  if (!verified.ok) return null;
  try {
    return await withSystemGuc(async () => {
      const application = await loadApplicationForStatusLink(verified);
      if (!application) return null;
      await auditLog({
        actorUserId: application.user.id,
        actorEmailSnapshot: application.user.email,
        actorRoleSnapshot: 'member',
        action: STATUS_LINK_VIEWED_ACTION,
        targetType: 'Application',
        targetId: application.id,
        metadata: { orgId: application.user.organizationId, status: application.status },
      }).catch((err) => captureApiError(err, { route: 'apply/status/view/audit' }));
      return application;
    });
  } catch (err) {
    captureApiError(err, { route: 'apply/status/view/load' });
    return null;
  }
}

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="inner-page mdx afd-page">
      <section className="page-hero afd-hero-wrap">
        <div className="page-hero-content mdx-stage">
          <h1><span className="mdx-grad-accent">{title}</span></h1>
          <p>{subtitle}</p>
        </div>
      </section>
      <section className="content-section afd-band">
        <div className="container" style={{ maxWidth: '640px' }}>
          <div className="mdx-card afd-surface">{children}</div>
        </div>
      </section>
      <Footer />
    </div>
  );
}

export default async function ApplyStatusViewPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const [t, locale] = await Promise.all([getTranslations('apply'), getLocale()]);
  const minutes = APPLICATION_STATUS_LINK_TTL_MINUTES;

  const application = await resolveApplication(tokenFrom(searchParams));

  if (!application) {
    return (
      <Shell title={t('statusViewExpiredTitle')} subtitle={t('statusViewExpiredBody', { minutes })}>
        <div role="status">
          <p style={{ margin: '0 0 1rem' }}>{t('statusViewExpiredHelp')}</p>
          <LocalizedLink href="/apply/status" className="btn btn-primary">
            {t('statusViewExpiredCta')}
          </LocalizedLink>
        </div>
      </Shell>
    );
  }

  const view = buildMemberApplicationStatusView(application, {
    enrolledProgram: application.user.enrolledProgram,
    enrolledAt: application.user.enrolledAt,
    assessmentCompleted: application.user.assessmentCompleted,
  });
  const counselorName = counselorNameForStatusLink(application);
  const submittedAt = view?.submittedAt ?? null;
  const submittedLabel = submittedAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(submittedAt)
    : null;
  const program = application.programInterest ? programDisplayTitle(application.programInterest) : null;
  const firstName = application.user.fullName.trim().split(/\s+/)[0] || '';

  return (
    <Shell
      title={t('statusViewHeroTitle')}
      subtitle={firstName ? t('statusViewHeroSubtitleNamed', { name: firstName }) : t('statusViewHeroSubtitle')}
    >
      <div className="apply-status-view">
        {view?.progressIndex ? (
          <ol className="apply-status-steps" aria-label={t('statusViewProgressLabel')} style={{ listStyle: 'none', padding: 0, margin: '0 0 1.5rem' }}>
            {MEMBER_APPLICATION_PROGRESS_STEPS.map((step, i) => {
              const stepNum = i + 1;
              const state = stepNum < view.progressIndex! ? 'completed' : stepNum === view.progressIndex ? 'active' : '';
              return (
                <li
                  key={step}
                  className={`apply-status-step${state ? ` ${state}` : ''}`}
                  aria-current={state === 'active' ? 'step' : undefined}
                  style={{ cursor: 'default' }}
                >
                  <span className="apply-status-dot" aria-hidden="true">{stepNum}</span>
                  <span className="apply-status-label">{step}</span>
                  <span className="apply-status-label-short" aria-hidden="true">{stepNum}</span>
                </li>
              );
            })}
          </ol>
        ) : null}

        <p className="apply-step-desc" style={{ margin: '0 0 0.25rem' }}>{t('statusViewCurrentLabel')}</p>
        <h2 className="apply-step-title" data-status-stage={view?.stage ?? 'unknown'} style={{ margin: '0 0 1rem' }}>
          {view?.label ?? t('statusViewUnknownLabel')}
        </h2>

        <dl style={{ margin: '0 0 1.25rem', display: 'grid', gap: '0.5rem' }}>
          {submittedLabel ? (
            <div>
              <dt style={{ fontWeight: 600, display: 'inline' }}>{t('statusViewSubmittedLabel')}: </dt>
              <dd style={{ display: 'inline', margin: 0 }}>{submittedLabel}</dd>
            </div>
          ) : null}
          {program ? (
            <div>
              <dt style={{ fontWeight: 600, display: 'inline' }}>{t('statusViewProgramLabel')}: </dt>
              <dd style={{ display: 'inline', margin: 0 }}>{program}</dd>
            </div>
          ) : null}
          {counselorName ? (
            <div>
              <dt style={{ fontWeight: 600, display: 'inline' }}>{t('statusViewCounselorLabel')}: </dt>
              <dd style={{ display: 'inline', margin: 0 }} data-counselor-name>{counselorName}</dd>
            </div>
          ) : null}
        </dl>

        <h3 style={{ fontSize: '1rem', margin: '0 0 0.5rem' }}>{t('statusViewNextLabel')}</h3>
        <p style={{ margin: '0 0 1.25rem' }}>{view?.nextStep ?? t('statusViewUnknownNext')}</p>

        <p style={{ margin: '0 0 0.5rem' }}>{t('statusLoginCtaLead')}</p>
        <LocalizedLink href="/login?redirectTo=/dashboard" className="btn btn-primary">
          {t('statusLoginCta')}
        </LocalizedLink>

        <p className="afd-footnote" style={{ marginTop: '1.5rem' }}>
          {t('statusViewLinkNote', { minutes })}{' '}
          <LocalizedLink href="/apply/status">{t('statusViewRequestAgain')}</LocalizedLink>
        </p>
      </div>
    </Shell>
  );
}
