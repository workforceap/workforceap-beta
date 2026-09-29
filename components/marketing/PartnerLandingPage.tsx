import Link from 'next/link';
import { Suspense } from 'react';
import { ArrowRight, BadgeCheck, Briefcase, CheckCircle2, Clock, FileText, Search, ShieldCheck, Star } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { PartnerLandingModel } from '@/lib/partner/partnerLanding';
import { partnerProgramHref } from '@/lib/apply/partnerApplyHref';
import { getPartnerDisclosureCopy } from '@/lib/apply/partnerDisclosureCopy';
import PartnerReferralDisclosure from '@/components/apply/PartnerReferralDisclosure';
import CategoryPill from './CategoryPill';
import EnrollRefCookie from './EnrollRefCookie';
import UtmCapture from './UtmCapture';
import TrustStrip from './TrustStrip';
import styles from './PartnerLandingPage.module.css';

/**
 * Public partner-branded landing page (`/join/<code>`). Reuses the partner
 * enrollment page's styles (css/enroll-school.css) and the approved home-page
 * copy (`marketing.home.*`) for every WorkforceAP claim; only the partner
 * framing lives in `partnerLanding.*`. The mission section right after the
 * hero renders `mission.statement` verbatim (shared with the invitation email
 * and the partner share toolkit).
 *
 * Attribution uses the existing mechanics: `EnrollRefCookie` persists the ref
 * (sessionStorage + first-party cookie), `UtmCapture` keeps the channel tags,
 * and every Apply CTA carries `?ref=` into `/apply`.
 */
export default async function PartnerLandingPage({
  model,
  applyHref,
}: {
  model: PartnerLandingModel;
  /** Locale-prefixed `/apply?ref=<code>`. */
  applyHref: string;
}) {
  const [t, home, mission, disclosureCopy] = await Promise.all([
    getTranslations('partnerLanding'),
    getTranslations('marketing.home'),
    getTranslations('mission'),
    getPartnerDisclosureCopy(),
  ]);
  const partner = model.name;

  const highlights = [
    { icon: ShieldCheck, title: home('trustReviewed'), body: home('trustReviewedDetail') },
    { icon: BadgeCheck, title: home('trustYears'), body: home('trustYearsDetail') },
    { icon: Briefcase, title: home('trustEmployer'), body: home('trustEmployerDetail') },
  ];
  const steps = [
    { icon: FileText, title: home('heroStep1') },
    { icon: Search, title: home('heroStep2') },
    { icon: CheckCircle2, title: home('heroStep3') },
  ];

  return (
    <div className="enroll-school">
      <EnrollRefCookie referralCode={model.ref} />
      <Suspense fallback={null}>
        <UtmCapture />
      </Suspense>

      <section className="stage" aria-labelledby="partner-landing-title">
        <div className="aura aura--1" aria-hidden="true" />
        <div className="aura aura--2" aria-hidden="true" />
        <div className="grain" aria-hidden="true" />
        <div className="wrap stage-grid">
          <div className="lede">
            <span className="pill">
              <span className="pill__star"><Star size={13} aria-hidden="true" /></span>
              {t('eyebrow', { partner })}
            </span>
            <h1 id="partner-landing-title">{t('title', { partner })}</h1>
            <p className="sub">{home('memberPromiseBody1')}</p>
            <div className="acts">
              <Link className="dbtn dbtn--solid" href={applyHref}>
                {t('applyCta')} <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <a className="dbtn dbtn--glass" href="#partner-programs">{home('browsePrograms')}</a>
            </div>
            <p className="meta-note">{t('applyCtaNote', { partner })}</p>
          </div>
          <div className="hero-glass">
            <div className="hg-tag">WorkforceAP × {partner}</div>
            <div className="hg-rows">
              {highlights.map((h) => (
                <div className="hg-row" key={h.title}><h.icon size={16} aria-hidden="true" /> {h.title}</div>
              ))}
              <div className="hg-row"><ShieldCheck size={16} aria-hidden="true" /> {home('trustNoCost')}</div>
            </div>
          </div>
        </div>
      </section>

      <section className="band" aria-labelledby="partner-landing-mission" data-mission>
        <div className={`wrap ${styles.missionWrap}`}>
          <div className="sec-head">
            <h2 id="partner-landing-mission">{mission('heading')}</h2>
            <p>{mission('statement')}</p>
          </div>
        </div>
      </section>

      <TrustStrip variant="home" />

      <section className="band" aria-labelledby="partner-landing-steps">
        <div className="wrap">
          <div className="sec-head">
            <span className="eyebrow">{t('stepsEyebrow')}</span>
            <h2 id="partner-landing-steps">{t('stepsTitle')}</h2>
          </div>
          <div className={`steps ${styles.steps3}`}>
            {steps.map((s, i) => (
              <div className="stepcard" key={s.title}>
                <div className="num">{i + 1}</div>
                <span className="step-ic"><s.icon size={20} aria-hidden="true" /></span>
                <h3>{s.title}</h3>
              </div>
            ))}
          </div>
          <div className={`steps ${styles.steps3}`} style={{ marginTop: 20 }}>
            {highlights.map((h) => (
              <div className="stepcard" key={h.title}>
                <span className="step-ic"><h.icon size={20} aria-hidden="true" /></span>
                <h3>{h.title}</h3>
                <p>{h.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {model.programs.length > 0 ? (
        <section className="band band--surface" id="partner-programs" aria-labelledby="partner-landing-programs">
          <div className="wrap">
            <div className="sec-head">
              <span className="eyebrow">{t('programsEyebrow')}</span>
              <h2 id="partner-landing-programs">{t('programsTitle')}</h2>
              <p>{t('programsBody')}</p>
            </div>
            <div className="pgrid">
              {model.programs.map((p) => (
                <div className="pcard" key={p.slug}>
                  <div className="pcard-top">
                    <div className="ptags"><CategoryPill tone={p.categoryTone}>{p.category}</CategoryPill></div>
                  </div>
                  {/* Program pages are served by the Astro site: document navigation. */}
                  <h3><a href={partnerProgramHref(model.ref, p.slug)}>{p.title}</a></h3>
                  {p.duration ? (
                    <div className="pmeta"><span><Clock size={16} aria-hidden="true" /> {p.duration}</span></div>
                  ) : null}
                  {p.certifications.length > 0 ? (
                    <div className="pskills">{p.certifications.map((c) => <span className="stag" key={c}>{c}</span>)}</div>
                  ) : null}
                </div>
              ))}
            </div>
            <p style={{ textAlign: 'center', marginTop: 24 }}>
              <a href="/programs">{home('browsePrograms')}</a>
            </p>
          </div>
        </section>
      ) : null}

      <section className="band" aria-labelledby="partner-landing-privacy">
        <div className={`wrap ${styles.disclosureWrap}`}>
          <div className="sec-head">
            <h2 id="partner-landing-privacy">{t('privacyTitle', { partner })}</h2>
          </div>
          <PartnerReferralDisclosure
            initial={{ ref: model.ref, partnerName: partner, tier: model.tier }}
            copy={disclosureCopy}
            reconcileWithPersistedRef={false}
          />
        </div>
      </section>

      <section className="close">
        <div className="close__media" aria-hidden="true" />
        <div className="close__veil" aria-hidden="true" />
        <div className="close__inner wrap">
          <h2>{t('closingTitle')}</h2>
          <div className="acts acts--center">
            <Link className="bbtn bbtn--gold" href={applyHref}>{t('applyCta')} →</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
