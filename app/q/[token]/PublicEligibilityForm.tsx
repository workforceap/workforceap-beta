'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';
import { normalizePrimaryBarriers, PRIMARY_BARRIER_OPTIONS } from '@/lib/apply/primaryBarrierOptions';
import HearAboutSelect from '@/components/apply/HearAboutSelect';
import {
  hearAboutNeedsOther,
  layoffCompanyApplicable,
  type YesNo,
} from '@/lib/apply/eligibilityExtendedFields';
import { isValidPostalCode } from '@/lib/validation/postalCode';
import {
  PUBLIC_ASSISTANCE_PROGRAM_LABELS,
  PUBLIC_ASSISTANCE_PROGRAM_VALUES,
  normalizePublicAssistancePrograms,
  publicAssistanceFollowUpComplete,
  type PublicAssistanceProgram,
} from '@/lib/apply/publicAssistance';

// Option values copied EXACTLY from app/apply/ApplyEligibilityClient.tsx so the
// public no-account form writes the same canonical values the rest of the app
// reads (PRIMARY_BARRIERS includes seeking_skills_training).
const AGE_GROUPS = [
  { value: '18_24', label: '18–24' },
  { value: '25_50', label: '25–50' },
  { value: '50_plus', label: '50+' },
] as const;

export type PublicEligibilityPrefill = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  ageGroup: string;
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

const fieldGroup: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.35rem' };
const labelStyle: React.CSSProperties = { fontWeight: 600, fontSize: '0.9rem' };
const inputStyle: React.CSSProperties = {
  padding: '0.6rem 0.7rem',
  borderRadius: '0.45rem',
  border: '1px solid var(--outline-variant)',
  fontSize: '1rem',
};

function YesNoGroup({
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
    <fieldset style={{ ...fieldGroup, border: 'none', padding: 0, margin: 0 }}>
      <legend style={labelStyle}>{label} *</legend>
      <div role="radiogroup" style={{ display: 'flex', gap: '0.75rem', marginTop: '0.35rem' }}>
        {(['yes', 'no'] as const).map((opt) => (
          <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <input
              type="radio"
              name={name}
              value={opt}
              checked={value === opt}
              onChange={() => onChange(opt)}
              required
            />
            {opt === 'yes' ? 'Yes' : 'No'}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export default function PublicEligibilityForm({
  token,
  prefill,
}: {
  token: string;
  prefill: PublicEligibilityPrefill;
}) {
  const tCommon = useTranslations('common');
  const [firstName, setFirstName] = useState(prefill.firstName);
  const [lastName, setLastName] = useState(prefill.lastName);
  const [phone, setPhone] = useState(prefill.phone);
  const [email, setEmail] = useState(prefill.email);
  const [ageGroup, setAgeGroup] = useState(prefill.ageGroup);
  const [city, setCity] = useState(prefill.city);
  const [stateVal, setStateVal] = useState(prefill.state);
  const [zip, setZip] = useState(prefill.zip);
  const [county, setCounty] = useState(prefill.county);
  const [primaryBarriers, setPrimaryBarriers] = useState<string[]>(
    normalizePrimaryBarriers(prefill.primaryBarriers),
  );
  const [q1, setQ1] = useState<YesNo | null>(prefill.q1 ?? null);
  const [q2, setQ2] = useState<YesNo | null>(prefill.q2 ?? null);
  const [q3, setQ3] = useState<YesNo | null>(prefill.q3 ?? null);
  const [receivingUnemployment, setReceivingUnemployment] = useState<YesNo | null>(
    prefill.receivingUnemployment ?? null,
  );
  const [exhaustedUnemployment, setExhaustedUnemployment] = useState<YesNo | null>(
    prefill.exhaustedUnemployment ?? null,
  );
  const [layoffCompany, setLayoffCompany] = useState(prefill.layoffCompany ?? '');
  const [snapWic, setSnapWic] = useState<YesNo | null>(prefill.snapWic ?? null);
  const [publicAssistancePrograms, setPublicAssistancePrograms] = useState<PublicAssistanceProgram[]>(
    normalizePublicAssistancePrograms(prefill.publicAssistancePrograms),
  );
  const [publicAssistanceHelpRequested, setPublicAssistanceHelpRequested] = useState<YesNo | null>(
    prefill.publicAssistanceHelpRequested ?? null,
  );
  const [hearAbout, setHearAbout] = useState(prefill.hearAbout ?? '');
  const [hearAboutOther, setHearAboutOther] = useState(prefill.hearAboutOther ?? '');
  const [partnerAmbassadorReferral, setPartnerAmbassadorReferral] = useState(
    prefill.partnerAmbassadorReferral ?? '',
  );

  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const toggleBarrier = (v: string) =>
    setPrimaryBarriers((cur) =>
      normalizePrimaryBarriers(cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v])
    );

  const zipOk = isValidPostalCode(zip);
  const showLayoff = layoffCompanyApplicable({
    unemployedOrUnderemployed: q1,
    receivingUnemployment,
    exhaustedUnemployment,
  });
  const fundingOk =
    q1 !== null &&
    q2 !== null &&
    q3 !== null &&
    receivingUnemployment !== null &&
    exhaustedUnemployment !== null &&
    snapWic !== null &&
    publicAssistanceFollowUpComplete({ snapWic, publicAssistancePrograms, publicAssistanceHelpRequested });
  const toggleProgram = (program: PublicAssistanceProgram) =>
    setPublicAssistancePrograms((current) =>
      normalizePublicAssistancePrograms(
        current.includes(program) ? current.filter((item) => item !== program) : [...current, program],
      ),
    );
  const canSubmit =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    !!ageGroup &&
    city.trim().length > 0 &&
    stateVal.trim().length > 0 &&
    zipOk &&
    county.trim().length > 0 &&
    primaryBarriers.length > 0 &&
    hearAbout.trim().length > 0 &&
    (!hearAboutNeedsOther(hearAbout) || hearAboutOther.trim().length > 0) &&
    fundingOk &&
    status !== 'submitting';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus('submitting');
    setErrorMsg('');
    try {
      const res = await fetch(`/api/q/${encodeURIComponent(token)}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          email: email.trim(),
          ageGroup,
          city: city.trim(),
          state: stateVal.trim(),
          zip: zip.trim(),
          county: county.trim(),
          primaryBarriers,
          q1,
          q2,
          q3,
          receivingUnemployment,
          exhaustedUnemployment,
          layoffCompany: layoffCompany.trim() || null,
          snapWic,
          publicAssistancePrograms: snapWic === 'yes' ? publicAssistancePrograms : [],
          publicAssistanceHelpRequested: snapWic === 'yes' ? publicAssistanceHelpRequested : null,
          hearAbout: hearAbout.trim(),
          hearAboutOther: hearAboutNeedsOther(hearAbout) ? hearAboutOther.trim() || null : null,
          partnerAmbassadorReferral: partnerAmbassadorReferral.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? 'We could not save your answers. Please try again.');
      }
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setErrorMsg(requestFailureMessage(err, { connection: tCommon('connectionError'), fallback: 'We could not save your answers. Please try again.' }, 'public-eligibility'));
    }
  };

  if (status === 'done') {
    return (
      <div
        role="status"
        style={{
          border: '1px solid var(--color-green, #15803d)',
          borderRadius: '0.75rem',
          padding: '2rem',
          textAlign: 'center',
          background: 'rgba(21, 128, 61, 0.06)',
        }}
      >
        <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.3rem' }}>Thank you!</h2>
        <p style={{ margin: 0, lineHeight: 1.6 }}>
          Your eligibility information has been submitted. A WorkforceAP advisor will follow up with
          you about next steps.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
      <div style={fieldGroup}>
        <label style={labelStyle} htmlFor="q-first-name">First name *</label>
        <input id="q-first-name" style={inputStyle} value={firstName} autoComplete="given-name" onChange={(e) => setFirstName(e.target.value)} required />
      </div>
      <div style={fieldGroup}>
        <label style={labelStyle} htmlFor="q-last-name">Last name *</label>
        <input id="q-last-name" style={inputStyle} value={lastName} autoComplete="family-name" onChange={(e) => setLastName(e.target.value)} required />
      </div>
      <div style={fieldGroup}>
        <label style={labelStyle} htmlFor="q-email">Email</label>
        <input id="q-email" type="email" style={inputStyle} value={email} autoComplete="email" onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div style={fieldGroup}>
        <label style={labelStyle} htmlFor="q-phone">Phone</label>
        <input id="q-phone" type="tel" style={inputStyle} value={phone} autoComplete="tel" placeholder="(512) 555-0100" onChange={(e) => setPhone(e.target.value)} />
      </div>

      <YesNoGroup
        name="q1"
        label="Unemployed / underemployed?"
        value={q1}
        onChange={setQ1}
      />
      <YesNoGroup
        name="receivingUnemployment"
        label="Currently receiving unemployment benefits?"
        value={receivingUnemployment}
        onChange={setReceivingUnemployment}
      />
      <YesNoGroup
        name="exhaustedUnemployment"
        label="Exhausted unemployment benefits?"
        value={exhaustedUnemployment}
        onChange={setExhaustedUnemployment}
      />
      {showLayoff ? (
        <div style={fieldGroup}>
          <label style={labelStyle} htmlFor="q-layoff">What company did you get laid off from, or last work for?</label>
          <input id="q-layoff" style={inputStyle} value={layoffCompany} maxLength={200} onChange={(e) => setLayoffCompany(e.target.value)} />
        </div>
      ) : null}
      <YesNoGroup name="q2" label="Household income below $60,000?" value={q2} onChange={setQ2} />
      <YesNoGroup name="snapWic" label="Receiving TANF, WIC, and/or Food stamps (SNAP)?" value={snapWic} onChange={setSnapWic} />
      {snapWic === 'yes' ? (
        <>
          <fieldset style={{ ...fieldGroup, border: 'none', padding: 0, margin: 0 }}>
            <legend style={labelStyle}>Which of these do you receive? Check all that apply *</legend>
            <div role="group" aria-label="Benefits received" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.35rem' }}>
              {PUBLIC_ASSISTANCE_PROGRAM_VALUES.map((program) => (
                <label key={program} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minHeight: '44px' }}>
                  <input
                    type="checkbox"
                    name="publicAssistancePrograms"
                    value={program}
                    checked={publicAssistancePrograms.includes(program)}
                    onChange={() => toggleProgram(program)}
                  />
                  {PUBLIC_ASSISTANCE_PROGRAM_LABELS[program]}
                </label>
              ))}
            </div>
          </fieldset>
          <YesNoGroup
            name="publicAssistanceHelpRequested"
            label="Would you like help applying for these or other benefits?"
            value={publicAssistanceHelpRequested}
            onChange={setPublicAssistanceHelpRequested}
          />
        </>
      ) : null}
      <YesNoGroup name="q3" label="Authorized to work in the U.S.?" value={q3} onChange={setQ3} />

      <div style={fieldGroup}>
        <label style={labelStyle} htmlFor="q-age-group">Age group *</label>
        <select id="q-age-group" style={inputStyle} value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)} required>
          <option value="">Select age group</option>
          {AGE_GROUPS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div style={fieldGroup}>
        <label style={labelStyle} htmlFor="q-city">City *</label>
        <input id="q-city" style={inputStyle} value={city} autoComplete="address-level2" onChange={(e) => setCity(e.target.value)} required />
      </div>
      <div style={fieldGroup}>
        <label style={labelStyle} htmlFor="q-state">State *</label>
        <input id="q-state" style={inputStyle} value={stateVal} autoComplete="address-level1" maxLength={50} onChange={(e) => setStateVal(e.target.value)} required />
      </div>
      <div style={fieldGroup}>
        <label style={labelStyle} htmlFor="q-zip">ZIP code *</label>
        <input id="q-zip" style={inputStyle} value={zip} autoComplete="postal-code" inputMode="text" onChange={(e) => setZip(e.target.value)} required aria-invalid={zip.length > 0 && !zipOk} />
      </div>
      <div style={fieldGroup}>
        <label style={labelStyle} htmlFor="q-county">County *</label>
        <input id="q-county" style={inputStyle} value={county} onChange={(e) => setCounty(e.target.value)} required />
      </div>

      <fieldset style={{ ...fieldGroup, border: 'none', padding: 0, margin: 0 }}>
        <legend style={labelStyle}>Primary barrier(s) — check all that apply *</legend>
        <div role="group" aria-label="Primary barriers" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.35rem' }}>
          {PRIMARY_BARRIER_OPTIONS.map((o) => (
            <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.95rem' }}>
              <input type="checkbox" value={o.value} checked={primaryBarriers.includes(o.value)} onChange={() => toggleBarrier(o.value)} />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div style={fieldGroup}>
        <label style={labelStyle} htmlFor="q-hear-about">How did you hear about WorkforceAP? *</label>
        <HearAboutSelect
          id="q-hear-about"
          style={inputStyle}
          value={hearAbout}
          onChange={setHearAbout}
          required
        />
      </div>
      {hearAboutNeedsOther(hearAbout) ? (
        <div style={fieldGroup}>
          <label style={labelStyle} htmlFor="q-hear-other">Please tell us how you heard about us *</label>
          <input id="q-hear-other" style={inputStyle} value={hearAboutOther} maxLength={200} onChange={(e) => setHearAboutOther(e.target.value)} required />
        </div>
      ) : null}
      <div style={fieldGroup}>
        <label style={labelStyle} htmlFor="q-ambassador">Partner or community ambassador referral</label>
        <input
          id="q-ambassador"
          style={inputStyle}
          value={partnerAmbassadorReferral}
          maxLength={200}
          placeholder="Ambassador name or referral code"
          onChange={(e) => setPartnerAmbassadorReferral(e.target.value)}
        />
      </div>

      {status === 'error' ? (
        <p role="alert" style={{ color: 'rgb(153,27,27)', margin: 0, fontSize: '0.9rem' }}>{errorMsg}</p>
      ) : null}

      <button
        type="submit"
        disabled={!canSubmit}
        style={{
          padding: '0.7rem 1.1rem',
          borderRadius: '0.5rem',
          border: '1px solid var(--color-accent, #ad2c4d)',
          background: canSubmit ? 'var(--color-accent, #ad2c4d)' : 'var(--outline-variant)',
          color: '#fff',
          fontWeight: 600,
          cursor: canSubmit ? 'pointer' : 'not-allowed',
        }}
      >
        {status === 'submitting' ? 'Submitting…' : 'Submit eligibility info'}
      </button>
    </form>
  );
}
