import Image from 'next/image';
import LocalizedLinkServer from '@/components/LocalizedLinkServer';
import { MARKETING_JOURNEY_STEPS, type MarketingJourneyStep } from '@/lib/content/marketingJourneySteps';
import { getProgramExtra } from '@/lib/content/programExtras';
import { WORKFORCEAP_PROGRAM_CATALOG_SIZE } from '@/lib/content/programs';
import { heroPhotoForKey } from '@/lib/marketing/heroPhotos';
import {
  buttonPresets,
  primaryButtonClasses,
  secondaryButtonClasses,
} from '@/lib/ui/buttonClasses';
import { getTranslations } from 'next-intl/server';

export type HomeProgramShowcaseCard = {
  slug: string;
  name?: string | null;
  category?: string | null;
  duration?: string | null;
  static?: { title?: string | null; duration?: string | null; categoryLabel?: string | null } | null;
};

function getHomepageProgramCardImage(program: HomeProgramShowcaseCard, index: number) {
  return heroPhotoForKey(program.slug || String(index));
}

/** One-line chooser hint from existing catalog extras — no new claims. */
function homepageProgramCardHint(slug: string): string | undefined {
  const extra = getProgramExtra(slug);
  if (!extra) return undefined;
  if (extra.rampNote) return extra.rampNote;
  if (extra.bestFor.length <= 90) return extra.bestFor;
  return undefined;
}

export default async function HomePageBelowFold({
  homeProgramShowcase,
  programCount,
}: {
  homeProgramShowcase: HomeProgramShowcaseCard[];
  programCount: number;
}) {
  const t = await getTranslations('marketing.home');

  const journeyPhaseLabel = (phase: MarketingJourneyStep['homePhase']) => {
    if (phase === 1) return t('journeyPhaseGetStarted');
    if (phase === 2) return t('journeyPhaseTrain');
    return t('journeyPhaseLaunch');
  };

  return (
    <>
      {/* Member promise — no-cost career training. Moved below the vision-led hero
          so the mission leads and the member offer follows immediately after. */}
      <section
        className="home-member-promise"
        aria-label="No-cost career training"
        style={{
          background: 'var(--surface-container-lowest)',
          padding: 'clamp(2.5rem, 6vw, 4.5rem) clamp(1rem, 4vw, 2rem)',
        }}
      >
        <div style={{ maxWidth: '880px', margin: '0 auto', textAlign: 'center' }}>
          <span
            className="home-member-promise__eyebrow text-label-upper"
            style={{ color: 'var(--color-accent)', marginBottom: '0.75rem', display: 'inline-block' }}
          >
            {t('memberPromiseEyebrow')}
          </span>
          <h2 className="home-member-promise__title text-display-sm" style={{ marginBottom: '1.25rem' }}>
            {t('memberPromiseTitle')}{' '}
            <span style={{ color: 'var(--color-accent)' }}>{t('memberPromiseTitleAccent')}</span>
          </h2>
          <p
            className="home-member-promise__body-primary"
            style={{ color: 'var(--color-on-surface-variant)', lineHeight: 1.7, marginBottom: '1rem', fontSize: '1.05rem' }}
          >
            {t('memberPromiseBody1')}
          </p>
          <p
            className="home-member-promise__pathfinder"
            style={{ color: 'var(--color-on-surface-variant)', lineHeight: 1.7, marginBottom: '2rem' }}
          >
            {t('memberPromiseBody2')}
          </p>
          <div className="home-member-promise__actions">
            <LocalizedLinkServer href="/apply" className={primaryButtonClasses({ radius: 'md' })}>
              {t('heroMobilePrimaryCta')}
            </LocalizedLinkServer>
          </div>
        </div>
      </section>

      {/* Featured programs — directly after the member promise so mobile visitors see
          concrete pathways before stakeholder cards and long-form about content. */}
      <section
        className="home-program-showcase home-program-showcase--early"
        aria-label="Available programs"
        style={{ padding: 'clamp(3rem, 6vw, 6rem) clamp(1rem, 4vw, 2rem)', maxWidth: '1400px', margin: '0 auto' }}
      >
        <div className="home-program-showcase__header">
          <span className="text-label-upper" style={{ color: 'var(--color-accent)', marginBottom: '0.75rem', display: 'inline-block' }}>
            {t('programsEyebrow')}
          </span>
          <h2 className="text-display-sm" style={{ marginBottom: '1rem' }}>
            {t('programsTitle')}
          </h2>
          <p style={{ color: 'var(--color-on-surface-variant)', maxWidth: '600px' }}>
            {t('programsSubtitle', { featuredCount: homeProgramShowcase.length, count: programCount })}
          </p>
        </div>
        <div
          className="home-program-showcase__grid"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: '1.5rem' }}
        >
          {homeProgramShowcase.map((p, index) => {
            const cardHint = homepageProgramCardHint(p.slug);
            const categoryLabel = p.static?.categoryLabel ?? p.category;
            return (
            <LocalizedLinkServer
              key={p.slug}
              href={`/programs/${p.slug}`}
              aria-label={`${p.static?.title ?? p.name}, ${t('programsCardCta')}`}
              className="portal-card portal-card--flat home-program-card"
              style={{
                background: 'var(--surface-container-high)',
                color: 'var(--color-on-surface)',
                textDecoration: 'none',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                borderRadius: 'var(--radius-xl)',
              }}
            >
              <div
                className="home-program-card__media"
                style={{ position: 'relative', height: '180px', background: 'var(--surface-container-highest)', overflow: 'hidden' }}
              >
                <Image
                  src={getHomepageProgramCardImage(p, index)}
                  alt={p.static?.title ?? p.name ?? ''}
                  fill
                  loading="lazy"
                  sizes="(max-width: 768px) 100vw, 33vw"
                  style={{ objectFit: 'cover', opacity: 0.7 }}
                />
                <span
                  style={{
                    position: 'absolute',
                    top: '0.75rem',
                    left: '0.75rem',
                    padding: '0.25rem 0.75rem',
                    borderRadius: 'var(--radius-full, 50px)',
                    background: 'rgba(0,0,0,0.6)',
                    backdropFilter: 'blur(4px)',
                    color: 'white',
                    fontSize: '0.8125rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  {categoryLabel}
                </span>
              </div>
              <div
                className="home-program-card__body"
                style={{ padding: '1.25rem 1.5rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
              >
                <h3 style={{ fontWeight: 700, fontSize: '1.125rem', lineHeight: 1.3 }}>{p.static?.title ?? p.name}</h3>
                {cardHint ? (
                  <p
                    style={{
                      margin: 0,
                      fontSize: '0.875rem',
                      lineHeight: 1.55,
                      color: 'var(--color-on-surface-variant)',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {cardHint}
                  </p>
                ) : null}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      padding: '0.2rem 0.6rem',
                      borderRadius: 'var(--radius-full, 50px)',
                      background: 'var(--surface-container-lowest)',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '0.875rem' }} aria-hidden="true">
                      schedule
                    </span>
                    {p.duration ?? p.static?.duration ?? '3-5 months'}
                  </span>
                  <span className="marketing-cert-badge">
                    <span className="material-symbols-outlined" style={{ fontSize: '0.875rem' }} aria-hidden="true">
                      verified
                    </span>
                    {t('programsCertBadge')}
                  </span>
                </div>
                <span className="home-program-card__cta">
                  {t('programsCardCta')} →
                </span>
              </div>
            </LocalizedLinkServer>
            );
          })}
        </div>
        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <LocalizedLinkServer href="/programs#program-catalog" className={secondaryButtonClasses({ radius: 'md' })}>
            {t('programsCta', { count: programCount })}
          </LocalizedLinkServer>
        </div>
      </section>

      {/* Why WorkforceAP — factual contrast + partner credibility (merged; directly below hero) */}
      <section
        className="home-contrast home-credibility-bar"
        aria-labelledby="home-contrast-heading"
        style={{
          background: 'var(--surface-container-low)',
          padding: 'clamp(2rem, 4vw, 3.25rem) 0',
          borderTop: '1px solid rgba(0,0,0,0.06)',
        }}
      >
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 clamp(1rem, 4vw, 2rem)' }}>
          <span
            id="home-contrast-heading"
            className="text-label-upper"
            style={{
              textAlign: 'center',
              color: 'var(--color-on-surface-variant)',
              marginBottom: '1.25rem',
              letterSpacing: '0.12em',
              fontSize: '0.8125rem',
            }}
          >
            {t('contrastEyebrow')}
          </span>
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))',
              gap: '0.75rem',
            }}
          >
            {(
              [
                { key: 'contrast1' as const, icon: 'work_outline' as const },
                { key: 'contrast2' as const, icon: 'account_balance' as const },
                { key: 'contrast3' as const, icon: 'schedule' as const },
              ] as const
            ).map((row) => (
              <li key={row.key}>
                <div
                  className="portal-card portal-card--flat"
                  style={{
                    background: 'var(--surface-container-lowest)',
                    padding: '1rem 1.1rem',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.65rem',
                    border: '1px solid rgba(0,0,0,0.06)',
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{
                      fontSize: '1.25rem',
                      color: 'var(--color-accent)',
                      flexShrink: 0,
                      marginTop: '0.05rem',
                    }}
                    aria-hidden="true"
                  >
                    {row.icon}
                  </span>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 'clamp(0.875rem, 0.35vw + 0.82rem, 0.95rem)',
                      lineHeight: 1.55,
                      color: 'var(--color-on-surface)',
                      fontWeight: 600,
                    }}
                  >
                    {t(row.key)}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          {/* Partner credibility — training & certification partners */}
          <p
            className="text-label-upper"
            style={{
              textAlign: 'center',
              color: 'var(--color-on-surface-variant)',
              opacity: 0.7,
              marginTop: 'clamp(2rem, 4vw, 2.75rem)',
              marginBottom: '1.25rem',
              fontSize: '0.8125rem',
              letterSpacing: '0.2em',
            }}
          >
            {t('credBarLabel')}
          </p>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '3rem',
              opacity: 0.65,
            }}
          >
            <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>Google</span>
            <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>AT&T</span>
            <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>Coursera</span>
            <Image className="home-cred-logo" src="/images/microsoft-logo.svg" alt="Microsoft" width={100} height={24} loading="lazy" />
            <Image className="home-cred-logo" src="/images/ibm-logo.svg" alt="IBM" width={60} height={24} loading="lazy" />
          </div>
        </div>
      </section>

      {/* ===== A Network Built for Success — Stakeholder Cards (Partnerships) ===== */}
      <section aria-label="Partnerships" style={{ background: 'var(--surface-container-low)', padding: 'clamp(3rem, 6vw, 6rem) 0' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 clamp(1rem, 4vw, 2rem)' }}>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <span className="text-label-upper" style={{ color: 'var(--color-accent)', marginBottom: '0.75rem', display: 'inline-block' }}>
              {t('partnershipsEyebrow')}
            </span>
            <h2 className="text-display-sm">{t('networkTitle')}</h2>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
              gap: '2rem',
              alignItems: 'start',
            }}
          >
            <div
              className="portal-card portal-card--flat home-employer-elevated"
              style={{
                background: 'var(--surface-container-lowest)',
                padding: '2rem',
                border: '2px solid var(--color-accent)',
                transform: 'translateY(-1rem)',
                boxShadow: '0 8px 32px rgba(173,44,77,0.15)',
              }}
            >
              <div
                style={{
                  width: '3rem',
                  height: '3rem',
                  background: 'rgba(173,44,77,0.2)',
                  borderRadius: 'var(--radius-lg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-accent)',
                  marginBottom: '1.5rem',
                }}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  person
                </span>
              </div>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem' }}>{t('memberCardTitle')}</h3>
              <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--color-accent)' }} aria-hidden="true">
                    check_circle
                  </span>
                  {t('memberCardNoCost')}
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--color-accent)' }} aria-hidden="true">
                    check_circle
                  </span>
                  {t('memberCardCount')}
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--color-accent)' }} aria-hidden="true">
                    check_circle
                  </span>
                  {t('memberCardResume')}
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--color-accent)' }} aria-hidden="true">
                    check_circle
                  </span>
                  {t('memberCardJobs')}
                </li>
              </ul>
              <div style={{ marginTop: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                <LocalizedLinkServer
                  href="/apply"
                  className={primaryButtonClasses({ radius: 'md', className: 'btn-small' })}
                >
                  {t('memberCardCta')}
                </LocalizedLinkServer>
              </div>
            </div>

            <div className="portal-card portal-card--flat" style={{ background: 'var(--surface-container-lowest)', padding: '2rem' }}>
              <div
                style={{
                  width: '3rem',
                  height: '3rem',
                  background: 'rgba(43,123,185,0.12)',
                  borderRadius: 'var(--radius-lg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-blue, #2b7bb9)',
                  marginBottom: '1.5rem',
                }}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  handshake
                </span>
              </div>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem' }}>{t('partnerCardTitle')}</h3>
              <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--color-blue, #2b7bb9)' }} aria-hidden="true">
                    check_circle
                  </span>
                  {t('partnerCardSharing')}
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--color-blue, #2b7bb9)' }} aria-hidden="true">
                    check_circle
                  </span>
                  {t('partnerCardRefer')}
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--color-blue, #2b7bb9)' }} aria-hidden="true">
                    check_circle
                  </span>
                  {t('partnerCardImpact')}
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--color-blue, #2b7bb9)' }} aria-hidden="true">
                    check_circle
                  </span>
                  {t('partnerCardSystem')}
                </li>
              </ul>
              <div style={{ marginTop: '1.5rem' }}>
                <LocalizedLinkServer
                  href="/partners"
                  className={primaryButtonClasses({ radius: 'md', className: 'btn-small' })}
                >
                  {t('partnerCardCta')}
                </LocalizedLinkServer>
              </div>
            </div>

            <div className="portal-card portal-card--flat" style={{ background: 'var(--surface-container-lowest)', padding: '2rem' }}>
              <div
                className="marketing-chip-text--gold"
                style={{
                  width: '3rem',
                  height: '3rem',
                  background: 'rgba(255,187,0,0.165)',
                  borderRadius: 'var(--radius-lg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '1.5rem',
                }}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  business
                </span>
              </div>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1rem' }}>{t('employerCardTitle')}</h3>
              <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
                  <span className="material-symbols-outlined marketing-chip-text--gold" style={{ fontSize: '1rem' }} aria-hidden="true">
                    check_circle
                  </span>
                  {t('employerCardCandidates')}
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
                  <span className="material-symbols-outlined marketing-chip-text--gold" style={{ fontSize: '1rem' }} aria-hidden="true">
                    check_circle
                  </span>
                  {t('employerCardTraining')}
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
                  <span className="material-symbols-outlined marketing-chip-text--gold" style={{ fontSize: '1rem' }} aria-hidden="true">
                    check_circle
                  </span>
                  {t('employerCardBenefit')}
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
                  <span className="material-symbols-outlined marketing-chip-text--gold" style={{ fontSize: '1rem' }} aria-hidden="true">
                    check_circle
                  </span>
                  {t('employerCardGrads')}
                </li>
              </ul>
              <div style={{ marginTop: '1.5rem' }}>
                <LocalizedLinkServer
                  href="/employers"
                  className={primaryButtonClasses({ radius: 'md', className: 'btn-small' })}
                >
                  {t('employerCardCta')}
                </LocalizedLinkServer>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Built on Workforce Experience — Bento ===== */}
      <section aria-label="Impact statistics" style={{ padding: 'clamp(3rem, 6vw, 6rem) clamp(1rem, 4vw, 2rem)', maxWidth: '1400px', margin: '0 auto' }}>
        <div id="impact" className="home-impact-bento">
          <div>
            <span className="text-label-upper" style={{ color: 'var(--color-accent)', marginBottom: '1rem', display: 'inline-block' }}>
              {t('aboutEyebrow')}
            </span>
            <h2 className="text-display-sm" style={{ marginBottom: '1.5rem' }}>
              {t('aboutTitle')}
            </h2>
            <p style={{ color: 'var(--color-on-surface-variant)', lineHeight: 1.8, marginBottom: '1.5rem', maxWidth: '680px' }}>
              {t('aboutBody1')}
            </p>
            <p style={{ color: 'var(--color-on-surface-variant)', lineHeight: 1.8, maxWidth: '680px' }}>
              {t('aboutBody2')}
            </p>
          </div>

          <div className="home-impact-bento__stats" style={{ display: 'grid', gap: '1rem' }}>
            <div className="portal-card portal-card--flat" style={{ background: 'var(--surface-container-high)', padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <span className="marketing-chip-text--gold" style={{ fontSize: '2.5rem', fontWeight: 900, lineHeight: 1 }}>
                2,000+
              </span>
              <span
                style={{
                  fontSize: '0.8125rem',
                  color: 'var(--color-on-surface-variant)',
                  marginTop: '0.5rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {t('statLearners')}
              </span>
            </div>
            <div className="portal-card portal-card--flat" style={{ background: 'var(--surface-container-high)', padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <span style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--color-accent)', lineHeight: 1 }}>{programCount}</span>
              <span
                style={{
                  fontSize: '0.8125rem',
                  color: 'var(--color-on-surface-variant)',
                  marginTop: '0.5rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {t('statPrograms')}
              </span>
            </div>
            <div className="portal-card portal-card--flat" style={{ gridColumn: '1 / -1', background: 'var(--color-accent)', color: 'white', padding: '1.5rem', textAlign: 'center' }}>
              <span style={{ fontSize: '1.6rem', fontWeight: 900, lineHeight: 1.15 }}>{t('statNoUpfrontCost')}</span>
              <span style={{ display: 'block', fontSize: '0.8125rem', marginTop: '0.5rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.9 }}>
                {t('statMemberCost')}
              </span>
              <span style={{ display: 'block', fontSize: '0.8125rem', marginTop: '0.35rem', opacity: 0.75, fontWeight: 400, textTransform: 'none', letterSpacing: 'normal' }}>
                {t('statQualifyingMembers')}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Milestone Journey ===== */}
      <section aria-label="Career journey" style={{ background: 'var(--surface-container-low)', padding: 'clamp(3rem, 6vw, 6rem) 0' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 clamp(1rem, 4vw, 2rem)' }}>
          <h2 className="text-display-sm" style={{ marginBottom: '1rem', textAlign: 'center' }}>
            {t('journeyTitle')}
          </h2>
          <p style={{ textAlign: 'center', color: 'var(--color-on-surface-variant)', marginBottom: '1rem', maxWidth: '640px', marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.65 }}>
            {t('journeySubtitle')}
          </p>
          <p
            style={{
              textAlign: 'center',
              fontSize: '0.95rem',
              fontWeight: 700,
              color: 'var(--color-accent)',
              marginBottom: '0.75rem',
              letterSpacing: '0.02em',
            }}
          >
            {t('journeyPhasesRibbon')}
          </p>
          <p
            style={{
              textAlign: 'center',
              color: 'var(--color-on-surface)',
              marginBottom: '2.5rem',
              maxWidth: '520px',
              marginLeft: 'auto',
              marginRight: 'auto',
              fontWeight: 600,
              lineHeight: 1.55,
            }}
          >
            {t('journeySupportLine')}
          </p>
        </div>
        <div
          style={{
            display: 'flex',
            gap: '1.25rem',
            overflowX: 'auto',
            padding: `0 clamp(1rem, 4vw, 2rem) 1.5rem`,
            paddingRight: 'max(clamp(1rem, 4vw, 2rem), env(safe-area-inset-right, 0px))',
            scrollSnapType: 'x mandatory',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {MARKETING_JOURNEY_STEPS.map((step) => (
            <div
              key={step.num}
              className="home-milestone-card"
              style={{
                flex: '0 0 260px',
                scrollSnapAlign: 'start',
                background: 'var(--surface-container)',
                borderRadius: 'var(--radius-xl)',
                padding: '2rem 1.5rem',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div style={{ position: 'relative', zIndex: 1 }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-accent)', letterSpacing: '0.02em' }}>
                  {journeyPhaseLabel(step.homePhase)}
                </span>
                <h3 style={{ fontWeight: 700, marginTop: '0.5rem', marginBottom: '0.5rem', fontSize: '1.125rem' }}>{step.title}</h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.6 }}>{step.shortDesc}</p>
              </div>
            </div>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <LocalizedLinkServer href="/how-it-works" className={secondaryButtonClasses({ radius: 'md' })}>
            {t('journeyCta')}
          </LocalizedLinkServer>
        </div>
      </section>

      {/* ===== Final CTA ===== */}
      <section
        className="footer-cta"
        aria-label="Get started"
        style={{ background: 'var(--color-accent)', padding: 'clamp(3rem, 6vw, 4rem) clamp(1rem, 4vw, 2rem)', textAlign: 'center' }}
      >
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(1.75rem, 5vw, 2.5rem)', fontWeight: 900, letterSpacing: '-0.02em', color: 'white', marginBottom: '1rem' }}>
            {t('ctaTitle')}
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.85)', marginBottom: '2rem', fontSize: '1.125rem' }}>{t('ctaCopy')}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center', alignItems: 'center' }}>
            <LocalizedLinkServer href="/apply" className={buttonPresets.footerCtaPrimary()}>
              {t('ctaApply')}
            </LocalizedLinkServer>
            <LocalizedLinkServer href="/find-your-path" className={buttonPresets.footerCtaSecondary()}>
              {t('ctaFind')}
            </LocalizedLinkServer>
            <LocalizedLinkServer href="/programs#program-catalog" className={buttonPresets.footerCtaGhost()}>
              {t('ctaViewPrograms')}
            </LocalizedLinkServer>
          </div>
        </div>
      </section>
    </>
  );
}
