'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';
import { normalizePrimaryBarriers, PRIMARY_BARRIER_OPTIONS } from '@/lib/apply/primaryBarrierOptions';
import HearAboutSelect from '@/components/apply/HearAboutSelect';
import {
  hearAboutNeedsOther,
  layoffCompanyApplicable,
  normalizeYesNo,
  type YesNo,
} from '@/lib/apply/eligibilityExtendedFields';
import {
  PUBLIC_ASSISTANCE_PROGRAM_LABELS,
  PUBLIC_ASSISTANCE_PROGRAM_VALUES,
  normalizePublicAssistancePrograms,
  publicAssistanceFollowUpComplete,
  type PublicAssistanceProgram,
} from '@/lib/apply/publicAssistance';

// Mirror the apply flow's option lists so member-supplied data stays
// consistent with the public application (app/apply/ApplyEligibilityClient.tsx).
const AGE_GROUPS = [
  { value: '18_24', label: '18–24' },
  { value: '25_50', label: '25–50' },
  { value: '50_plus', label: '50+' },
] as const;

type AgeGroupValue = (typeof AGE_GROUPS)[number]['value'] | '';

export type EligibilityInitial = {
  ageGroup: AgeGroupValue;
  city: string;
  state: string;
  zip: string;
  county: string;
  primaryBarriers: string[];
  q1?: YesNo | null;
  q2?: YesNo | null;
  q3?: YesNo | null;
  receivingUnemployment?: YesNo | null;
  exhaustedUnemployment?: YesNo | null;
  layoffCompany?: string;
  snapWic?: YesNo | null;
  /** WAP-53 follow-ups after snapWic = yes. */
  publicAssistancePrograms?: string[] | null;
  publicAssistanceHelpRequested?: YesNo | null;
  hearAbout?: string;
  hearAboutOther?: string;
  partnerAmbassadorReferral?: string;
};

const labelStyle = {
  display: 'block',
  fontSize: '0.8125rem',
  fontWeight: 700,
  color: 'var(--color-on-surface)',
  marginBottom: '0.375rem',
} as const;

const inputStyle = {
  width: '100%',
  padding: '0.6rem 0.75rem',
  borderRadius: 'var(--radius-md, 8px)',
  border: '1px solid var(--outline-variant, rgba(0,0,0,0.18))',
  background: 'var(--surface-container-lowest)',
  color: 'var(--color-on-surface)',
  fontSize: '0.9375rem',
} as const;

function YesNoRow({
  name,
  label,
  value,
  onChange,
}: {
  name: string;
  label: string;
  value: YesNo | null;
  onChange: (v: YesNo) => void;
}) {
  return (
    <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
      <legend style={{ ...labelStyle, marginBottom: '0.5rem' }}>{label}</legend>
      <div role="radiogroup" style={{ display: 'flex', gap: '1rem' }}>
        {(['yes', 'no'] as const).map((opt) => (
          <label
            key={opt}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              minHeight: '44px',
              fontSize: '0.875rem',
              color: 'var(--color-on-surface)',
              cursor: 'pointer',
            }}
          >
            <input
              type="radio"
              name={name}
              value={opt}
              checked={value === opt}
              onChange={() => onChange(opt)}
              style={{ accentColor: 'var(--color-accent)' }}
            />
            {opt === 'yes' ? 'Yes' : 'No'}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function EligibilityForm({ initial }: { initial: EligibilityInitial }) {
  const [ageGroup, setAgeGroup] = useState<AgeGroupValue>(initial.ageGroup);
  const [city, setCity] = useState(initial.city);
  const [state, setState] = useState(initial.state);
  const [zip, setZip] = useState(initial.zip);
  const [county, setCounty] = useState(initial.county);
  const [barriers, setBarriers] = useState<string[]>(
    normalizePrimaryBarriers(initial.primaryBarriers),
  );
  const [q1, setQ1] = useState<YesNo | null>(normalizeYesNo(initial.q1));
  const [q2, setQ2] = useState<YesNo | null>(normalizeYesNo(initial.q2));
  const [q3, setQ3] = useState<YesNo | null>(normalizeYesNo(initial.q3));
  const [receivingUnemployment, setReceivingUnemployment] = useState<YesNo | null>(
    normalizeYesNo(initial.receivingUnemployment),
  );
  const [exhaustedUnemployment, setExhaustedUnemployment] = useState<YesNo | null>(
    normalizeYesNo(initial.exhaustedUnemployment),
  );
  const [layoffCompany, setLayoffCompany] = useState(initial.layoffCompany ?? '');
  const [snapWic, setSnapWic] = useState<YesNo | null>(normalizeYesNo(initial.snapWic));
  const [publicAssistancePrograms, setPublicAssistancePrograms] = useState<PublicAssistanceProgram[]>(
    normalizePublicAssistancePrograms(initial.publicAssistancePrograms),
  );
  const [publicAssistanceHelpRequested, setPublicAssistanceHelpRequested] = useState<YesNo | null>(
    normalizeYesNo(initial.publicAssistanceHelpRequested),
  );
  const [hearAbout, setHearAbout] = useState(initial.hearAbout ?? '');
  const [hearAboutOther, setHearAboutOther] = useState(initial.hearAboutOther ?? '');
  const [partnerAmbassadorReferral, setPartnerAmbassadorReferral] = useState(
    initial.partnerAmbassadorReferral ?? '',
  );
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const tCommon = useTranslations('common');
  const [hoveredBarrier, setHoveredBarrier] = useState<string | null>(null);
  const feedbackRef = useRef<HTMLSpanElement>(null);

  const showLayoff = layoffCompanyApplicable({
    unemployedOrUnderemployed: q1,
    receivingUnemployment,
    exhaustedUnemployment,
  });

  // Move focus to the save result so keyboard/screen reader users get
  // immediate confirmation instead of having to scan the page for it.
  useEffect(() => {
    if (feedback) feedbackRef.current?.focus();
  }, [feedback]);

  const toggleBarrier = (value: string) => {
    setBarriers((prev) =>
      normalizePrimaryBarriers(
        prev.includes(value) ? prev.filter((b) => b !== value) : [...prev, value]
      )
    );
  };

  const followUpComplete = publicAssistanceFollowUpComplete({
    snapWic,
    publicAssistancePrograms,
    publicAssistanceHelpRequested,
  });
  const toggleProgram = (program: PublicAssistanceProgram) =>
    setPublicAssistancePrograms((current) =>
      normalizePublicAssistancePrograms(
        current.includes(program) ? current.filter((item) => item !== program) : [...current, program],
      ),
    );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (!followUpComplete) {
      setFeedback({ ok: false, message: 'Tell us which benefits you receive and whether you want help applying.' });
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch('/api/member/eligibility', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ageGroup: ageGroup || null,
            city: city.trim() || null,
            state: state.trim() || null,
            zip: zip.trim() || null,
            county: county.trim() || null,
            primaryBarriers: barriers,
            q1,
            q2,
            q3,
            receivingUnemployment,
            exhaustedUnemployment,
            layoffCompany: layoffCompany.trim() || null,
            snapWic,
            publicAssistancePrograms: snapWic === 'yes' ? publicAssistancePrograms : [],
            publicAssistanceHelpRequested: snapWic === 'yes' ? publicAssistanceHelpRequested : null,
            hearAbout: hearAbout.trim() || null,
            hearAboutOther: hearAboutNeedsOther(hearAbout) ? hearAboutOther.trim() || null : null,
            partnerAmbassadorReferral: partnerAmbassadorReferral.trim() || null,
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? 'Could not save your info right now.');
        }
        setFeedback({ ok: true, message: 'Your eligibility info has been saved. Thank you!' });
      } catch (err) {
        setFeedback({
          ok: false,
          message: requestFailureMessage(
            err,
            { connection: tCommon('connectionError'), fallback: 'Could not save your info right now.' },
            'member-eligibility',
          ),
        });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1.25rem' }}>
      <YesNoRow name="q1" label="Unemployed / underemployed?" value={q1} onChange={setQ1} />
      <YesNoRow
        name="receivingUnemployment"
        label="Currently receiving unemployment benefits?"
        value={receivingUnemployment}
        onChange={setReceivingUnemployment}
      />
      <YesNoRow
        name="exhaustedUnemployment"
        label="Exhausted unemployment benefits?"
        value={exhaustedUnemployment}
        onChange={setExhaustedUnemployment}
      />
      {showLayoff ? (
        <div>
          <label htmlFor="elig-layoff" style={labelStyle}>
            What company did you get laid off from, or last work for?
          </label>
          <input
            id="elig-layoff"
            type="text"
            value={layoffCompany}
            onChange={(e) => setLayoffCompany(e.target.value)}
            style={inputStyle}
            maxLength={200}
          />
        </div>
      ) : null}
      <YesNoRow name="q2" label="Household income below $60,000?" value={q2} onChange={setQ2} />
      <YesNoRow name="snapWic" label="Receiving TANF, WIC, and/or Food stamps (SNAP)?" value={snapWic} onChange={setSnapWic} />
      {snapWic === 'yes' ? (
        <>
          <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
            <legend style={{ ...labelStyle, marginBottom: '0.5rem' }}>Which of these do you receive? (select all that apply)</legend>
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {PUBLIC_ASSISTANCE_PROGRAM_VALUES.map((program) => {
                const checked = publicAssistancePrograms.includes(program);
                return (
                  <label
                    key={program}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.6rem',
                      minHeight: '44px',
                      padding: '0.5rem 0.75rem',
                      borderRadius: 'var(--radius-md, 8px)',
                      border: checked
                        ? '1px solid var(--color-accent)'
                        : '1px solid var(--outline-variant, rgba(0,0,0,0.18))',
                      background: checked
                        ? 'color-mix(in srgb, var(--color-accent) 8%, transparent)'
                        : 'var(--surface-container-lowest)',
                      fontSize: '0.875rem',
                      color: 'var(--color-on-surface)',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      name="publicAssistancePrograms"
                      value={program}
                      checked={checked}
                      onChange={() => toggleProgram(program)}
                      style={{ flexShrink: 0, accentColor: 'var(--color-accent)' }}
                    />
                    <span>{PUBLIC_ASSISTANCE_PROGRAM_LABELS[program]}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <YesNoRow
            name="publicAssistanceHelpRequested"
            label="Would you like help applying for these or other benefits?"
            value={publicAssistanceHelpRequested}
            onChange={setPublicAssistanceHelpRequested}
          />
        </>
      ) : null}
      <YesNoRow name="q3" label="Authorized to work in the U.S.?" value={q3} onChange={setQ3} />

      <div>
        <label htmlFor="elig-age" style={labelStyle}>
          Age group
        </label>
        <select
          id="elig-age"
          value={ageGroup}
          onChange={(e) => setAgeGroup(e.target.value as AgeGroupValue)}
          style={inputStyle}
        >
          <option value="">Select an age group</option>
          {AGE_GROUPS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 12rem), 1fr))' }}>
        <div>
          <label htmlFor="elig-city" style={labelStyle}>
            City
          </label>
          <input id="elig-city" type="text" value={city} onChange={(e) => setCity(e.target.value)} style={inputStyle} autoComplete="address-level2" />
        </div>
        <div>
          <label htmlFor="elig-state" style={labelStyle}>
            State
          </label>
          <input id="elig-state" type="text" value={state} onChange={(e) => setState(e.target.value)} style={inputStyle} autoComplete="address-level1" />
        </div>
        <div>
          <label htmlFor="elig-zip" style={labelStyle}>
            ZIP
          </label>
          <input id="elig-zip" type="text" value={zip} onChange={(e) => setZip(e.target.value)} style={inputStyle} inputMode="numeric" autoComplete="postal-code" />
        </div>
        <div>
          <label htmlFor="elig-county" style={labelStyle}>
            County
          </label>
          <input id="elig-county" type="text" value={county} onChange={(e) => setCounty(e.target.value)} style={inputStyle} />
        </div>
      </div>

      <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
        <legend style={{ ...labelStyle, marginBottom: '0.625rem' }}>Primary barriers (select all that apply)</legend>
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {PRIMARY_BARRIER_OPTIONS.map((opt) => {
            const checked = barriers.includes(opt.value);
            const hovered = hoveredBarrier === opt.value;
            return (
              <label
                key={opt.value}
                onMouseEnter={() => setHoveredBarrier(opt.value)}
                onMouseLeave={() => setHoveredBarrier((v) => (v === opt.value ? null : v))}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.6rem',
                  minHeight: '44px',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius-md, 8px)',
                  border: checked
                    ? '1px solid var(--color-accent)'
                    : '1px solid var(--outline-variant, rgba(0,0,0,0.18))',
                  background: checked
                    ? 'color-mix(in srgb, var(--color-accent) 8%, transparent)'
                    : hovered
                      ? 'var(--surface-container-low)'
                      : 'var(--surface-container-lowest)',
                  fontSize: '0.875rem',
                  color: 'var(--color-on-surface)',
                  cursor: 'pointer',
                  transition: 'background 0.15s, border-color 0.15s',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleBarrier(opt.value)}
                  style={{ marginTop: '0.2rem', flexShrink: 0, accentColor: 'var(--color-accent)' }}
                />
                <span>{opt.label}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div>
        <label htmlFor="elig-hear" style={labelStyle}>
          How did you hear about WorkforceAP?
        </label>
        <HearAboutSelect
          id="elig-hear"
          value={hearAbout}
          onChange={setHearAbout}
          style={inputStyle}
        />
      </div>
      {hearAboutNeedsOther(hearAbout) ? (
        <div>
          <label htmlFor="elig-hear-other" style={labelStyle}>
            Please tell us how you heard about us
          </label>
          <input
            id="elig-hear-other"
            type="text"
            value={hearAboutOther}
            onChange={(e) => setHearAboutOther(e.target.value)}
            style={inputStyle}
            maxLength={200}
          />
        </div>
      ) : null}
      <div>
        <label htmlFor="elig-ambassador" style={labelStyle}>
          Partner or community ambassador referral
        </label>
        <input
          id="elig-ambassador"
          type="text"
          value={partnerAmbassadorReferral}
          onChange={(e) => setPartnerAmbassadorReferral(e.target.value)}
          style={inputStyle}
          maxLength={200}
          placeholder="Ambassador name or referral code"
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <button
          type="submit"
          disabled={isPending}
          className="btn"
          style={{
            fontWeight: 600,
            padding: '0.6rem 1.1rem',
            minHeight: '44px',
            borderRadius: '0.45rem',
            border: '1px solid var(--color-accent, #ad2c4d)',
            background: 'var(--color-accent, #ad2c4d)',
            color: 'var(--color-on-accent, #fff)',
            cursor: isPending ? 'wait' : 'pointer',
          }}
        >
          {isPending ? 'Saving…' : 'Save eligibility info'}
        </button>
        {feedback ? (
          <span
            ref={feedbackRef}
            role={feedback.ok ? 'status' : 'alert'}
            tabIndex={-1}
            style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: feedback.ok ? 'var(--color-green, #15803d)' : 'var(--color-accent)',
            }}
          >
            {feedback.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}
