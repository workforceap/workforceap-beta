'use client';

import { useEffect, useRef, useState } from 'react';
import LocalizedLink from '@/components/LocalizedLink';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { localizeHref, useLocaleFromPath } from '@/lib/i18n/client';
import { trackApplyFunnel } from '@/lib/analytics/events';
import { isValidPostalCode } from '@/lib/validation/postalCode';
import { US_STATES, toStateAbbr } from '@/lib/apply/usStates';
import { marketingButtonPresets } from '@/lib/marketing/buttonClasses';
import { type ApplyFlowDraftV1 } from '@/lib/apply/applyProgramStorage';
import { APPLY_STORAGE_KEY, readApplyDraft, writeApplyDraft, saveEligibilityForNextStep, removeApplyDraft, type EligibilityPanel } from '@/lib/apply/applyBrowserState';
import {
  DEFAULT_PRIMARY_BARRIER,
  normalizePrimaryBarriers,
  PRIMARY_BARRIER_OPTIONS,
} from '@/lib/apply/primaryBarrierOptions';
import HearAboutSelect from '@/components/apply/HearAboutSelect';
import {
  hearAboutNeedsOther,
  layoffCompanyApplicable,
  type YesNo,
} from '@/lib/apply/eligibilityExtendedFields';
import type { SchoolApplyContext } from '@/lib/apply/resolveSchoolApply';
import {
  PUBLIC_ASSISTANCE_PROGRAM_VALUES,
  normalizePublicAssistancePrograms,
  publicAssistanceFollowUpComplete,
  type PublicAssistanceProgram,
} from '@/lib/apply/publicAssistance';
import {
  SCHOOL_AGE_GROUPS,
  SCHOOL_GRADE_LEVELS,
  schoolDetailsComplete,
  schoolGuardianRequired,
  schoolPrimaryBarriers,
} from '@/lib/apply/schoolCollection';

const ADULT_AGE_GROUPS = [
  { value: 'under_18', label: 'Under 18' },
  { value: '18_24', label: '18–24' },
  { value: '25_50', label: '25–50' },
  { value: '50_plus', label: '50+' },
] as const;

export default function ApplyEligibilityClient({
  variant = 'organic',
  schoolApply = null,
}: {
  variant?: 'organic' | 'paid';
  schoolApply?: SchoolApplyContext | null;
}) {
  const isPaid = variant === 'paid';
  const t = useTranslations('apply');
  const tForm = useTranslations('form');
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocaleFromPath();
  const programParam = searchParams?.get('program');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const formatPhoneInput = (raw: string): string => {
    const digits = raw.replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  };
  const [phoneError, setPhoneError] = useState('');
  const [ageGroup, setAgeGroup] = useState<ApplyFlowDraftV1['ageGroup']>('');
  const [city, setCity] = useState('');
  const [stateVal, setStateVal] = useState('');
  const [zip, setZip] = useState('');
  const [county, setCounty] = useState('');
  const [primaryBarriers, setPrimaryBarriers] = useState<string[]>([DEFAULT_PRIMARY_BARRIER.value]);
  // The default barrier is always included (normalizePrimaryBarriers seeds it),
  // so it is shown fixed and checked instead of refusing a click.
  const toggleBarrier = (v: string) => {
    if (v === DEFAULT_PRIMARY_BARRIER.value) return;
    setPrimaryBarriers((cur) =>
      normalizePrimaryBarriers(cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v])
    );
  };

  const [q1, setQ1] = useState<YesNo | null>(null);
  const [gradeLevel, setGradeLevel] = useState('');
  const [parentGuardianName, setParentGuardianName] = useState('');
  const [parentGuardianEmail, setParentGuardianEmail] = useState('');
  const [parentGuardianPhone, setParentGuardianPhone] = useState('');
  const [q2, setQ2] = useState<YesNo | null>(null);
  const [q3, setQ3] = useState<YesNo | null>(null);
  const [receivingUnemployment, setReceivingUnemployment] = useState<YesNo | null>(null);
  const [exhaustedUnemployment, setExhaustedUnemployment] = useState<YesNo | null>(null);
  const [layoffCompany, setLayoffCompany] = useState('');
  const [snapWic, setSnapWic] = useState<YesNo | null>(null);
  // WAP-53 follow-ups, only meaningful when snapWic === 'yes'.
  const [publicAssistancePrograms, setPublicAssistancePrograms] = useState<PublicAssistanceProgram[]>([]);
  const [publicAssistanceHelpRequested, setPublicAssistanceHelpRequested] = useState<YesNo | null>(null);
  const [hearAbout, setHearAbout] = useState('');
  const [hearAboutOther, setHearAboutOther] = useState('');
  const [partnerAmbassadorReferral, setPartnerAmbassadorReferral] = useState('');
  const [attemptedContinue, setAttemptedContinue] = useState(false);
  const [saveNotice, setSaveNotice] = useState('');
  const [panel, setPanel] = useState<EligibilityPanel>(schoolApply ? 'contact' : 'funding');
  const panelHeadingRef = useRef<HTMLHeadingElement>(null);
  const panels: EligibilityPanel[] = schoolApply ? ['contact', 'background'] : ['funding', 'contact', 'background'];
  const panelIndex = panels.indexOf(panel);
  const completedRef = useRef(false);
  const answeredCountRef = useRef(0);
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const draft = readApplyDraft();
    if (!draft) return;
    setPanel(draft.panel === 'background' || draft.panel === 'contact' ? draft.panel : schoolApply ? 'contact' : 'funding');
    setFirstName(draft.firstName ?? '');
    setLastName(draft.lastName ?? '');
    setEmail(draft.email ?? '');
    setPhone(draft.phone ?? '');
    setAgeGroup(draft.ageGroup ?? '');
    setCity(draft.city ?? '');
    setStateVal(toStateAbbr(draft.state));
    setZip(draft.zip ?? '');
    setCounty(draft.county ?? '');
    setPrimaryBarriers(normalizePrimaryBarriers(draft.primaryBarriers ?? (draft.primaryBarrier ? [draft.primaryBarrier] : undefined)));
    setQ1(draft.q1 ?? null);
    setQ2(draft.q2 ?? null);
    setQ3(draft.q3 ?? null);
    setReceivingUnemployment(draft.receivingUnemployment ?? null);
    setExhaustedUnemployment(draft.exhaustedUnemployment ?? null);
    setLayoffCompany(draft.layoffCompany ?? '');
    setSnapWic(draft.snapWic ?? null);
    setPublicAssistancePrograms(normalizePublicAssistancePrograms(draft.publicAssistancePrograms));
    setPublicAssistanceHelpRequested(draft.publicAssistanceHelpRequested ?? null);
    setHearAbout(draft.hearAbout ?? '');
    setHearAboutOther(draft.hearAboutOther ?? '');
    setPartnerAmbassadorReferral(draft.partnerAmbassadorReferral ?? '');
    setGradeLevel(draft.gradeLevel ?? '');
    setParentGuardianName(draft.parentGuardianName ?? '');
    setParentGuardianEmail(draft.parentGuardianEmail ?? '');
    setParentGuardianPhone(draft.parentGuardianPhone ?? '');
  }, [schoolApply]);

  const emailLooksValid = (value: string) => {
    const v = value.trim();
    if (!v.includes('@')) return false;
    const [local, domain] = v.split('@');
    if (!local || !domain || !domain.includes('.')) return false;
    const tld = domain.split('.').pop() ?? '';
    return tld.length >= 2;
  };

  const phoneDigits = phone.replace(/\D/g, '');
  const contactOk =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    email.trim().length > 0 &&
    emailLooksValid(email.trim()) &&
    phone.trim().length > 0 &&
    phoneDigits.length >= 10;

  const zipOk = isValidPostalCode(zip);
  const isSchool = Boolean(schoolApply);
  const guardianRequired = isSchool && schoolGuardianRequired(ageGroup);
  const screeningDetailsOk = isSchool
    ? schoolDetailsComplete(
        {
          ageGroup: ageGroup ?? '',
          gradeLevel,
          city,
          state: stateVal,
          zipOk,
          parentGuardianName,
          parentGuardianEmail,
        },
        emailLooksValid,
      )
    : !!ageGroup &&
      city.trim().length > 0 &&
      stateVal.trim().length > 0 &&
      zipOk &&
      county.trim().length > 0 &&
      primaryBarriers.length > 0 &&
      hearAbout.trim().length > 0 &&
      (!hearAboutNeedsOther(hearAbout) || hearAboutOther.trim().length > 0);
  const yesNoAnswers: Array<YesNo | null> = [
    q1,
    receivingUnemployment,
    exhaustedUnemployment,
    q2,
    snapWic,
    q3,
  ];
  const publicAssistanceFollowUpOk = publicAssistanceFollowUpComplete({
    snapWic,
    publicAssistancePrograms,
    publicAssistanceHelpRequested,
  });
  const fundingAnswersOk = isSchool || (yesNoAnswers.every((answer) => answer !== null) && publicAssistanceFollowUpOk);
  const canContinue =
    contactOk &&
    screeningDetailsOk &&
    fundingAnswersOk;
  const ageOptions = isSchool ? SCHOOL_AGE_GROUPS : ADULT_AGE_GROUPS;
  const panelComplete = panel === 'funding' ? fundingAnswersOk : panel === 'contact' ? contactOk : screeningDetailsOk;
  const fundingYesCount = [q1, q2, q3].filter((answer) => answer === 'yes').length;
  const yesCount = fundingYesCount;
  const qualifies = fundingYesCount >= 1;
  const showLayoffCompany = layoffCompanyApplicable({
    unemployedOrUnderemployed: q1,
    receivingUnemployment,
    exhaustedUnemployment,
  });

  const draftPayload = () => ({
    panel,
    firstName,
    lastName,
    email,
    phone,
    ageGroup,
    city,
    state: stateVal,
    zip,
    county: isSchool ? '' : county,
    primaryBarriers: isSchool ? schoolPrimaryBarriers() : primaryBarriers,
    q1: isSchool ? null : q1,
    q2: isSchool ? null : q2,
    q3: isSchool ? null : q3,
    receivingUnemployment: isSchool ? null : receivingUnemployment,
    exhaustedUnemployment: isSchool ? null : exhaustedUnemployment,
    layoffCompany: isSchool ? '' : layoffCompany,
    snapWic: isSchool ? null : snapWic,
    publicAssistancePrograms: isSchool || snapWic !== 'yes' ? [] : publicAssistancePrograms,
    publicAssistanceHelpRequested: isSchool || snapWic !== 'yes' ? null : publicAssistanceHelpRequested,
    hearAbout: isSchool ? '' : hearAbout,
    hearAboutOther: isSchool ? '' : hearAboutOther,
    partnerAmbassadorReferral: isSchool ? '' : partnerAmbassadorReferral,
    gradeLevel,
    parentGuardianName,
    parentGuardianEmail,
    parentGuardianPhone,
    schoolName: schoolApply?.schoolName,
  });

  useEffect(() => {
    trackApplyFunnel(1, 'started');
    trackApplyFunnel(1, 'eligibility_view');
  }, []);

  useEffect(() => {
    answeredCountRef.current = [q1, q2, q3, receivingUnemployment, exhaustedUnemployment, snapWic].filter(Boolean).length;
    trackApplyFunnel(1, 'eligibility_progress', {
      answered_count: answeredCountRef.current,
    });
  }, [q1, q2, q3, receivingUnemployment, exhaustedUnemployment, snapWic]);

  useEffect(() => {
    return () => {
      if (!completedRef.current) {
        trackApplyFunnel(1, 'eligibility_dropoff', {
          answered_count: answeredCountRef.current,
        });
      }
    };
  }, []);

  const persistDraft = (nextPanel = panel) => writeApplyDraft({ ...draftPayload(), panel: nextPanel });

  const changePanel = (nextPanel: EligibilityPanel) => {
    const saved = persistDraft(nextPanel);
    setAutoSaved(saved);
    setSaveNotice(saved ? '' : t('storageSaveFailed'));
    setAttemptedContinue(false);
    setPanel(nextPanel);
    requestAnimationFrame(() => panelHeadingRef.current?.focus());
  };

  const [autoSaved, setAutoSaved] = useState(false);
  const autosaveSkippedInitial = useRef(false);
  useEffect(() => {
    if (!autosaveSkippedInitial.current) {
      autosaveSkippedInitial.current = true;
      return;
    }
    setAutoSaved(false);
    if (completedRef.current) return;
    if (!firstName && !lastName && !email && !phone && !yesNoAnswers.some(Boolean)) return;
    const handle = setTimeout(() => {
      if (completedRef.current) return;
      const saved = writeApplyDraft(draftPayload());
      setAutoSaved(saved);
      setSaveNotice(saved ? '' : t('storageSaveFailed'));
    }, 1500);
    return () => clearTimeout(handle);
    // draftPayload reads the latest field values on each run
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    firstName,
    lastName,
    email,
    phone,
    ageGroup,
    city,
    stateVal,
    zip,
    county,
    primaryBarriers,
    q1,
    q2,
    q3,
    receivingUnemployment,
    exhaustedUnemployment,
    layoffCompany,
    snapWic,
    publicAssistancePrograms,
    publicAssistanceHelpRequested,
    hearAbout,
    hearAboutOther,
    partnerAmbassadorReferral,
    gradeLevel,
    parentGuardianName,
    parentGuardianEmail,
    parentGuardianPhone,
    schoolApply?.schoolName,
    panel,
  ]);

  const handleSaveLater = () => {
    const saved = persistDraft();
    setAutoSaved(saved);
    setSaveNotice(t(saved ? 'saveContinueHint' : 'storageSaveFailed'));
    if (saved) trackApplyFunnel(1, 'apply_save_draft');
  };

  const handleContinue = () => {
    if (!panelComplete) {
      setAttemptedContinue(true);
      trackApplyFunnel(1, 'eligibility_continue_blocked', {
        answered_count: yesNoAnswers.filter(Boolean).length,
      });
      requestAnimationFrame(() => {
        const invalid = document.querySelector<HTMLElement>(
          'form [aria-invalid="true"], form input:invalid, form select:invalid',
        );
        const target = invalid?.matches('input, select, textarea, button')
          ? invalid
          : invalid?.querySelector<HTMLElement>('input, select, textarea');
        (target ?? document.getElementById('apply-eligibility-continue-hint'))?.focus();
      });
      return;
    }

    if (panelIndex < panels.length - 1) {
      changePanel(panels[panelIndex + 1]);
      return;
    }
    // A restored draft can land on a later panel with earlier fields incomplete.
    if (!canContinue) {
      changePanel(!fundingAnswersOk ? 'funding' : 'contact');
      setAttemptedContinue(true);
      return;
    }
    if (typeof window !== 'undefined') {
      const eligibility = {
        updatedAt: new Date().toISOString(),
        q1: isSchool ? null : q1,
        q2: isSchool ? null : q2,
        q3: isSchool ? null : q3,
        receivingUnemployment: isSchool ? null : receivingUnemployment,
        exhaustedUnemployment: isSchool ? null : exhaustedUnemployment,
        layoffCompany: isSchool ? undefined : layoffCompany.trim() || undefined,
        snapWic: isSchool ? null : snapWic,
        publicAssistancePrograms: isSchool || snapWic !== 'yes' ? [] : publicAssistancePrograms,
        publicAssistanceHelpRequested: isSchool || snapWic !== 'yes' ? null : publicAssistanceHelpRequested,
        hearAbout: isSchool ? undefined : hearAbout.trim() || undefined,
        hearAboutOther: isSchool
          ? undefined
          : hearAboutNeedsOther(hearAbout)
            ? hearAboutOther.trim() || undefined
            : undefined,
        partnerAmbassadorReferral: isSchool
          ? undefined
          : partnerAmbassadorReferral.trim() || undefined,
        qualifies: isSchool ? true : qualifies,
        yesCount: isSchool ? 0 : yesCount,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.replace(/\D/g, ''),
        ageGroup,
        city: city.trim(),
        state: stateVal.trim(),
        zip: zip.trim(),
        county: county.trim(),
        primaryBarriers: isSchool ? schoolPrimaryBarriers() : primaryBarriers,
        gradeLevel: gradeLevel.trim() || undefined,
        parentGuardianName: parentGuardianName.trim() || undefined,
        parentGuardianEmail: parentGuardianEmail.trim() || undefined,
        parentGuardianPhone: parentGuardianPhone.replace(/\D/g, '') || undefined,
        schoolName: schoolApply?.schoolName,
        schoolApply: Boolean(schoolApply),
      };
      if (!saveEligibilityForNextStep(eligibility)) {
        setSaveNotice(t('storageContinueFailed'));
        setAutoSaved(false);
        return;
      }
      removeApplyDraft();
    }
    completedRef.current = true;
    trackApplyFunnel(2, 'qualification_completed', { qualifies, yes_count: yesCount });
    trackApplyFunnel(1, 'eligibility_complete', { qualifies, yes_count: yesCount });
    const resultsPath = programParam ? `/apply/results?program=${encodeURIComponent(programParam)}` : '/apply/results';
    router.push(localizeHref(resultsPath, locale));
  };

  return (
    <div className={`apply-flow apply-flow--step1${isPaid ? ' apply-flow--paid' : ''}`} data-variant={isPaid ? 'paid' : 'organic'}>
      <style>{`
        .apply-flow--step1 .apply-step1-actions { position: sticky; bottom: 0; z-index: 2; padding: 1rem 0; background: var(--color-background, var(--color-white)); border-top: 1px solid var(--color-border); }
        .apply-flow--step1 .apply-panel-heading { scroll-margin-top: 7rem; outline-offset: 4px; margin: 1.25rem 0; }
        .apply-flow--step1 .form-radio-cards { gap: 0.5rem; }
        .apply-flow--step1 .form-radio-card {
          display: flex;
          align-items: center;
          gap: 0.625rem;
          padding: 0.75rem 1rem;
          min-height: 44px;
        }
        .apply-flow--step1 .form-radio-card .radio-dot {
          display: inline-block;
          flex-shrink: 0;
          width: 16px;
          height: 16px;
          border-width: 2px;
          margin-top: 0;
        }
        .apply-flow--step1 .form-radio-card.selected .radio-dot {
          box-shadow: inset 0 0 0 3px var(--color-white);
        }
        html.dark .apply-flow--step1 .form-radio-card.selected .radio-dot {
          box-shadow: inset 0 0 0 3px var(--surface-container-high);
        }
        .apply-flow--step1 .apply-barrier-options { gap: 0.125rem; }
        .apply-flow--step1 .apply-barrier-option {
          align-items: center;
          gap: 0.625rem;
          padding: 0.4rem 0.5rem;
        }
        .apply-flow--step1 .apply-barrier-option input {
          width: 16px;
          height: 16px;
          margin-top: 0;
        }
        .apply-flow--step1 .apply-barrier-option__label { line-height: 1.3; }
        .apply-barrier-option--fixed,
        .apply-barrier-option--fixed input { cursor: default; }
        .apply-barrier-option--fixed:hover { background: rgba(173, 44, 77, 0.04); }
        .apply-flow--step1 .funding-questions {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          padding: 1rem;
          margin-bottom: 1rem;
        }
        .apply-flow--step1 .funding-questions .form-group { margin-bottom: 0; }
        .apply-flow--step1 .apply-eligibility-legend { margin-bottom: 0.25rem; }
        .apply-flow--step1 .apply-eligibility-prompt { margin-bottom: 0.5rem; line-height: 1.4; }
        /* WAP-120: Yes / No are one word each — sit them side by side so each
           funding question is one legend, one prompt and one 44px row instead of
           two stacked cards (six questions × ~52px on a 390px phone). */
        .apply-flow--step1 .funding-questions .form-radio-cards {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.5rem;
        }
        .apply-flow--step1 .funding-questions .form-radio-card {
          justify-content: center;
          padding: 0.625rem 0.75rem;
        }
        .apply-flow--step1 .apply-personal-block { margin-bottom: 1.25rem; }
        .apply-flow--step1 .apply-personal-block__title { margin-bottom: 0.75rem; }
        @media (max-width: 768px) {
          .apply-flow--step1 .form-radio-card { align-items: center; }
          .apply-flow--step1 .apply-barrier-option { align-items: center; }
          .apply-flow--step1 .apply-step-title {
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            white-space: nowrap;
            border: 0;
          }
          .apply-flow--step1 .apply-step-desc:not(.apply-eligibility-exception-note) {
            display: none;
          }
          /* WAP-120 phone density for the funding panel: the "what happens next"
             card repeats the sidebar's expanded next-steps list and the social
             proof repeats ApplyMobileTrustBar / TrustStrip directly above the
             form, so both step aside on phones; spacing tightens to keep the
             whole panel under the 1,500px target at 390×844. */
          .apply-flow--step1 .apply-transition-card,
          .apply-flow--step1 .apply-social-proof {
            display: none;
          }
          .apply-flow--step1 .apply-panel-heading {
            margin: 0.75rem 0;
            font-size: 1.0625rem;
          }
          .apply-flow--step1 .funding-questions {
            gap: 0.75rem;
            padding: 0.75rem;
            margin-bottom: 0.75rem;
          }
          .apply-flow--step1 .apply-eligibility-legend {
            font-size: 0.9375rem;
          }
          .apply-flow--step1 .apply-eligibility-prompt {
            font-size: 0.875rem;
            margin-bottom: 0.375rem;
          }
          .apply-flow--step1 .apply-step1-actions {
            padding: 0.5rem 0;
          }
          .apply-flow--step1 .funding-questions .form-radio-card {
            min-height: 44px;
            padding: 0.5rem 0.75rem;
          }
          .apply-flow--step1 .funding-questions .apply-field-hint,
          .apply-flow--step1 .apply-continue-hint {
            font-size: 0.8125rem;
            line-height: 1.4;
          }
          .apply-flow--step1 .apply-eligibility-exception-note {
            font-size: 0.8125rem;
            line-height: 1.4;
          }
          .apply-flow--step1 .apply-eligibility-exception-note {
            margin-top: 0;
            margin-bottom: 1rem;
            font-size: 0.875rem;
            line-height: 1.45;
          }
        }
      `}</style>
      {!isPaid ? (
        <div className="apply-progress-bar" aria-label={t('progressAriaLabel')}>
          <div className="apply-progress-fill" style={{ width: `${Math.round(((panelIndex + 1) / panels.length) * 33)}%` }} />
          <p className="apply-progress-label">{t(isSchool ? 'schoolStep1ProgressLabel' : 'step1ProgressLabel')}</p>
        </div>
      ) : null}

      <form
        className="apply-step-content"
        action={localizeHref(programParam ? `/apply/results?program=${encodeURIComponent(programParam)}` : '/apply/results', locale)}
        method="get"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          handleContinue();
        }}
      >
        {!isPaid && isSchool ? (
          <>
            <p className="apply-social-proof" role="note">
              {t('schoolApplySocialProof', { school: schoolApply?.partnerName ?? 'your school' })}
            </p>
            <p className="apply-step-kicker">{t('step1Kicker')}</p>
            <h2 className="apply-step-title">{t('schoolStep1Title')}</h2>
            <p className="apply-step-desc">{t('schoolStep1Lead')}</p>
            <div className="apply-transition-card" role="note" data-collection="school">
              <strong>{t('schoolBannerStrong', { school: schoolApply?.partnerName ?? 'your school' })}</strong>
              <span> {t('schoolBannerBody')}</span>
            </div>
          </>
        ) : !isPaid ? (
          <>
            <p className="apply-social-proof" role="note">
              {t('applySocialProof')}
            </p>
            <p className="apply-step-kicker">{t('step1Kicker')}</p>
            <h2 className="apply-step-title">{t('step1Title')}</h2>
            <p className="apply-step-desc">{t('step1Lead')}</p>
            <p className="apply-step-desc apply-eligibility-exception-note">
              {t('eligibilityExceptionLead')}{' '}
              <LocalizedLink href="/faq" style={{ color: 'var(--wa-accent-text)', fontWeight: 600 }}>
                FAQ
              </LocalizedLink>
              {t('eligibilityExceptionSuffix')}
            </p>

            <div className="apply-transition-card" role="note" aria-label={t('transitionCardAriaWhatNext')}>
              <strong>{t('step1WhatNextStrong')}</strong>
              <span> {t('step1WhatNextBody')}</span>
            </div>
          </>
        ) : (
          <>
            <h2 className="apply-step-title">{t('step1Title')}</h2>
            <p className="apply-step-desc">{t('paidStep1Lead')}</p>
          </>
        )}

        <h2 ref={panelHeadingRef} tabIndex={-1} className="apply-panel-heading">
          {t('eligibilityPanelProgress', { current: panelIndex + 1, total: panels.length })}: {t(panel === 'funding' ? 'eligibilityPanelFunding' : panel === 'contact' ? 'eligibilityPanelContact' : 'eligibilityPanelBackground')}
        </h2>
        {panel === 'funding' ? (
        <div className="funding-questions">
          {(
            [
              { key: 'q1', value: q1, set: setQ1, legendKey: 'eligibilityQ1Legend', promptKey: 'eligibilityQ1Prompt', errorId: 'apply-eligibility-q1-error' },
              { key: 'receivingUnemployment', value: receivingUnemployment, set: setReceivingUnemployment, legendKey: 'eligibilityReceivingUnemploymentLegend', promptKey: 'eligibilityReceivingUnemploymentPrompt', errorId: 'apply-eligibility-receiving-error' },
              { key: 'exhaustedUnemployment', value: exhaustedUnemployment, set: setExhaustedUnemployment, legendKey: 'eligibilityExhaustedUnemploymentLegend', promptKey: 'eligibilityExhaustedUnemploymentPrompt', errorId: 'apply-eligibility-exhausted-error' },
              { key: 'q2', value: q2, set: setQ2, legendKey: 'eligibilityQ2Legend', promptKey: 'eligibilityQ2Prompt', errorId: 'apply-eligibility-q2-error' },
              { key: 'snapWic', value: snapWic, set: setSnapWic, legendKey: 'eligibilitySnapWicLegend', promptKey: 'eligibilitySnapWicPrompt', errorId: 'apply-eligibility-snap-error' },
              { key: 'q3', value: q3, set: setQ3, legendKey: 'eligibilityQ3Legend', promptKey: 'eligibilityQ3Prompt', errorId: 'apply-eligibility-q3-error' },
            ] as const
          ).map((item) => (
            <fieldset key={item.key} className="form-group apply-eligibility-fieldset">
              <legend className="apply-eligibility-legend">{t(item.legendKey)}</legend>
              <p className="apply-eligibility-prompt">{t(item.promptKey)}</p>
              <div
                className="form-radio-cards"
                role="radiogroup"
                aria-invalid={attemptedContinue && item.value === null}
                aria-describedby={attemptedContinue && item.value === null ? item.errorId : undefined}
              >
                <label className={`form-radio-card ${item.value === 'yes' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name={item.key}
                    value="yes"
                    checked={item.value === 'yes'}
                    onChange={() => item.set('yes')}
                    required
                  />
                  <span className="radio-dot" />
                  <span>{t('answerYes')}</span>
                </label>
                <label className={`form-radio-card ${item.value === 'no' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name={item.key}
                    value="no"
                    checked={item.value === 'no'}
                    onChange={() => item.set('no')}
                    required
                  />
                  <span className="radio-dot" />
                  <span>{t('answerNo')}</span>
                </label>
              </div>
              {attemptedContinue && item.value === null && (
                <p id={item.errorId} className="apply-eligibility-field-error" role="alert">
                  {t('eligibilityRadioError')}
                </p>
              )}
            </fieldset>
          ))}
          {snapWic === 'yes' ? (
            <>
              <fieldset className="form-group apply-eligibility-fieldset">
                <legend className="apply-eligibility-legend">{t('eligibilityPublicAssistanceProgramsLegend')}</legend>
                <p className="apply-eligibility-prompt" id="apply-public-assistance-programs-prompt">
                  {t('eligibilityPublicAssistanceProgramsPrompt')}
                </p>
                <div
                  className="form-radio-cards"
                  role="group"
                  aria-labelledby="apply-public-assistance-programs-prompt"
                  aria-describedby={attemptedContinue && publicAssistancePrograms.length === 0 ? 'apply-eligibility-programs-error' : undefined}
                >
                  {PUBLIC_ASSISTANCE_PROGRAM_VALUES.map((program) => {
                    const checked = publicAssistancePrograms.includes(program);
                    const labelKey = program === 'tanf'
                      ? 'publicAssistanceTanf'
                      : program === 'wic'
                        ? 'publicAssistanceWic'
                        : program === 'snap'
                          ? 'publicAssistanceSnap'
                          : 'publicAssistanceOtherUnsure';
                    return (
                      <label key={program} className={`form-radio-card form-check-card ${checked ? 'selected' : ''}`}>
                        <input
                          type="checkbox"
                          name="publicAssistancePrograms"
                          value={program}
                          checked={checked}
                          onChange={() =>
                            setPublicAssistancePrograms((current) =>
                              normalizePublicAssistancePrograms(
                                current.includes(program) ? current.filter((item) => item !== program) : [...current, program],
                              ),
                            )
                          }
                        />
                        <span className="radio-dot" />
                        <span>{t(labelKey)}</span>
                      </label>
                    );
                  })}
                </div>
                {attemptedContinue && publicAssistancePrograms.length === 0 && (
                  <p id="apply-eligibility-programs-error" className="apply-eligibility-field-error" role="alert">
                    {t('eligibilityPublicAssistanceProgramsError')}
                  </p>
                )}
              </fieldset>
              <fieldset className="form-group apply-eligibility-fieldset">
                <legend className="apply-eligibility-legend">{t('eligibilityHelpApplyingLegend')}</legend>
                <p className="apply-eligibility-prompt">{t('eligibilityHelpApplyingPrompt')}</p>
                <div
                  className="form-radio-cards"
                  role="radiogroup"
                  aria-invalid={attemptedContinue && publicAssistanceHelpRequested === null}
                  aria-describedby={attemptedContinue && publicAssistanceHelpRequested === null ? 'apply-eligibility-help-error' : undefined}
                >
                  {(['yes', 'no'] as const).map((answer) => (
                    <label key={answer} className={`form-radio-card ${publicAssistanceHelpRequested === answer ? 'selected' : ''}`}>
                      <input
                        type="radio"
                        name="publicAssistanceHelpRequested"
                        value={answer}
                        checked={publicAssistanceHelpRequested === answer}
                        onChange={() => setPublicAssistanceHelpRequested(answer)}
                        required
                      />
                      <span className="radio-dot" />
                      <span>{t(answer === 'yes' ? 'answerYes' : 'answerNo')}</span>
                    </label>
                  ))}
                </div>
                {attemptedContinue && publicAssistanceHelpRequested === null && (
                  <p id="apply-eligibility-help-error" className="apply-eligibility-field-error" role="alert">
                    {t('eligibilityRadioError')}
                  </p>
                )}
              </fieldset>
            </>
          ) : null}
          {showLayoffCompany ? (
            <div className="form-group">
              <label htmlFor="apply-layoff-company">{t('eligibilityLayoffCompanyLabel')}</label>
              <input
                id="apply-layoff-company"
                type="text"
                name="layoffCompany"
                value={layoffCompany}
                onChange={(e) => setLayoffCompany(e.target.value)}
                maxLength={200}
                placeholder={t('eligibilityLayoffCompanyPlaceholder')}
              />
              <p className="apply-field-hint">{t('eligibilityLayoffCompanyHint')}</p>
            </div>
          ) : null}
        </div>
        ) : null}
        {panel === 'background' && !isSchool && canContinue && (
          <div className={`funding-banner ${qualifies ? 'funding-banner-qualify' : 'funding-banner-neutral'}`}>
            {qualifies ? (
              <p>
                <strong>{t('fundingBannerQualifyStrong')}</strong> {t('fundingBannerQualifyRest')}
              </p>
            ) : (
              <p>
                <strong>{t('fundingBannerNeutralStrong')}</strong> {t('fundingBannerNeutralRest')}
              </p>
            )}
          </div>
        )}
        {panel === 'contact' && <div className="apply-personal-block">
          <h3 className="apply-personal-block__title">{t('personalSectionTitle')}</h3>
          <div className="apply-personal-grid">
            <div className="form-group apply-form-group--full">
              <label htmlFor="apply-first-name">{tForm('firstNameRequired')}</label>
              <input
                id="apply-first-name"
                type="text"
                name="firstName"
                autoComplete="given-name"
                inputMode="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                aria-invalid={attemptedContinue && !firstName.trim()}
                aria-describedby={attemptedContinue && !firstName.trim() ? 'apply-first-name-error' : undefined}
              />
              {attemptedContinue && !firstName.trim() && (
                <p id="apply-first-name-error" className="apply-eligibility-field-error" role="alert">
                  {t('errFirstName')}
                </p>
              )}
            </div>
            <div className="form-group apply-form-group--full">
              <label htmlFor="apply-last-name">{tForm('lastNameRequired')}</label>
              <input
                id="apply-last-name"
                type="text"
                name="lastName"
                autoComplete="family-name"
                inputMode="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                aria-invalid={attemptedContinue && !lastName.trim()}
                aria-describedby={attemptedContinue && !lastName.trim() ? 'apply-last-name-error' : undefined}
              />
              {attemptedContinue && !lastName.trim() && (
                <p id="apply-last-name-error" className="apply-eligibility-field-error" role="alert">
                  {t('errLastName')}
                </p>
              )}
            </div>
            <div className="form-group apply-form-group--full">
              <label htmlFor="apply-email">{tForm('emailRequired')}</label>
              <input
                id="apply-email"
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                aria-invalid={attemptedContinue && !emailLooksValid(email.trim())}
                aria-describedby={attemptedContinue && !emailLooksValid(email.trim()) ? 'apply-email-error' : undefined}
              />
              {attemptedContinue && !emailLooksValid(email.trim()) && (
                <p id="apply-email-error" className="apply-eligibility-field-error" role="alert">
                  {email.trim().length === 0 ? t('errEmailRequired') : t('errEmailInvalid')}
                </p>
              )}
            </div>
            <div className="form-group apply-form-group--full">
              <label htmlFor="apply-phone">{tForm('phoneNumber')} *</label>
              <input
                id="apply-phone"
                type="tel"
                name="phone"
                autoComplete="tel"
                inputMode="tel"
                placeholder="(512) 555-0100"
                value={phone}
                onChange={(e) => {
                  const formatted = formatPhoneInput(e.target.value);
                  setPhone(formatted);
                  if (phoneError) {
                    const digits = formatted.replace(/\D/g, '');
                    if (digits.length >= 10) setPhoneError('');
                  }
                }}
                onBlur={() => {
                  const digits = phone.replace(/\D/g, '');
                  if (digits.length > 0 && digits.length < 10) {
                    setPhoneError(t('phoneValidationError'));
                  } else {
                    setPhoneError('');
                  }
                }}
                required
                minLength={10}
                aria-invalid={attemptedContinue && phone.replace(/\D/g, '').length < 10}
                aria-describedby="apply-phone-hint apply-phone-error"
              />
              <p id="apply-phone-hint" className="apply-field-hint">{t('eligibilityPhoneHint')}</p>
              {phoneError && (
                <p id="apply-phone-error" className="apply-eligibility-field-error" role="alert">
                  {phoneError}
                </p>
              )}
            </div>
          </div>
          {attemptedContinue && !contactOk && (
            <p className="apply-eligibility-field-error" role="alert">
              {t('contactIncompleteError')}
            </p>
          )}
        </div>}

        {panel === 'background' && <div className="apply-personal-block">
          <h3 className="apply-personal-block__title">{t(isSchool ? 'schoolScreeningTitle' : 'screeningSectionTitle')}</h3>
          <div className="apply-personal-grid">
            <div className="form-group apply-form-group--full">
              <label htmlFor="apply-age-group">{t('ageGroupLabel')}</label>
              <select
                id="apply-age-group"
                name="ageGroup"
                value={ageGroup}
                onChange={(e) => setAgeGroup(e.target.value as ApplyFlowDraftV1['ageGroup'])}
                required
                aria-invalid={attemptedContinue && !ageGroup}
              >
                <option value="">{t('ageGroupPlaceholder')}</option>
                {ageOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            {isSchool ? (
              <div className="form-group apply-form-group--full">
                <label htmlFor="apply-grade-level">{t('schoolGradeLabel')}</label>
                <select
                  id="apply-grade-level"
                  name="gradeLevel"
                  value={gradeLevel}
                  onChange={(e) => setGradeLevel(e.target.value)}
                  required
                  aria-invalid={attemptedContinue && !gradeLevel}
                >
                  <option value="">{t('schoolGradePlaceholder')}</option>
                  {SCHOOL_GRADE_LEVELS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            ) : null}
            {guardianRequired ? (
              <>
                <div className="form-group apply-form-group--full">
                  <label htmlFor="apply-guardian-name">{t('schoolGuardianName')}</label>
                  <input
                    id="apply-guardian-name"
                    type="text"
                    name="parentGuardianName"
                    autoComplete="name"
                    value={parentGuardianName}
                    onChange={(e) => setParentGuardianName(e.target.value)}
                    required
                    aria-invalid={attemptedContinue && !parentGuardianName.trim()}
                  />
                </div>
                <div className="form-group apply-form-group--full">
                  <label htmlFor="apply-guardian-email">{t('schoolGuardianEmail')}</label>
                  <input
                    id="apply-guardian-email"
                    type="email"
                    name="parentGuardianEmail"
                    autoComplete="email"
                    value={parentGuardianEmail}
                    onChange={(e) => setParentGuardianEmail(e.target.value)}
                    required
                    aria-invalid={attemptedContinue && !emailLooksValid(parentGuardianEmail.trim())}
                  />
                </div>
                <div className="form-group apply-form-group--full">
                  <label htmlFor="apply-guardian-phone">{t('schoolGuardianPhone')}</label>
                  <input
                    id="apply-guardian-phone"
                    type="tel"
                    name="parentGuardianPhone"
                    autoComplete="tel"
                    value={parentGuardianPhone}
                    onChange={(e) => setParentGuardianPhone(formatPhoneInput(e.target.value))}
                  />
                </div>
              </>
            ) : null}
            <div className="form-group apply-form-group--full">
              <label htmlFor="apply-city">{tForm('city')} *</label>
              <input
                id="apply-city"
                type="text"
                name="city"
                autoComplete="address-level2"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                required
                aria-invalid={attemptedContinue && !city.trim()}
              />
            </div>
            <div className="form-group apply-form-group--full">
              <label htmlFor="apply-state">{tForm('state')} *</label>
              <select
                id="apply-state"
                name="state"
                autoComplete="address-level1"
                value={stateVal}
                onChange={(e) => setStateVal(e.target.value)}
                required
                aria-invalid={attemptedContinue && !stateVal.trim()}
              >
                <option value="">{tForm('selectState')}</option>
                {US_STATES.map((s) => (
                  <option key={s.abbr} value={s.abbr}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group apply-form-group--full">
              <label htmlFor="apply-zip">{tForm('zip')} *</label>
              <input
                id="apply-zip"
                type="text"
                name="zip"
                autoComplete="postal-code"
                inputMode="text"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                required
                aria-invalid={attemptedContinue && !zipOk}
              />
            </div>
            {!isSchool ? (
              <div className="form-group apply-form-group--full">
                <label htmlFor="apply-county">{t('countyLabel')}</label>
                <input
                  id="apply-county"
                  type="text"
                  name="county"
                  value={county}
                  onChange={(e) => setCounty(e.target.value)}
                  required
                  aria-invalid={attemptedContinue && !county.trim()}
                />
              </div>
            ) : null}
            {!isSchool ? (
              <div className="form-group apply-form-group--full">
                <label>{t('primaryBarriersLabel')}</label>
                <div className="apply-barrier-options" role="group" aria-label={t('primaryBarriersAria')}>
                  {PRIMARY_BARRIER_OPTIONS.map((option) => {
                    const fixed = option.value === DEFAULT_PRIMARY_BARRIER.value;
                    return (
                      <label key={option.value} className={`apply-barrier-option${fixed ? ' apply-barrier-option--fixed' : ''}`}>
                        <input
                          type="checkbox"
                          name="primaryBarriers"
                          value={option.value}
                          checked={fixed || primaryBarriers.includes(option.value)}
                          disabled={fixed}
                          onChange={() => toggleBarrier(option.value)}
                        />
                        <span className="apply-barrier-option__label">{option.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {!isSchool ? (
              <>
                <div className="form-group apply-form-group--full">
                  <label htmlFor="apply-hear-about">{t('eligibilityHearAboutLabel')}</label>
                  <HearAboutSelect
                    id="apply-hear-about"
                    name="hearAbout"
                    value={hearAbout}
                    onChange={setHearAbout}
                    required
                    placeholder={t('eligibilityHearAboutPlaceholder')}
                    aria-invalid={attemptedContinue && !hearAbout.trim()}
                  />
                </div>
                {hearAboutNeedsOther(hearAbout) ? (
                  <div className="form-group apply-form-group--full">
                    <label htmlFor="apply-hear-about-other">{t('eligibilityHearAboutOtherLabel')}</label>
                    <input
                      id="apply-hear-about-other"
                      type="text"
                      name="hearAboutOther"
                      value={hearAboutOther}
                      onChange={(e) => setHearAboutOther(e.target.value)}
                      required
                      maxLength={200}
                      aria-invalid={attemptedContinue && !hearAboutOther.trim()}
                    />
                  </div>
                ) : null}
                <div className="form-group apply-form-group--full">
                  <label htmlFor="apply-partner-ambassador">{t('eligibilityPartnerAmbassadorLabel')}</label>
                  <input
                    id="apply-partner-ambassador"
                    type="text"
                    name="partnerAmbassadorReferral"
                    value={partnerAmbassadorReferral}
                    onChange={(e) => setPartnerAmbassadorReferral(e.target.value)}
                    maxLength={200}
                    placeholder={t('eligibilityPartnerAmbassadorPlaceholder')}
                  />
                  <p className="apply-field-hint">{t('eligibilityPartnerAmbassadorHint')}</p>
                </div>
              </>
            ) : null}
          </div>
          {attemptedContinue && !screeningDetailsOk && (
            <p className="apply-eligibility-field-error" role="alert">
              {t(isSchool ? 'schoolScreeningIncompleteError' : 'screeningIncompleteError')}
            </p>
          )}
        </div>}

        <div className="apply-step1-actions">
          <button
            type="submit"
            className={marketingButtonPresets.formSubmitPrimary('apply-step1-actions__primary')}
            aria-describedby={attemptedContinue && !panelComplete ? 'apply-eligibility-summary-error apply-eligibility-continue-hint' : !panelComplete ? 'apply-eligibility-continue-hint' : undefined}
          >
            {t(panelIndex === panels.length - 1 ? 'continueToPrograms' : 'eligibilityPanelNext')}
          </button>
          {panelIndex > 0 && <button type="button" className={marketingButtonPresets.formOutlineSecondary('apply-step1-actions__secondary')} onClick={() => changePanel(panels[panelIndex - 1])}>{t('eligibilityPanelBack')}</button>}
          {!isPaid ? (
            <button type="button" className={marketingButtonPresets.formOutlineSecondary('apply-step1-actions__secondary')} onClick={handleSaveLater}>
              {t('saveContinueLater')}
            </button>
          ) : null}
        </div>
        {attemptedContinue && !panelComplete ? (
          <p id="apply-eligibility-summary-error" className="apply-eligibility-field-error" role="alert">
            {t(panel === 'funding' ? 'eligibilityRadioError' : panel === 'contact' ? 'contactIncompleteError' : isSchool ? 'schoolScreeningIncompleteError' : 'screeningIncompleteError')}
          </p>
        ) : null}
        <p className="apply-consent-line" style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0.75rem 0 0', lineHeight: 1.5 }}>
          {t('applyConsentLine')}{' '}
          <LocalizedLink href="/privacy" style={{ color: 'inherit', textDecoration: 'underline' }}>
            {t('applyConsentPrivacy')}
          </LocalizedLink>{' '}
          {t('applyConsentAnd')}{' '}
          <LocalizedLink href="/terms" style={{ color: 'inherit', textDecoration: 'underline' }}>
            {t('applyConsentTerms')}
          </LocalizedLink>
          .
        </p>
        {saveNotice ? (
          <p className="apply-save-notice" role="status" aria-live="polite">
            {saveNotice}
          </p>
        ) : autoSaved ? (
          <p className="apply-save-notice" role="status" aria-live="polite">
            {t('autoSavedNotice')}
          </p>
        ) : null}
        {(!panelComplete || attemptedContinue) && (
          <p id="apply-eligibility-continue-hint" className="apply-continue-hint" tabIndex={-1} role={attemptedContinue ? 'status' : undefined}>
            {attemptedContinue && !panelComplete
              ? t(isSchool ? 'schoolContinueBlocked' : 'continueBlockedHint')
              : t(isSchool ? 'schoolContinueSoft' : 'continueSoftHint')}
          </p>
        )}
      </form>
    </div>
  );
}

export { APPLY_STORAGE_KEY };
