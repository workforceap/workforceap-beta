import LocalizedLink from '@/components/LocalizedLink';
import { Suspense } from 'react';
import Footer from '@/components/Footer';
import ApplyEligibilityClient from './ApplyEligibilityClient';
import ApplyPageSkeleton from './ApplyPageSkeleton';
import ApplyProgramIntro from '@/components/apply/ApplyProgramIntro';
import ApplyRefCapture from '@/components/apply/ApplyRefCapture';
import UtmCapture from '@/components/marketing/UtmCapture';
import { getProgramBySlug, resolveApplyProgramSlug } from '@/lib/apply/applyProgramPage';
import { getTranslations } from 'next-intl/server';
import ApplyMobileStepNav from '@/components/apply/ApplyMobileStepNav';
import ApplyMobileTrustBar from '@/components/apply/ApplyMobileTrustBar';
import ApplyOrganicStickyCta from '@/components/apply/ApplyOrganicStickyCta';
import TrustStrip from '@/components/marketing/TrustStrip';
import PreLaunchTag from '@/components/portal/PreLaunchTag';
import type { SchoolApplyContext } from '@/lib/apply/resolveSchoolApply';
import styles from './OrganicApplyPage.module.css';

type OrganicApplyPageProps = { program?: string; schoolApply?: SchoolApplyContext | null };

/* ─── styles ─── */
const sPage = {
  wrapper: {
    fontFamily: 'var(--font-family)',
    background: 'var(--surface-container-lowest)',
    minHeight: '100vh',
  } as React.CSSProperties,

  hero: {
    padding: 'calc(var(--nav-height-default, 80px) + var(--space-8)) var(--space-6) var(--space-8)',
    textAlign: 'center' as const,
  } as React.CSSProperties,

  heroLabel: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    padding: 'var(--space-1) var(--space-3)',
    borderRadius: 'var(--radius-xl)',
    background: 'color-mix(in srgb, var(--color-on-accent) 10%, transparent)',
    border: '1px solid color-mix(in srgb, var(--color-on-accent) 15%, transparent)',
    fontSize: 'var(--font-size-sm)',
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    marginBottom: 'var(--space-4)',
  } as React.CSSProperties,

  heroHeading: {
    fontSize: 'clamp(2rem, 5vw, 2.75rem)',
    fontWeight: 800,
    marginBottom: 'var(--space-4)',
    letterSpacing: '-0.02em',
  } as React.CSSProperties,

  heroDesc: {
    fontSize: 'clamp(1rem, 2.5vw, 1.15rem)',
    lineHeight: 'var(--line-height-normal)',
    maxWidth: 640,
    margin: '0 auto',
  } as React.CSSProperties,

  heroFallback: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--space-3)',
    margin: 'var(--space-6) auto 0',
    padding: 'var(--space-4) var(--space-5)',
    maxWidth: 640,
    borderRadius: 'var(--radius-lg)',
    textAlign: 'left' as const,
  } as React.CSSProperties,

  heroFallbackTitle: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase' as const,
    margin: 0,
  } as React.CSSProperties,

  heroFallbackText: {
    fontSize: 'var(--font-size-sm)',
    lineHeight: 'var(--line-height-normal)',
    margin: 0,
  } as React.CSSProperties,

  heroFallbackActions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--space-3)',
  } as React.CSSProperties,

  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 2fr',
    gap: 'var(--space-6)',
    maxWidth: 'var(--max-width)',
    margin: '0 auto',
    padding: 'var(--space-8) var(--space-6)',
  } as React.CSSProperties,

  sidebar: {
    position: 'sticky' as const,
    top: 'var(--space-6)',
    alignSelf: 'start' as const,
  } as React.CSSProperties,

  sidebarSteps: {
    background: 'var(--surface-container)',
    borderRadius: 'var(--radius-lg)',
    padding: 'var(--space-6)',
    marginBottom: 'var(--space-4)',
  } as React.CSSProperties,

  infoCard: {
    background: 'var(--surface-container)',
    borderRadius: 'var(--radius-lg)',
    padding: 'var(--space-6)',
    border: '1px solid var(--outline-variant)',
  } as React.CSSProperties,

  mainCard: {
    background: 'var(--surface-container-low)',
    borderRadius: 'var(--radius-lg)',
    padding: 'var(--space-8)',
    border: '1px solid var(--outline-variant)',
  } as React.CSSProperties,

  ssrFallback: {
    padding: 'var(--space-6)',
    background: 'var(--surface-container)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--outline-variant)',
    marginBottom: 'var(--space-6)',
  } as React.CSSProperties,

  ssrFallbackHeading: {
    fontSize: 'var(--font-size-xl)',
    fontWeight: 700,
    color: 'var(--color-on-surface)',
    marginBottom: 'var(--space-3)',
  } as React.CSSProperties,

  ssrFallbackText: {
    fontSize: 'var(--font-size-base)',
    color: 'var(--color-on-surface-variant)',
    lineHeight: 'var(--line-height-normal)',
    margin: 0,
  } as React.CSSProperties,

  suppRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 'var(--space-4)',
    maxWidth: 'var(--max-width)',
    margin: '0 auto var(--space-8)',
    padding: '0 var(--space-6)',
  } as React.CSSProperties,

  suppCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--space-3)',
    padding: 'var(--space-6)',
    background: 'var(--surface-container)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--outline-variant)',
  } as React.CSSProperties,
};


const APPLY_PROGRESS_STEPS = [
  { labelKey: 'stepPersonalInfo', icon: 'person' },
  { labelKey: 'stepBackground', icon: 'work' },
  { labelKey: 'stepProgramSelection', icon: 'school' },
] as const;

const SCHOOL_PROGRESS_STEPS = [
  { labelKey: 'schoolStepPersonalInfo', icon: 'person' },
  { labelKey: 'stepBackground', icon: 'school' },
  { labelKey: 'stepProgramSelection', icon: 'key' },
] as const;

export default async function OrganicApplyPage({ program: programParam, schoolApply = null }: OrganicApplyPageProps) {
  const programSlug = resolveApplyProgramSlug(programParam);
  const program = programSlug ? getProgramBySlug(programSlug) : undefined;
  const t = await getTranslations('apply');
  const isSchool = Boolean(schoolApply);
  const progressSteps = isSchool ? SCHOOL_PROGRESS_STEPS : APPLY_PROGRESS_STEPS;

  const helpCard = (
    <div className={`apply-hero-help-card ${styles.helpCard}`} style={sPage.heroFallback}>
      <p style={sPage.heroFallbackTitle}>{t('helpTitle')}</p>
      <p style={sPage.heroFallbackText}>{isSchool ? t('schoolHelpBody', { school: schoolApply?.partnerName ?? '' }) : t('helpBody')}</p>
      <div style={sPage.heroFallbackActions}>
        <LocalizedLink href="/contact" className={styles.helpAction}>
          {t('helpCta1')}
        </LocalizedLink>
        <a href="tel:+15127771808" className={styles.helpAction}>
          {t('helpCta2')}
        </a>
      </div>
    </div>
  );

  return (
    <div className={`apply-page-organic mdx ${styles.page}`} style={sPage.wrapper}>
      {/* ── Hero ── */}
      <section className={`apply-hero mdx-stage ${styles.hero}`} style={sPage.hero}>
        <span className="mdx-pill" style={sPage.heroLabel}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden="true">assured_workload</span>
          {isSchool ? t('schoolHeroLabel') : t('heroLabel')}
        </span>
        <h1 style={sPage.heroHeading}><span className="mdx-grad-accent">{isSchool ? t('schoolHeroHeading') : t('heroHeading')}</span></h1>
        <p className="apply-hero-social" style={{ ...sPage.heroDesc, marginBottom: 'var(--space-2)' }}>{isSchool ? t('schoolApplySocialProof', { school: schoolApply?.partnerName ?? '' }) : t('applySocialProof')}</p>
        {/* Launch-safe cost tag — `PreLaunchTag` (no-cost / grants, not “Pilot Program”) */}
        <div className={styles.costTag} style={{ marginTop: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
          <PreLaunchTag compact />
        </div>
        <p className="apply-hero-desc-full" style={sPage.heroDesc}>
          {isSchool ? t('schoolHeroDesc') : t('heroDesc')}
          <strong> {isSchool ? t('schoolHeroDescHighlight') : t('heroDescHighlight')}</strong>
          <span> {isSchool ? t('schoolHeroDescSuffix') : t('heroDescSuffix')}</span>
        </p>
        <p className="apply-hero-help-compact">
          {t('questionsCall')}{' '}
          <a href="tel:+15127771808" className="apply-hero-help-compact__link">(512) 777-1808</a>
        </p>
        <a href="#apply-form-start" className={`apply-hero-start-cta ${styles.startAction}`}>
          {t('startYourApplication')}
        </a>
        <div className="apply-hero-help-desktop">{helpCard}</div>
      </section>

      {/* ── 12-col grid: sidebar + form ── */}
      <div className="apply-grid-layout" style={sPage.grid}>
        {/* Sidebar (4-col) */}
        <aside className="apply-sidebar" aria-label={t('ariaApplicationSteps')} style={sPage.sidebar}>
          {/* Progress steps */}
          <div className="apply-sidebar-progress mdx-card" style={sPage.sidebarSteps}>
            <h2 className="mdx-eyebrow" style={{ fontSize: 'var(--font-size-sm)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-on-surface-variant)', marginBottom: 'var(--space-4)' }}>
              {t('applicationProgress')}
            </h2>
            <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {progressSteps.map((step, i) => (
                <li key={step.labelKey} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-3) 0', borderBottom: i < 2 ? '1px solid var(--outline-variant)' : 'none' }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: i === 0 ? 'var(--color-accent)' : 'var(--surface-container-highest)',
                    color: i === 0 ? 'var(--color-white)' : 'var(--color-on-surface-variant)',
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 700,
                    flexShrink: 0,
                  }}>
                    {i + 1}
                  </span>
                  <div>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 4, color: i === 0 ? 'var(--color-accent)' : 'var(--color-on-surface-variant)' }} aria-hidden="true">{step.icon}</span>
                    <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: i === 0 ? 700 : 500, color: i === 0 ? 'var(--color-on-surface)' : 'var(--color-on-surface-variant)' }}>{t(step.labelKey as Parameters<typeof t>[0])}</span>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Info card — collapsible on mobile to reduce post-form scroll */}
          <details className="apply-sidebar-next-steps mdx-card" style={sPage.infoCard}>
            <summary className="apply-sidebar-next-steps__summary">{t('whatHappensNext')}</summary>
            <div className="apply-sidebar-next-steps__body">
              <h3 className="apply-sidebar-next-steps__heading">{t('whatHappensNext')}</h3>
              <ol style={{ margin: 0, paddingLeft: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', color: 'var(--color-on-surface-variant)', fontSize: 'var(--font-size-sm)', lineHeight: 'var(--line-height-normal)' }}>
                <li>{t(isSchool ? 'schoolNextStep1' : 'nextStep1')}</li>
                <li>{t(isSchool ? 'schoolNextStep2' : 'nextStep2')}</li>
                <li>{isSchool ? t('schoolNextStep3', { school: schoolApply?.partnerName ?? '' }) : t('nextStep3')}</li>
                <li>{t(isSchool ? 'schoolNextStep4' : 'nextStep4')}</li>
                {isSchool ? null : <li>{t('nextStep5')}</li>}
              </ol>
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-on-surface-variant)', marginTop: 'var(--space-3)', marginBottom: 0 }}>
                {t('questionsCall')} <a href="tel:+15127771808" style={{ color: 'var(--wa-accent-text)', fontWeight: 700 }}>(512) 777-1808</a>
              </p>
            </div>
          </details>
        </aside>

        {/* Main form area (8-col) */}
        <div className="apply-main-form" role="region" aria-label={t('ariaApplicationForm')} style={sPage.mainCard}>
          {program ? (
            <ApplyProgramIntro
              programSlug={program.slug}
              schoolName={schoolApply?.partnerName ?? null}
              schoolRef={schoolApply?.referralCode ?? null}
            />
          ) : null}

          <Suspense fallback={<ApplyPageSkeleton />}>
            <ApplyRefCapture />
            <UtmCapture />
          </Suspense>


          <noscript
            dangerouslySetInnerHTML={{
              __html: `<div><h2>${t('startYourApplication')}</h2><p>${t('ifFormDoesntLoad')} <a href="tel:+15127771808">(512) 777-1808</a> ${t('orEmail')} <a href="mailto:info@workforceap.org">info@workforceap.org</a>.</p></div>`,
            }}
          />

          <div id="apply-form-start" className="apply-main-form__primary">
            <ApplyMobileTrustBar />
            <ApplyMobileStepNav activeStep={0} showTimeHint school={isSchool} />
            <p className="apply-organic-form-kicker" role="note">
              {t('step1Kicker')}
            </p>
            {isSchool ? null : <TrustStrip variant="apply" />}

            <Suspense fallback={<ApplyPageSkeleton />}>
              <ApplyEligibilityClient schoolApply={schoolApply} />
            </Suspense>
          </div>
          <details className="apply-docs-checklist apply-foundational-support" role="region" aria-labelledby="apply-docs-checklist-heading">
            <summary className="apply-docs-checklist__summary">{t(isSchool ? 'schoolDocsSummary' : 'docsChecklistSummary')}</summary>
            <div className="apply-docs-checklist__body">
              <h2 id="apply-docs-checklist-heading" className="apply-foundational-support__title apply-docs-checklist__heading">
                {isSchool ? t('schoolDocsTitle', { school: schoolApply?.partnerName ?? '' }) : t('docsChecklistTitle')}
              </h2>
              <p className="apply-docs-checklist__lead">{t(isSchool ? 'schoolDocsLead' : 'docsChecklistLead')}</p>
              <ul className="apply-foundational-support__list">
                {isSchool ? (
                  <>
                    <li>{t('schoolDocsItem1')}</li>
                    <li>{t('schoolDocsItem2')}</li>
                    <li>{t('schoolDocsItem3')}</li>
                  </>
                ) : (
                  <>
                    <li>{t('docsChecklistItem1')}</li>
                    <li>{t('docsChecklistItem2')}</li>
                    <li>{t('docsChecklistItem3')}</li>
                    <li>{t('docsChecklistItem4')}</li>
                  </>
                )}
              </ul>
              <p className="apply-docs-checklist__note">{t(isSchool ? 'schoolDocsNote' : 'docsChecklistNote')}</p>
            </div>
          </details>
        </div>

        <div className="apply-hero-help-mobile" aria-label={t('helpTitle')}>
          {helpCard}
        </div>
      </div>

      {/* ── Supplemental cards ── */}
      <div className="apply-supp-row" role="region" aria-label={t('ariaProgramInformation')} style={sPage.suppRow}>
        <div className="mdx-card" style={sPage.suppCard}>
          <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--color-green)', flexShrink: 0, marginTop: 2 }} aria-hidden="true">lock</span>
          <div>
            <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-on-surface)', marginBottom: 'var(--space-1)' }}>{t('suppCard1Title')}</h3>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-on-surface-variant)', lineHeight: 'var(--line-height-normal)', margin: 0 }}>
              {t('suppCard1Body')} <LocalizedLink href="/privacy" style={{ color: 'inherit', textDecoration: 'underline' }}>{t('privacyPolicy')}</LocalizedLink>.
            </p>
          </div>
        </div>
        <div className="mdx-card" style={sPage.suppCard}>
          <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--color-blue)', flexShrink: 0, marginTop: 2 }} aria-hidden="true">bolt</span>
          <div>
            <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 700, color: 'var(--color-on-surface)', marginBottom: 'var(--space-1)' }}>{t('suppCard2Title')}</h3>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-on-surface-variant)', lineHeight: 'var(--line-height-normal)', margin: 0 }}>
              {t('suppCard2Body')}
            </p>
          </div>
        </div>
      </div>

      <Footer />
      <ApplyOrganicStickyCta />

      {/* Responsive overrides — mobile: shorter hero, form first, help below form */}
      <style>{`
        .apply-docs-checklist__lead,
        .apply-docs-checklist__note {
          font-size: var(--font-size-sm);
          line-height: var(--line-height-normal);
          color: var(--color-on-surface-variant);
          margin: 0 0 var(--space-3);
        }

        .apply-docs-checklist__note {
          margin: var(--space-3) 0 0;
        }

        .apply-hero-help-compact,
        .apply-hero-help-mobile {
          display: none;
        }

        .apply-hero-help-compact {
          margin: var(--space-4) auto 0;
          max-width: 640px;
          font-size: var(--font-size-sm);
          line-height: var(--line-height-normal);
          color: var(--mdx-surface);
        }

        .apply-hero-help-compact__link {
          color: var(--color-on-accent);
          font-weight: 700;
          text-decoration: underline;
          text-underline-offset: 2px;
        }

        .apply-hero-help-mobile {
          max-width: var(--max-width);
          margin: 0 auto var(--space-6);
          padding: 0 var(--space-4);
        }

        .apply-organic-form-kicker {
          display: none;
        }

        @media (min-width: 769px) {
          .apply-docs-checklist__summary {
            display: none;
          }
          .apply-docs-checklist__body {
            display: block;
            margin-top: 0;
          }

          .apply-sidebar-next-steps__summary {
            display: none;
          }
          .apply-sidebar-next-steps__heading {
            font-size: var(--font-size-sm);
            font-weight: 700;
            color: var(--color-on-surface);
            margin: 0 0 var(--space-2);
          }
          .apply-sidebar-next-steps__body {
            display: block;
            margin-top: 0;
          }
        }

        .apply-organic-sticky-cta {
          display: none;
        }

        @media (max-width: 768px) {
          .apply-page-organic {
            padding-bottom: calc(var(--space-8) + 4.5rem + env(safe-area-inset-bottom, 0px));
          }

          .apply-organic-sticky-cta {
            display: block;
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 40;
            padding: var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom, 0px));
            background: color-mix(in srgb, var(--surface-container-lowest) 96%, transparent);
            border-top: 1px solid var(--outline-variant);
            box-shadow: 0 -8px 24px color-mix(in srgb, var(--color-on-surface) 8%, transparent);
            backdrop-filter: blur(8px);
          }

          .apply-organic-sticky-cta__button {
            width: 100%;
            max-width: var(--max-width);
            margin: 0 auto;
            display: flex;
            min-height: 48px;
            background: var(--color-accent);
            color: var(--wa-on-accent-control);
            font-size: 1rem;
            line-height: 1.5;
            white-space: normal;
            font-weight: 700;
          }

          .apply-flow--step1:not(.apply-flow--paid) .apply-progress-bar,
          .apply-flow--step1:not(.apply-flow--paid) .apply-step-kicker {
            display: none;
          }

          .apply-flow--step1:not(.apply-flow--paid) .apply-step1-actions {
            scroll-margin-bottom: calc(4.5rem + env(safe-area-inset-bottom, 0px));
          }

          .apply-hero {
            padding: calc(var(--nav-height-default, 80px) + var(--space-5)) var(--space-4) var(--space-5) !important;
          }
          /* Vague social proof repeats below the fold — keep hero scannable on small screens */
          .apply-hero-social {
            display: none !important;
          }
          .apply-hero-desc-full,
          .apply-hero-help-desktop {
            display: none !important;
          }
          .apply-hero-help-compact,
          .apply-hero-help-mobile {
            display: block;
          }
          .apply-organic-form-kicker {
            display: block;
            margin: 0 0 var(--space-3);
            padding: 0;
            border: none;
            background: transparent;
            font-size: var(--font-size-sm);
            font-weight: 500;
            letter-spacing: 0;
            color: var(--color-on-surface-variant);
            line-height: var(--line-height-normal);
            text-align: center;
          }
          .apply-grid-layout {
            grid-template-columns: 1fr !important;
            padding: var(--space-6) var(--space-4) !important;
            gap: var(--space-4) !important;
          }
          .apply-main-form {
            order: -1;
            padding: var(--space-5) var(--space-4) !important;
            display: flex;
            flex-direction: column;
          }
          .apply-main-form__primary {
            order: 1;
          }
          .apply-foundational-support,
          .apply-docs-checklist {
            order: 2;
            margin-top: var(--space-4);
            margin-bottom: 0;
          }
          .apply-docs-checklist__summary {
            display: list-item;
            cursor: pointer;
            font-size: var(--font-size-sm);
            font-weight: 700;
            color: var(--color-on-surface);
            min-height: 44px;
            padding: var(--space-1) 0;
            list-style-position: outside;
          }
          .apply-docs-checklist__summary::-webkit-details-marker {
            color: var(--color-green);
          }
          .apply-docs-checklist__heading {
            display: none;
          }
          .apply-docs-checklist__body {
            margin-top: var(--space-2);
          }
          .apply-program-intro {
            order: 0;
          }
          .apply-hero-help-mobile {
            order: 0;
          }
          .apply-sidebar {
            position: static !important;
            order: 1;
          }
          .apply-sidebar-progress {
            display: none;
          }
          .apply-sidebar-next-steps__summary {
            display: list-item;
            cursor: pointer;
            font-size: var(--font-size-sm);
            font-weight: 700;
            color: var(--color-on-surface);
            min-height: 44px;
            padding: var(--space-1) 0;
            list-style-position: outside;
          }
          .apply-sidebar-next-steps__summary::-webkit-details-marker {
            color: var(--color-accent);
          }
          .apply-sidebar-next-steps__heading {
            display: none;
          }
          .apply-sidebar-next-steps__body {
            margin-top: var(--space-2);
          }
          .apply-supp-row > div:nth-child(2) {
            display: none;
          }
          .apply-supp-row {
            grid-template-columns: 1fr !important;
            padding-inline: var(--space-4) !important;
          }
          /* Hero already shows social proof — avoid duplicate above the form */
          .apply-flow--step1:not(.apply-flow--paid) .apply-social-proof {
            display: none;
          }
          /* Sidebar covers next steps — keep step 1 form scannable */
          .apply-flow--step1:not(.apply-flow--paid) .apply-transition-card {
            display: none;
          }
          #apply-form-start {
            scroll-margin-top: calc(var(--nav-height-default, 80px) + var(--space-4));
          }
        }
      `}</style>
    </div>
  );
}
