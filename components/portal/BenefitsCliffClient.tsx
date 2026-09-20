'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Info, Landmark, TrendingUp, TrendingDown, Minus, AlertTriangle, Headset } from 'lucide-react';
import {
  ALL_CLIFF_SOURCES,
  BENEFITS_CLIFF_RULES_VERSION,
  computeCliff,
  type CliffProgramId,
  type CliffResult,
} from '@/lib/content/benefitsCliff';
import { StatusTag, colorVar, type KitColor } from '@/components/portal/kit';

const PROGRAM_OPTIONS: { id: CliffProgramId; labelKey: string }[] = [
  { id: 'snap', labelKey: 'programSnap' },
  { id: 'medicaidAdult', labelKey: 'programMedicaidAdult' },
  { id: 'medicaidChild', labelKey: 'programMedicaidChild' },
  { id: 'tanf', labelKey: 'programTanf' },
];

const inputStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 48,
  padding: '0.55rem 0.75rem',
  borderRadius: 'var(--wa-radius-sm)',
  border: '1px solid var(--wa-border)',
  background: 'var(--wa-surface)',
  color: 'var(--wa-text)',
  fontSize: '0.9rem',
  fontWeight: 600,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '0.35rem',
  fontSize: '0.85rem',
  fontWeight: 700,
  color: 'var(--wa-text)',
};

const btnFocusClass =
  'wa-kit-focus enabled:hover:wa-opacity-90 enabled:active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none';

function money(n: number): string {
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(Math.round(n)).toLocaleString('en-US')}`;
}

export default function BenefitsCliffClient() {
  const t = useTranslations('benefitsCliff');

  const [householdSize, setHouseholdSize] = useState('3');
  const [receives, setReceives] = useState<CliffProgramId[]>(['snap']);
  const [currentEarnings, setCurrentEarnings] = useState('');
  const [currentSnap, setCurrentSnap] = useState('');
  const [offerWage, setOfferWage] = useState('');
  const [offerHours, setOfferHours] = useState('40');
  const [submitted, setSubmitted] = useState(false);

  const toggleProgram = (id: CliffProgramId) => {
    setSubmitted(false);
    setReceives((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const wage = parseFloat(offerWage);
  const hours = parseFloat(offerHours);
  const canCompute = Number.isFinite(wage) && wage > 0 && Number.isFinite(hours) && hours > 0 && receives.length > 0;

  const result: CliffResult | null = useMemo(() => {
    if (!submitted || !canCompute) return null;
    const snapAmount = parseFloat(currentSnap);
    return computeCliff({
      householdSize: parseInt(householdSize, 10) || 1,
      receives,
      currentMonthlyEarnings: parseFloat(currentEarnings) || 0,
      offerHourlyWage: wage,
      offerHoursPerWeek: hours,
      currentSnapMonthly: Number.isFinite(snapAmount) && snapAmount >= 0 ? snapAmount : undefined,
    });
  }, [submitted, canCompute, householdSize, receives, currentEarnings, currentSnap, wage, hours]);

  const verdictMeta =
    result &&
    {
      better_off: { icon: TrendingUp, color: 'success' as KitColor, title: t('verdictBetter') },
      worse_off: { icon: TrendingDown, color: 'accent' as KitColor, title: t('verdictWorse') },
      about_the_same: { icon: Minus, color: 'muted' as KitColor, title: t('verdictSame') },
    }[result.verdict];

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      {/* ── Disclaimer — always visible, before any inputs ── */}
      <div
        className="wa-kit-card wa-kit-card--sm"
        role="note"
        style={{ borderLeft: '4px solid var(--wa-accent)', display: 'flex', gap: '0.6rem', alignItems: 'flex-start' }}
      >
        <Info size={18} color="var(--wa-accent)" aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: 'var(--wa-text)' }}>
            {t('disclaimerTitle')}
          </p>
          <p style={{ margin: '0.35rem 0 0', fontSize: '0.82rem', lineHeight: 1.5, color: 'var(--wa-muted)' }}>
            {t('disclaimerBody')}
          </p>
        </div>
      </div>

      {/* ── Inputs ── */}
      <form
        className="wa-kit-card"
        style={{ display: 'grid', gap: '0.9rem' }}
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(true);
        }}
      >
        <div>
          <label htmlFor="bc-household" style={labelStyle}>
            {t('householdLabel')}
          </label>
          <select
            id="bc-household"
            value={householdSize}
            onChange={(e) => {
              setHouseholdSize(e.target.value);
              setSubmitted(false);
            }}
            className="wa-kit-focus"
            style={inputStyle}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={String(n)}>
                {n === 8 ? t('householdEightPlus') : n}
              </option>
            ))}
          </select>
        </div>

        <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
          <legend style={{ ...labelStyle, padding: 0 }}>{t('receivesLabel')}</legend>
          <div style={{ display: 'grid', gap: '0.4rem' }}>
            {PROGRAM_OPTIONS.map((p) => (
              <label
                key={p.id}
                className="wa-kit-focus"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  minHeight: 44,
                  padding: '0.35rem 0.6rem',
                  borderRadius: 'var(--wa-radius-sm)',
                  border: '1px solid var(--wa-border)',
                  background: receives.includes(p.id) ? 'color-mix(in srgb, var(--wa-accent) 6%, transparent)' : 'var(--wa-surface)',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  color: 'var(--wa-text)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={receives.includes(p.id)}
                  onChange={() => toggleProgram(p.id)}
                  style={{ width: 20, height: 20 }}
                />
                {t(p.labelKey)}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="bc-current-earnings" style={labelStyle}>
            {t('currentEarningsLabel')}
          </label>
          <input
            id="bc-current-earnings"
            type="number"
            inputMode="decimal"
            min={0}
            step="1"
            placeholder="0"
            value={currentEarnings}
            onChange={(e) => {
              setCurrentEarnings(e.target.value);
              setSubmitted(false);
            }}
            className="wa-kit-focus"
            style={inputStyle}
          />
          <p style={{ margin: '0.3rem 0 0', fontSize: '0.8125rem', color: 'var(--wa-muted)' }}>
            {t('currentEarningsHint')}
          </p>
        </div>

        {receives.includes('snap') && (
          <div>
            <label htmlFor="bc-current-snap" style={labelStyle}>
              {t('currentSnapLabel')}
            </label>
            <input
              id="bc-current-snap"
              type="number"
              inputMode="decimal"
              min={0}
              step="1"
              placeholder={t('optionalPlaceholder')}
              value={currentSnap}
              onChange={(e) => {
                setCurrentSnap(e.target.value);
                setSubmitted(false);
              }}
              className="wa-kit-focus"
              style={inputStyle}
            />
          </div>
        )}

        <div style={{ display: 'grid', gap: '0.9rem', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
          <div>
            <label htmlFor="bc-wage" style={labelStyle}>
              {t('offerWageLabel')}
            </label>
            <input
              id="bc-wage"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.25"
              placeholder="15.00"
              value={offerWage}
              onChange={(e) => {
                setOfferWage(e.target.value);
                setSubmitted(false);
              }}
              className="wa-kit-focus"
              style={inputStyle}
              required
            />
          </div>
          <div>
            <label htmlFor="bc-hours" style={labelStyle}>
              {t('offerHoursLabel')}
            </label>
            <input
              id="bc-hours"
              type="number"
              inputMode="decimal"
              min={1}
              max={80}
              step="1"
              value={offerHours}
              onChange={(e) => {
                setOfferHours(e.target.value);
                setSubmitted(false);
              }}
              className="wa-kit-focus"
              style={inputStyle}
              required
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={!canCompute}
          className={btnFocusClass}
          style={{
            minHeight: 48,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.4rem',
            background: 'var(--wa-accent)',
            color: 'var(--wa-on-accent)',
            fontWeight: 700,
            fontSize: 14,
            borderRadius: 999,
            border: 'none',
            cursor: canCompute ? 'pointer' : 'not-allowed',
            opacity: canCompute ? 1 : 0.6,
          }}
        >
          <Landmark size={17} aria-hidden />
          {t('computeCta')}
        </button>
        {receives.length === 0 && (
          <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--wa-accent)', fontWeight: 600 }}>{t('pickOneProgram')}</p>
        )}
      </form>

      {/* ── Result ── */}
      {result && verdictMeta && (
        <div className="wa-kit-card" aria-live="polite">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              padding: '0.85rem 1rem',
              borderRadius: 'var(--wa-radius-sm)',
              background: `color-mix(in srgb, ${colorVar(verdictMeta.color)} 10%, transparent)`,
              marginBottom: '0.9rem',
            }}
          >
            <verdictMeta.icon size={26} color={colorVar(verdictMeta.color)} aria-hidden />
            <div>
              <p style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: 'var(--wa-text)' }}>{verdictMeta.title}</p>
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.85rem', fontWeight: 700, color: colorVar(verdictMeta.color) }}>
                {t('netChangeLine', { amount: money(result.netChangeMonthly) })}
              </p>
            </div>
          </div>

          {/* Plain-language explanation (deterministic, no AI) */}
          <p style={{ margin: '0 0 0.9rem', fontSize: '0.88rem', lineHeight: 1.55, color: 'var(--wa-muted)' }}>
            {t('explainLine', {
              earnings: money(result.earningsChangeMonthly),
              benefits: money(result.benefitsChangeMonthly),
            })}
          </p>

          {/* Per-program breakdown */}
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '0.5rem' }}>
            {result.programs.map((p) => {
              const label = t(PROGRAM_OPTIONS.find((o) => o.id === p.programId)!.labelKey);
              return (
                <li
                  key={p.programId}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.6rem 0.8rem',
                    borderRadius: 'var(--wa-radius-sm)',
                    border: '1px solid var(--wa-border)',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: 'var(--wa-text)' }}>{label}</p>
                    {p.losesEligibility && (
                      <p style={{ margin: '0.15rem 0 0', fontSize: '0.8125rem', fontWeight: 700, color: 'var(--wa-accent)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <AlertTriangle size={13} aria-hidden />
                        {p.kind === 'coverage' ? t('mayLoseCoverage') : t('mayLoseBenefit')}
                      </p>
                    )}
                  </div>
                  {p.kind === 'coverage' ? (
                    <StatusTag tone={p.losesEligibility ? 'alert' : 'ok'}>
                      {p.losesEligibility ? t('coverageAtRisk') : t('coverageKept')}
                    </StatusTag>
                  ) : (
                    <span
                      style={{
                        fontSize: '0.88rem',
                        fontWeight: 800,
                        whiteSpace: 'nowrap',
                        fontVariantNumeric: 'tabular-nums',
                        color: p.changeMonthly < 0 ? 'var(--wa-accent)' : 'var(--wa-success)',
                      }}
                    >
                      {t('perMonth', { amount: money(p.changeMonthly) })}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

          {result.losesHealthCoverage && (
            <p style={{ margin: '0.9rem 0 0', fontSize: '0.82rem', lineHeight: 1.5, color: 'var(--wa-muted)' }}>
              {t('coverageNote')}
            </p>
          )}

          {/* Counselor follow-up CTA */}
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <Link
              href="/dashboard/messages"
              className={btnFocusClass}
              style={{
                minHeight: 48,
                flex: '1 1 220px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                background: 'var(--wa-accent)',
                color: 'var(--wa-on-accent)',
                fontWeight: 700,
                fontSize: 14,
                borderRadius: 999,
                textDecoration: 'none',
              }}
            >
              <Headset size={17} aria-hidden />
              {t('counselorCta')}
            </Link>
          </div>
          <p style={{ margin: '0.75rem 0 0', fontSize: '0.8125rem', lineHeight: 1.5, color: 'var(--wa-muted)' }}>
            {t('counselorNote')}
          </p>
        </div>
      )}

      {/* ── Sources ── */}
      <details className="wa-kit-card wa-kit-card--sm">
        <summary style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--wa-text)', cursor: 'pointer' }}>
          {t('sourcesTitle', { version: BENEFITS_CLIFF_RULES_VERSION })}
        </summary>
        <ul style={{ margin: '0.6rem 0 0', paddingLeft: '1.1rem', display: 'grid', gap: '0.35rem' }}>
          {ALL_CLIFF_SOURCES.map((s) => (
            <li key={s.url + s.program} style={{ fontSize: '0.8125rem', lineHeight: 1.45, color: 'var(--wa-muted)' }}>
              <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline' }}>
                {s.program}
              </a>{' '}
              — {s.publisher}, {s.year}. {t('lastVerified', { date: s.lastVerified })}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
