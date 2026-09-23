'use client';

import { useState, useEffect, useRef, useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { Clock } from 'lucide-react';
import LocalizedLink from '@/components/LocalizedLink';
import { PROGRAMS, getProgramBySlug, type Program } from '@/lib/content/programs';
import { readApplyDraft, readSavedEligibility, saveSelectedPrograms, type SavedEligibility, type ApplyDraft } from '@/lib/apply/applyBrowserState';
import { applyRecoveryHref, type ApplyRecoveryContext } from '@/lib/apply/applyRecoveryHref';
import { ApplyReadyContent, ApplyResumeGate } from '@/components/apply/ApplyReadiness';
import { localizeHref, useLocaleFromPath } from '@/lib/i18n/client';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { ProgramIcon } from '@/components/ProgramIcon';
import { useTranslations } from 'next-intl';
import { trackApplyFunnel } from '@/lib/analytics/events';

const FYP_RESULTS_KEY = 'find_your_path_results';
const EMPTY_PROGRAMS: string[] = [];
const MAX_PICKS = 3;

type CareerMatchPayload = {
  version?: number;
  programSlugs?: string[];
  careerMatch?: { recommendedPrograms?: { programSlug: string }[] } | null;
};

function toggleSlug(list: string[], slug: string, max: number): string[] {
  const i = list.indexOf(slug);
  if (i >= 0) return list.filter((s) => s !== slug);
  if (list.length < max) return [...list, slug];
  return list;
}

export default function ApplyResultsClient({
  schoolApply: schoolApplyFromServer = false,
  schoolName = null,
  schoolProgramSlugs = EMPTY_PROGRAMS,
  readyHeader,
  readyIntro,
  recoveryContext,
}: {
  recoveryContext?: ApplyRecoveryContext;
  readyHeader?: ReactNode;
  readyIntro?: ReactNode;
  schoolApply?: boolean;
  schoolName?: string | null;
  schoolProgramSlugs?: string[];
}) {
  const t = useTranslations('apply');
  const tCta = useTranslations('cta');
  const locale = useLocaleFromPath();
  const [storageError, setStorageError] = useState(false);
  const [eligibility, setEligibility] = useState<SavedEligibility | null>(null);
  const searchParams = useSearchParams();
  const programParam = searchParams?.get('program');
  const [pageState, setPageState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [savedDraft, setSavedDraft] = useState<ApplyDraft | null>(null);
  const [qualifies, setQualifies] = useState<boolean | null>(null);
  const [isSchool, setIsSchool] = useState(schoolApplyFromServer);
  const [schoolLabel, setSchoolLabel] = useState(schoolName ?? '');
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  /** From Find Your Path v1 localStorage — used to label + order cards. */
  const [quizRecommendedSlugs, setQuizRecommendedSlugs] = useState<string[]>([]);
  const continuedRef = useRef(false);
  const qualifiesRef = useRef<boolean | null>(null);
  const selectedSlugsRef = useRef<string[]>([]);
  const firstCardRef = useRef<HTMLDivElement>(null);
  // The "select a program" message is only an error once the applicant has
  // tried to continue; before that it is a plain hint.
  const [attemptedContinue, setAttemptedContinue] = useState(false);
  // Polite announcement when a pick is refused because three are chosen.
  const [limitNotice, setLimitNotice] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const data = readSavedEligibility();
      if (!data) {
        trackApplyFunnel(2, 'results_missing_prereq');
        setSavedDraft(readApplyDraft());
        setPageState('missing');
        return;
      }
      setEligibility(data);
      const schoolFlow = schoolApplyFromServer || data.schoolApply === true;
      setIsSchool(schoolFlow);
      if (data.schoolName) setSchoolLabel(data.schoolName);
      setQualifies(schoolFlow ? true : data.qualifies === true);

      const catalog = new Set(schoolProgramSlugs);
      const allowSlug = (slug: string) =>
        !schoolFlow || catalog.size === 0 || catalog.has(slug);
      const explicitSlug =
        programParam && getProgramBySlug(programParam) && allowSlug(programParam)
          ? programParam
          : null;
      // Only an explicit ?program= (the card the applicant clicked on the
      // programs page) is pre-selected. Career-quiz results used to be
      // auto-selected here, which made cards look already chosen; the
      // applicant now makes every pick themselves.
      const initial: string[] = explicitSlug ? [explicitSlug] : [];
      try {
        const fyp = localStorage.getItem(FYP_RESULTS_KEY);
        if (fyp) {
          const parsed = JSON.parse(fyp) as CareerMatchPayload | string[] | unknown;
          if (
            parsed &&
            typeof parsed === 'object' &&
            !Array.isArray(parsed) &&
            'version' in parsed &&
            Array.isArray((parsed as CareerMatchPayload).programSlugs)
          ) {
            const v1 = parsed as CareerMatchPayload;
            const fromQuiz = v1.programSlugs!
              .map((s) => (typeof s === 'string' ? s : null))
              .filter((s): s is string => !!s && !!getProgramBySlug(s) && allowSlug(s))
              .slice(0, 3);
            // Quiz matches only influence card ORDER (shown first), never selection.
            if (fromQuiz.length) setQuizRecommendedSlugs(fromQuiz);
          }
        }
      } catch {
        /* ignore */
      }

      if (initial.length) setSelectedSlugs(initial);
      setPageState('ready');
    } catch {
      trackApplyFunnel(2, 'results_missing_prereq');
      setSavedDraft(readApplyDraft());
      setPageState('missing');
    }
  }, [programParam, schoolApplyFromServer, schoolProgramSlugs]);

  useEffect(() => {
    if (pageState !== 'ready' || qualifies === null) return;
    trackApplyFunnel(2, 'results_view', { qualifies });
  }, [qualifies, pageState]);

  useEffect(() => {
    qualifiesRef.current = qualifies;
    selectedSlugsRef.current = selectedSlugs;
  }, [qualifies, selectedSlugs]);

  useEffect(() => {
    return () => {
      if (pageState === 'ready' && !continuedRef.current) {
        trackApplyFunnel(2, 'results_dropoff', {
          qualifies: qualifiesRef.current,
          selected_program_slugs: selectedSlugsRef.current,
        });
      }
    };
  }, [pageState]);

  const [shareCopied, setShareCopied] = useState(false);
  const handleShareLink = () => {
    // The recipient has no saved eligibility, so send them to the start of the
    // application with the first choice pre-selected (/apply forwards a single
    // ?program= to this step).
    const url = window.location.origin + localizeHref('/apply?program=' + encodeURIComponent(selectedSlugs[0]), locale);
    navigator.clipboard.writeText(url).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    });
  };

  const handleContinue = () => {
    if (selectedSlugs.length === 0) {
      trackApplyFunnel(2, 'program_continue_blocked');
      setAttemptedContinue(true);
      firstCardRef.current?.focus();
      return;
    }
    if (!saveSelectedPrograms(selectedSlugs, eligibility)) {
      setStorageError(true);
      return;
    }
    continuedRef.current = true;
    trackApplyFunnel(2, 'program_selected', {
      program_slugs: selectedSlugs,
      qualifies,
    });
    window.location.href = localizeHref(applyRecoveryHref('/apply/create-account', recoveryContext), locale);
  };

  const programsOrdered = useMemo(() => {
    const catalog = schoolProgramSlugs
      .map((slug) => getProgramBySlug(slug))
      .filter((program): program is Program => Boolean(program));
    const base = isSchool && catalog.length > 0 ? catalog : [...PROGRAMS];
    // Priority: explicit ?program= first, then quiz recs (deduped). Mirrors
    // selection precedence so the card user clicked from is ranked first.
    const explicitSlug =
      programParam && getProgramBySlug(programParam) && base.some((p) => p.slug === programParam)
        ? programParam
        : null;
    const priority: string[] = [];
    if (explicitSlug) priority.push(explicitSlug);
    for (const s of quizRecommendedSlugs) {
      if (!priority.includes(s)) priority.push(s);
    }
    if (priority.length === 0) return base;
    return [...base].sort((a, b) => {
      const ai = priority.indexOf(a.slug);
      const bi = priority.indexOf(b.slug);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return 0;
    });
  }, [quizRecommendedSlugs, programParam, isSchool, schoolProgramSlugs]);

  const pickProgram = (slug: string) => {
    const atLimit = !selectedSlugs.includes(slug) && selectedSlugs.length >= MAX_PICKS;
    setLimitNotice(atLimit ? t(qualifies ? 'resultsHintQualifies' : 'resultsHintNonQual') : '');
    if (atLimit) return;
    setSelectedSlugs((prev) => toggleSlug(prev, slug, MAX_PICKS));
  };

  const rankLabel = (slug: string) => {
    const i = selectedSlugs.indexOf(slug);
    if (i < 0) return null;
    const labels = [t('resultsRankFirst'), t('resultsRankSecond'), t('resultsRankThird')];
    return labels[i] ?? `${i + 1}`;
  };

  if (pageState === 'loading') {
    return (
      <div className="apply-flow">
        <div className="apply-progress-bar">
          <div className="skeleton" style={{ height: 6, borderRadius: 3, width: '66%' }} />
        </div>
        <div className="apply-step-content" style={{ marginTop: '1.5rem' }}>
          <CardSkeleton />
        </div>
      </div>
    );
  }

  if (pageState === 'missing') return <ApplyResumeGate draft={savedDraft} recoveryContext={recoveryContext} />;

  return (
    <ApplyReadyContent header={readyHeader} intro={readyIntro}>
    {storageError && <p role="alert">{t('storageContinueFailed')}</p>}
    <div className="apply-flow">
      <div className="apply-progress-bar">
        <div className="apply-progress-fill" style={{ width: '66%' }} />
        <p className="apply-progress-label">{t(isSchool ? 'schoolResultsProgressLabel' : 'resultsProgressLabel')}</p>
      </div>

      <div className="apply-step-content">
        <p className="apply-step-back-nav">
          <LocalizedLink href={applyRecoveryHref('/apply', recoveryContext)}>{t(isSchool ? 'schoolResultsBackStep1' : 'resultsBackStep1')}</LocalizedLink>
        </p>
        <p className="apply-step-kicker">{t(isSchool ? 'schoolResultsKicker' : 'resultsKicker')}</p>
        <details className="apply-transition-details">
          <summary className="apply-transition-details__summary">{t('resultsTransitionSummary')}</summary>
          <div className="apply-transition-details__body">
            <div className="apply-transition-card" role="note" aria-label={t('resultsTransitionAria')}>
              <strong>{t('resultsBeforeStrong')}</strong>
              <span>
                {' '}
                {t('resultsBeforePick')}{' '}
                <LocalizedLink href="/find-your-path">{t('resultsPathfinderQuizLink')}</LocalizedLink>
                {t('resultsBeforeSuffix')}
              </span>
            </div>
          </div>
        </details>
        <div className="apply-results-preface">
        {qualifies ? (
          <>
            <div className={`funding-banner funding-banner-qualify`} style={{ marginBottom: '1.5rem' }}>
              <p>
                {isSchool ? (
                  <>
                    <strong>{t('schoolResultsSponsoredStrong')}</strong>{' '}
                    {t('schoolResultsSponsoredRest', { school: schoolLabel || 'your school' })}
                  </>
                ) : (
                  <>
                    <strong>{t('resultsFundingFitStrong')}</strong> {t('resultsFundingFitRest')}
                  </>
                )}
              </p>
            </div>
            <div className="apply-undecided-reassurance" style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem', background: 'var(--surface-container)', borderRadius: '8px', border: '1px solid var(--outline-variant)' }}>
              <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.6, color: 'var(--color-on-surface-variant)' }}>
                <strong style={{ color: 'var(--color-on-surface)' }}>{t('resultsUndecidedLead')}</strong> {t('resultsUndecidedBody')}
              </p>
            </div>
            <h2 className="apply-step-title">{t('resultsTitleQualifies')}</h2>
            <p className="apply-results-program-hint">{t('resultsHintQualifies')}</p>
          </>
        ) : (
          <>
            <div className="apply-results-anyway" style={{ marginBottom: '1rem', padding: '1rem 1.25rem', background: 'var(--surface-container)', borderRadius: '8px' }}>
              <p style={{ margin: 0 }}>
                <strong>{t('resultsMismatchStrong')}</strong> {t('resultsMismatchRest')}
              </p>
            </div>
            <section className="apply-foundational-support" aria-labelledby="apply-foundational-heading">
              <h2 id="apply-foundational-heading" className="apply-foundational-support__title">
                {t('resultsFoundationalTitle')}
              </h2>
              <ul className="apply-foundational-support__list">
                <li>
                  <strong>{t('resultsFoundationalLi1Strong')}</strong> {t('resultsFoundationalLi1Rest')}{' '}
                  <LocalizedLink href="/find-your-path">{t('resultsTwoMinutePathfinder')}</LocalizedLink> {t('resultsFoundationalLi1Suffix')}
                </li>
                <li>
                  <strong>{t('resultsFoundationalLi2Strong')}</strong> <LocalizedLink href="/contact">{t('resultsFoundationalLi2Mid')}</LocalizedLink> {t('resultsFoundationalLi2Suffix')}{' '}
                  <a href="tel:+15127771808">(512) 777-1808</a>.
                </li>
              </ul>
            </section>
            <h2 className="apply-step-title">{t('resultsTitleNonQual')}</h2>
            <p className="apply-results-program-hint">{t('resultsHintNonQual')}</p>
          </>
        )}
        </div>

        <p className="apply-results-program-hint">
          <LocalizedLink href="/salary-guide" style={{ display: 'inline-flex', alignItems: 'center', minHeight: '44px' }}>{tCta('viewSalaryGuide')}</LocalizedLink>
        </p>
        <div
          className="apply-results-program-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '1rem',
            marginTop: '1.5rem',
            marginBottom: '1.5rem',
          }}
        >
          {programsOrdered.map((p: Program, index: number) => {
            const rank = rankLabel(p.slug);
            const selected = rank !== null;
            return (
              <div
                key={p.slug}
                ref={index === 0 ? firstCardRef : undefined}
                className="apply-results-program-card"
                onClick={() => pickProgram(p.slug)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    pickProgram(p.slug);
                  }
                }}
                aria-pressed={selected}
                style={{
                  padding: isSchool ? '2rem 1.25rem 1.25rem' : '1.25rem',
                  border: selected ? '2px solid var(--color-accent)' : '1px solid var(--outline-variant)',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  background: selected ? 'color-mix(in srgb, var(--color-green) 8%, transparent)' : 'var(--color-white)',
                  position: 'relative',
                }}
              >
                {isSchool ? (
                  <span
                    style={{
                      position: 'absolute',
                      top: '0.5rem',
                      left: '0.5rem',
                      fontSize: '0.8125rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: 'var(--color-on-primary)',
                      background: 'var(--color-primary)',
                      padding: '0.2rem 0.45rem',
                      borderRadius: 4,
                    }}
                  >
                    {t('schoolResultsCatalogBadge')}
                  </span>
                ) : null}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                  <span
                    style={{
                      background: p.categoryColor,
                      color: 'white',
                      padding: '0.2rem 0.6rem',
                      borderRadius: '50px',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                    }}
                  >
                    {p.categoryLabel}
                  </span>
                  {/* The rank sits in the row, next to the icon, so it can't cover it (WAP-271). */}
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: 'auto' }}>
                    {rank && (
                      <span
                        style={{
                          fontSize: '0.8125rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          color: 'var(--wa-accent-text)',
                        }}
                      >
                        {rank}
                      </span>
                    )}
                    <ProgramIcon program={p} size={24} />
                  </span>
                </div>
                <p className="apply-results-program-card-title">{p.title}</p>
                <div style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Clock size={16} aria-hidden="true" />
                    {p.duration}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <p
          className={limitNotice ? 'apply-continue-hint' : undefined}
          role="status"
          aria-live="polite"
          style={limitNotice ? { marginBottom: '0.75rem' } : { margin: 0 }}
        >
          {limitNotice}
        </p>

        {selectedSlugs.length === 0 &&
          (attemptedContinue ? (
            <p id="apply-results-continue-hint" className="apply-continue-hint" role="alert">
              {t('resultsSelectProgramError')}
            </p>
          ) : (
            <p id="apply-results-continue-hint" className="apply-continue-hint">
              {t('resultsSelectProgramError')}
            </p>
          ))}

        <button
          type="button"
          className="btn btn-primary"
          aria-describedby={selectedSlugs.length === 0 ? 'apply-results-continue-hint' : undefined}
          onClick={handleContinue}
        >
          {t('resultsContinueAccount')}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginTop: '0.75rem' }}
          onClick={handleShareLink}
          disabled={selectedSlugs.length === 0}
        >
          {shareCopied ? t('shareLinkCopied') : t('shareLink')}
        </button>
      </div>
    </div>
    </ApplyReadyContent>
  );
}
