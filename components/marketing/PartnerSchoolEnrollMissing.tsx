import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { EnrollmentPartnerLink } from '@/lib/enroll/resolveEnrollmentPartner';
import { humanizeEnrollmentSchoolKey } from '@/lib/enroll/resolveEnrollmentPartner';

type Props = {
  school: string;
  partners: EnrollmentPartnerLink[];
};

/**
 * Soft recovery for unknown `/enroll/[school]` slugs.
 * One primary next step: school picker when partners exist; public apply when empty.
 */
export default async function PartnerSchoolEnrollMissing({ school, partners }: Props) {
  const t = await getTranslations('enroll');
  const label = humanizeEnrollmentSchoolKey(school);
  const hasSchools = partners.length > 0;

  return (
    <div className="enroll-school enroll-school--missing">
      <section className="stage stage--compact" aria-labelledby="enroll-missing-title">
        <div className="aura aura--1" aria-hidden="true" />
        <div className="aura aura--2" aria-hidden="true" />
        <div className="wrap">
          <div className="lede lede--missing">
            <span className="pill">{t('missingPill')}</span>
            <h1 id="enroll-missing-title">
              {t.rich('missingTitle', {
                school: label,
                glow: (chunks) => <span className="shimmer">{chunks}</span>,
              })}
            </h1>
            <p className="sub">
              {hasSchools ? t('missingLeadWithSchools') : t('missingLeadEmpty')}
            </p>
            <div className="acts">
              {hasSchools ? (
                <a className="dbtn dbtn--solid" href="#partner-schools">
                  {t('missingPrimaryChooseSchool')} <span aria-hidden="true">→</span>
                </a>
              ) : (
                <Link className="dbtn dbtn--solid" href="/apply">
                  {t('missingPrimaryApply')} <span aria-hidden="true">→</span>
                </Link>
              )}
              <Link className="dbtn dbtn--glass" href="/programs">
                {t('missingSecondaryPrograms')}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section
        id="partner-schools"
        className="band band--surface"
        aria-labelledby="enroll-school-list-title"
      >
        <div className="wrap">
          {hasSchools ? (
            <>
              <div className="sec-head">
                <span className="eyebrow">{t('missingSchoolsEyebrow')}</span>
                <h2 id="enroll-school-list-title">{t('missingSchoolsTitle')}</h2>
                <p>{t('missingSchoolsBody')}</p>
              </div>

              <ul className="school-picker">
                {partners.map((partner) => (
                  <li key={partner.slug}>
                    <Link className="school-picker__card" href={partner.enrollmentPath}>
                      <span className="school-picker__name">{partner.name}</span>
                      {partner.schoolDistrict ? (
                        <span className="school-picker__meta">{partner.schoolDistrict}</span>
                      ) : null}
                      <span className="school-picker__cta">
                        {t('missingOpenEnrollment')} <span aria-hidden="true">→</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="enroll-empty" role="status">
              <h2 id="enroll-school-list-title" className="enroll-empty__title">
                {t('missingEmptyTitle')}
              </h2>
              <p className="enroll-empty__body">{t('missingEmptyBody')}</p>
              <div className="enroll-empty__action">
                <Link className="btn btn-primary" href="/apply">
                  {t('missingPrimaryApply')}
                </Link>
              </div>
            </div>
          )}

          <div className="acts acts--center missing-foot">
            <Link className="btn btn-secondary" href="/contact">
              {t('missingContact')}
            </Link>
            <Link className="btn btn-secondary" href="/">
              {t('missingHome')}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
