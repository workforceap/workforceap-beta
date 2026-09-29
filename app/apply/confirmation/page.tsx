import type { Metadata } from 'next';
import LocalizedLink from '@/components/LocalizedLink';
import { Suspense } from 'react';
import { Check } from 'lucide-react';
import LegacyGlyph from '@/components/icons/LegacyGlyph';
import { buildPageMetadataAsync } from '@/app/seo';
import Footer from '@/components/Footer';
import MobileBottomNav from '@/components/MobileBottomNav';
import ApplyConfirmationCta from '@/components/apply/ApplyConfirmationCta';
import ApplyConfirmationReceiptRetry from '@/components/apply/ApplyConfirmationReceiptRetry';
import ThankYouViewTracker from '@/components/marketing/ThankYouViewTracker';
import ShareButtons from '@/components/apply/ShareButtons';
import ProgramCommitmentPanel from '@/components/portal/ProgramCommitmentPanel';
import { getUser } from '@/lib/auth/server';

import { getTranslations } from 'next-intl/server';
import '@/css/portal-tokens.css';
import '../apply-funnel-depth.css';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('apply');
  return buildPageMetadataAsync({
    title: t('confirmationMetaTitle'),
    description: t('confirmationMetaDescription'),
    path: '/apply/confirmation',
  });
}

type PageProps = {
  searchParams?: Promise<{ school?: string; minor?: string; receipt?: string }>;
};

export default async function ApplyConfirmationPage({ searchParams }: PageProps) {
  const sp = searchParams ? await searchParams : {};
  const isSchoolContext = sp.school === '1';
  const isMinorContext = sp.minor === '1';

  const user = await getUser();
  const isAuthenticated = !!user;
  const receiptEmail = user?.email?.trim() ?? '';
  const receiptName =
    (typeof user?.user_metadata?.full_name === 'string' ? user.user_metadata.full_name.trim() : '') ||
    receiptEmail;
  const t = await getTranslations('apply');

  const tKey = (regular: string, school: string) =>
    (isSchoolContext ? t(school as Parameters<typeof t>[0]) : t(regular as Parameters<typeof t>[0])) as string;

  const nextSteps = [
    { num: '1', title: tKey('confirmationStep1Title', 'confirmationSchoolStep1Title'), desc: tKey('confirmationStep1Desc', 'confirmationSchoolStep1Desc') },
    { num: '2', title: tKey('confirmationStep2Title', 'confirmationSchoolStep2Title'), desc: tKey('confirmationStep2Desc', 'confirmationSchoolStep2Desc') },
    { num: '3', title: tKey('confirmationStep3Title', 'confirmationSchoolStep3Title'), desc: tKey('confirmationStep3Desc', 'confirmationSchoolStep3Desc') },
    { num: '4', title: tKey('confirmationStep4Title', 'confirmationSchoolStep4Title'), desc: tKey('confirmationStep4Desc', 'confirmationSchoolStep4Desc') },
  ] as const;

  const whatYouCanDoSignedIn = [
    {
      label: t('confirmationDoStatusLabel'),
      href: '/apply/status',
      desc: t('confirmationDoStatusDesc'),
    },
    {
      label: t('confirmationDoProgramsLabel'),
      href: '/programs',
      desc: t('confirmationDoProgramsDesc'),
    },
  ] as const;

  const whatYouCanDoGuest = [
    {
      label: t('confirmationDoStatusLabel'),
      href: '/apply/status',
      desc: t('confirmationDoStatusDesc'),
    },
    {
      label: t('confirmationDoProgramsLabel'),
      href: '/programs',
      desc: t('confirmationDoProgramsDesc'),
    },
    {
      label: t('confirmationGuestDashboardLabel'),
      href: '/login',
      desc: t('confirmationGuestDashboardDesc'),
    },
  ] as const;

  const trustSignals = [
    { icon: 'badge', title: t('confirmationTrust1Title'), desc: t('confirmationTrust1Desc') },
    { icon: 'volunteer_activism', title: t('confirmationTrust2Title'), desc: t('confirmationTrust2Desc') },
    { icon: 'support_agent', title: t('confirmationTrust3Title'), desc: t('confirmationTrust3Desc') },
  ] as const;

  const whatYouCanDoNow = isAuthenticated ? whatYouCanDoSignedIn : whatYouCanDoGuest;

  return (
    <div className="inner-page mdx afd-page">
      <ThankYouViewTracker funnel="apply" />
      {/* Signup already sent the receipt; retry only when it said that send failed (WAP-240). */}
      {isAuthenticated && receiptEmail && sp.receipt === '0' ? (
        <ApplyConfirmationReceiptRetry email={receiptEmail} fullName={receiptName} />
      ) : null}
      <section className="content-section afd-confirm">
        <div className="container afd-confirm__container">
          <div className="apply-confirmation-shell afd-confirm__shell">
            <div className="afd-confirm__hero">
              <div className="afd-confirm__badge" aria-hidden="true">
                <Check size={44} strokeWidth={2.5} />
              </div>
              <h1 className="text-display-sm afd-confirm__title">{t('confirmationHeroTitle')}</h1>
              <p className="afd-confirm__lead">{tKey('confirmationHeroLead', 'confirmationSchoolHeroLead')}</p>
              <p className="afd-confirm__body">{tKey('confirmationHeroBody', 'confirmationSchoolHeroBody')}</p>
              {isMinorContext ? (
                <p className="afd-confirm__note">{t('confirmationSchoolParentAckNote')}</p>
              ) : null}
              <div className="afd-confirm__chips">
                <span>{t('confirmationChipOnFile')}</span>
                <span className="afd-confirm__chip-sep" aria-hidden="true">
                  •
                </span>
                <span>{t('confirmationChipReceipt')}</span>
                <span className="afd-confirm__chip-sep" aria-hidden="true">
                  •
                </span>
                <span>{tKey('confirmationChipReview', 'confirmationSchoolChipReview')}</span>
              </div>
            </div>

            {isAuthenticated ? (
              <div className="mdx-card afd-confirm__recommend">
                <p className="afd-confirm__recommend-eyebrow">{t('confirmationRecommendedEyebrow')}</p>
                <h2>{t('confirmationSignedInTitle')}</h2>
                <p className="afd-confirm__recommend-body">{t('confirmationSignedInBody')}</p>
                <div className="afd-confirm__recommend-actions">
                  <LocalizedLink href="/dashboard" className="btn btn-primary">
                    {t('confirmationOpenDashboard')}
                  </LocalizedLink>
                  <LocalizedLink href="/apply/status" className="btn btn-secondary">
                    {t('confirmationCheckStatusShort')}
                  </LocalizedLink>
                </div>
              </div>
            ) : (
              <Suspense
                fallback={
                  <div className="afd-confirm__recommend-fallback" aria-hidden="true">
                    <div className="afd-confirm__recommend-fallback-bar" />
                    <div className="afd-confirm__recommend-fallback-bar afd-confirm__recommend-fallback-bar--dim" />
                    <span className="sr-only">{t('confirmationLoadingNext')}</span>
                  </div>
                }
              >
                <ApplyConfirmationCta />
              </Suspense>
            )}

            <section className="mdx-card afd-confirm__section" aria-labelledby="afd-confirm-timeline">
              <h2 id="afd-confirm-timeline" className="afd-confirm__section-label">
                {t('confirmationTimelineHeading')}
              </h2>
              <ol className="afd-confirm__timeline">
                {nextSteps.map((step, index) => {
                  const state = index === 0 ? 'done' : index === 1 ? 'current' : 'upcoming';
                  const stateClass =
                    state === 'done'
                      ? 'afd-confirm__step--done'
                      : state === 'current'
                        ? 'afd-confirm__step--current'
                        : '';
                  return (
                    <li
                      key={step.num}
                      className={`afd-confirm__step ${stateClass}`.trim()}
                      aria-current={state === 'current' ? 'step' : undefined}
                    >
                      <div className="afd-confirm__step-mark" aria-hidden="true">
                        {state === 'done' ? '✓' : step.num}
                      </div>
                      <div>
                        {state === 'done' ? (
                          <span className="afd-confirm__step-state">{t('confirmationStepDoneLabel')}</span>
                        ) : null}
                        {state === 'current' ? (
                          <span className="afd-confirm__step-state">{t('confirmationStepCurrentLabel')}</span>
                        ) : null}
                        <p className="afd-confirm__step-title">{step.title}</p>
                        <p className="afd-confirm__step-desc">{step.desc}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>

            <section className="mdx-card afd-confirm__section" aria-labelledby="afd-confirm-trust">
              <h2 id="afd-confirm-trust" className="afd-confirm__section-label afd-confirm__section-label--tight">
                {t('confirmationTrustHeading')}
              </h2>
              <div className="afd-confirm__trust-grid">
                {trustSignals.map((item) => (
                  <div key={item.title} className="afd-confirm__trust-card">
                    <div className="afd-confirm__trust-head">
                      <LegacyGlyph name={item.icon} size={18} />
                      <p>{item.title}</p>
                    </div>
                    <p>{item.desc}</p>
                  </div>
                ))}
              </div>
            </section>

            <div className="afd-confirm__section">
              <ProgramCommitmentPanel variant="compact" />
            </div>

            <div className="afd-confirm__info-grid">
              <div className="mdx-card">
                <h2>{t('confirmationAlsoHelpfulHeading')}</h2>
                <ul className="afd-confirm__link-list">
                  {whatYouCanDoNow.map((item) => (
                    <li key={item.label}>
                      <LocalizedLink href={item.href}>{item.label}</LocalizedLink>
                      <span className="afd-confirm__link-desc">{item.desc}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mdx-card">
                <h2>{t('confirmationHelpHeading')}</h2>
                <p className="afd-confirm__help-body">
                  {t('confirmationHelpBody')}{' '}
                  <a href="tel:+15127771808">(512) 777-1808</a> {t('confirmationHelpOr')}{' '}
                  <a href="mailto:info@workforceap.org">info@workforceap.org</a>
                  {t('confirmationHelpSuffix')}
                </p>
              </div>
            </div>

            <section className="afd-confirm__share">
              <p className="afd-confirm__share-label">{t('confirmationSpreadWord')}</p>
              <ShareButtons />
            </section>

            <div className="afd-confirm__foot-actions">
              <LocalizedLink href="/apply/status" className="btn btn-secondary">
                {t('confirmationCtaStatus')}
              </LocalizedLink>
              <LocalizedLink href="/programs" className="btn btn-secondary">
                {t('confirmationCtaPrograms')}
              </LocalizedLink>
              <LocalizedLink href="/" className="btn btn-secondary">
                {t('confirmationCtaHome')}
              </LocalizedLink>
            </div>
          </div>
        </div>
      </section>

      <Footer />
      <MobileBottomNav />
      <div className="mobile-bottom-nav-spacer" aria-hidden="true" />
    </div>
  );
}
