import { getTranslations } from 'next-intl/server';
import LegacyGlyph from '@/components/icons/LegacyGlyph';

/** Shorter labels than the desktop sidebar — mobile step pills are one-third width. */
const APPLY_PROGRESS_STEPS = [
  { labelKey: 'stepPersonalInfoMobile', icon: 'person' },
  { labelKey: 'stepBackgroundMobile', icon: 'work' },
  { labelKey: 'stepProgramSelectionMobile', icon: 'school' },
] as const;

const SCHOOL_PROGRESS_STEPS = [
  { labelKey: 'schoolStepPersonalInfoMobile', icon: 'person' },
  { labelKey: 'stepBackgroundMobile', icon: 'school' },
  { labelKey: 'stepProgramSelectionMobile', icon: 'key' },
] as const;

const STEP_TIME_HINT_KEYS = {
  0: 'step1TimeHintMobile',
  1: 'step2TimeHintMobile',
  2: 'step3TimeHintMobile',
} as const;

type ApplyMobileStepNavProps = {
  activeStep?: 0 | 1 | 2;
  /** When true, appends a step-specific time hint to the mobile summary line. */
  showTimeHint?: boolean;
  /** High-school collection: step 1 is "You" not "Eligibility". */
  school?: boolean;
};

export default async function ApplyMobileStepNav({
  activeStep = 0,
  showTimeHint = false,
  school = false,
}: ApplyMobileStepNavProps) {
  const t = await getTranslations('apply');
  const steps = school ? SCHOOL_PROGRESS_STEPS : APPLY_PROGRESS_STEPS;
  const totalSteps = steps.length;
  const timeHintKey = showTimeHint ? STEP_TIME_HINT_KEYS[activeStep] : null;

  return (
    <nav className="apply-mobile-step-nav" aria-label={t('applicationProgress')}>
      <p className="apply-mobile-step-nav__summary">
        {timeHintKey
          ? t('mobileStepSummaryWithTime', {
              current: activeStep + 1,
              total: totalSteps,
              time: t(timeHintKey as Parameters<typeof t>[0]),
            })
          : t('mobileStepSummary', { current: activeStep + 1, total: totalSteps })}
      </p>
      <ol className="apply-mobile-step-nav__list">
        {steps.map((step, i) => (
          <li
            key={step.labelKey}
            className={`apply-mobile-step-nav__item${i === activeStep ? ' apply-mobile-step-nav__item--active' : ''}`}
            aria-current={i === activeStep ? 'step' : undefined}
          >
            <span className="apply-mobile-step-nav__index" aria-hidden="true">
              {i + 1}
            </span>
            <LegacyGlyph name={step.icon} size={16} className="apply-mobile-step-nav__icon" />
            <span className="apply-mobile-step-nav__label">
              {t(step.labelKey as Parameters<typeof t>[0])}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
