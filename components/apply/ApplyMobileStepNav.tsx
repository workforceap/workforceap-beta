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

type ApplyMobileStepNavProps = {
  activeStep?: 0 | 1 | 2;
  /** When true, appends a translated active-step label to the mobile summary line. */
  showStepHint?: boolean;
  /** High-school collection: step 1 is "You" not "Eligibility". */
  school?: boolean;
};

export default async function ApplyMobileStepNav({
  activeStep = 0,
  showStepHint = false,
  school = false,
}: ApplyMobileStepNavProps) {
  const t = await getTranslations('apply');
  const steps = school ? SCHOOL_PROGRESS_STEPS : APPLY_PROGRESS_STEPS;
  const totalSteps = steps.length;
  const hintKey = showStepHint ? steps[activeStep].labelKey : null;

  return (
    <nav className="apply-mobile-step-nav" aria-label={t('applicationProgress')}>
      <p className="apply-mobile-step-nav__summary">
        {hintKey
          ? t('mobileStepSummaryWithHint', {
              current: activeStep + 1,
              total: totalSteps,
              hint: t(hintKey as Parameters<typeof t>[0]),
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
