'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import HearAboutSelect from '@/components/apply/HearAboutSelect';
import { ProgressBar } from '@/components/portal/kit';
import { hearAboutNeedsOther } from '@/lib/apply/eligibilityExtendedFields';
import { fetchWithTimeout } from '@/lib/fetchWithTimeout';
import {
  MEMBER_REQUEST_TIMEOUT_MS,
  describeMemberRequestException,
  readMemberRequestFailure,
} from '@/lib/portal/memberRequestFailure';

const EMPLOYMENT = ['Employed', 'Unemployed', 'Underemployed', 'Student'] as const;
const GOALS = ['New career', 'Promotion', 'Certification', 'Exploring options'] as const;
const HOURS = ['<5 hrs', '5-10 hrs', '10-20 hrs', '20+ hrs'] as const;

const CONTROL_CLASS = 'wa-kit-control wa-kit-focus';
const FIELD_STYLE = { display: 'grid', gap: 0 } as const;

type DraftPayload = {
  employmentStatus: string;
  primaryGoal: string;
  weeklyHours: string;
  barrier: string;
  hearAbout: string;
  hearAboutOther: string;
  workforceAssistance: 'yes' | 'no' | '';
  phone: string;
  address: string;
};

/**
 * Member pre-screening (POST /api/member/pre-screening -> `PreScreeningResponse`,
 * the row `/admin/members/interview-ready` lists). Drafts autosave through
 * /api/member/pre-screening/draft. Mounted on /dashboard/assessment once the
 * preassessment is complete (WAP-197; it used to render only in the legacy
 * home's never-shown `!homeOnly` block). Kit controls on `--wa-*` tokens.
 */
export default function MemberPreScreeningForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [employmentStatus, setEmploymentStatus] = useState<string>(EMPLOYMENT[1]);
  const [primaryGoal, setPrimaryGoal] = useState<string>(GOALS[0]);
  const [weeklyHours, setWeeklyHours] = useState<string>(HOURS[2]);
  const [barrier, setBarrier] = useState('');
  const [hearAbout, setHearAbout] = useState<string>('');
  const [hearAboutOther, setHearAboutOther] = useState('');
  const [workforceAssistance, setWorkforceAssistance] = useState<'yes' | 'no' | ''>('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [draftSaveState, setDraftSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const skipNextAutosave = useRef(true);

  const buildBody = useCallback((): DraftPayload => {
    return {
      employmentStatus,
      primaryGoal,
      weeklyHours,
      barrier,
      hearAbout,
      hearAboutOther,
      workforceAssistance,
      phone,
      address,
    };
  }, [
    employmentStatus,
    primaryGoal,
    weeklyHours,
    barrier,
    hearAbout,
    hearAboutOther,
    workforceAssistance,
    phone,
    address,
  ]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/member/pre-screening/draft');
        const data = await res.json().catch(() => ({}));
        if (cancelled || !res.ok) {
          if (!cancelled) setDraftHydrated(true);
          return;
        }
        const d = data.draft as {
          employmentStatus: string | null;
          primaryGoal: string | null;
          weeklyHours: string | null;
          barrier: string | null;
          hearAbout: string | null;
          hearAboutOther: string | null;
          workforceAssistance: boolean | null;
          phone: string | null;
          address: string | null;
        } | null;
        if (d) {
          if (d.employmentStatus && EMPLOYMENT.includes(d.employmentStatus as (typeof EMPLOYMENT)[number])) {
            setEmploymentStatus(d.employmentStatus);
          }
          if (d.primaryGoal && GOALS.includes(d.primaryGoal as (typeof GOALS)[number])) {
            setPrimaryGoal(d.primaryGoal);
          }
          if (d.weeklyHours && HOURS.includes(d.weeklyHours as (typeof HOURS)[number])) {
            setWeeklyHours(d.weeklyHours);
          }
          if (d.barrier != null) setBarrier(d.barrier);
          if (d.hearAbout) {
            setHearAbout(d.hearAbout);
          }
          if (d.hearAboutOther != null) setHearAboutOther(d.hearAboutOther);
          if (d.workforceAssistance === true) setWorkforceAssistance('yes');
          else if (d.workforceAssistance === false) setWorkforceAssistance('no');
          if (d.phone != null) setPhone(d.phone);
          if (d.address != null) setAddress(d.address);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) {
          skipNextAutosave.current = true;
          setDraftHydrated(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!draftHydrated) return;
    if (skipNextAutosave.current) {
      skipNextAutosave.current = false;
      return;
    }
    const body = buildBody();
    const t = setTimeout(async () => {
      setDraftSaveState('saving');
      try {
        const res = await fetch('/api/member/pre-screening/draft', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          setDraftSaveState('saved');
          setDraftSavedAt(new Date());
        } else {
          setDraftSaveState('error');
        }
      } catch {
        setDraftSaveState('error');
      }
    }, 550);
    return () => clearTimeout(t);
  }, [draftHydrated, buildBody]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetchWithTimeout(
        '/api/member/pre-screening',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employmentStatus,
            primaryGoal,
            weeklyHours,
            barrier: barrier.trim(),
            hearAbout,
            hearAboutOther: hearAboutNeedsOther(hearAbout) ? hearAboutOther.trim() || null : null,
            workforceAssistance: workforceAssistance === 'yes',
            phone: phone.trim(),
            address: address.trim(),
          }),
        },
        MEMBER_REQUEST_TIMEOUT_MS,
      );
      if (!res.ok) {
        setError(await readMemberRequestFailure(res));
        return;
      }
      router.refresh();
    } catch (err) {
      setError(describeMemberRequestException(err));
    } finally {
      setLoading(false);
    }
  };

  const draftHint =
    draftSaveState === 'saving'
      ? 'Saving draft…'
      : draftSaveState === 'error'
        ? 'Could not save draft. Check your connection.'
        : draftSavedAt
          ? `Draft saved ${draftSavedAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
          : 'Draft saves automatically as you type.';

  // Count completed required fields for progress indicator
  const totalFields = hearAboutNeedsOther(hearAbout) ? 9 : 8;
  const adjustedCompleted = [
    !!employmentStatus,
    !!primaryGoal,
    !!weeklyHours,
    !!barrier.trim(),
    !!hearAbout,
    hearAboutNeedsOther(hearAbout) ? !!hearAboutOther.trim() : null,
    !!phone.trim(),
    !!address.trim(),
    workforceAssistance !== '',
  ].filter((v) => v === true).length;
  const progressPct = Math.round((adjustedCompleted / totalFields) * 100);
  const isComplete = adjustedCompleted >= totalFields;

  return (
    <form onSubmit={handleSubmit} className="member-prescreen-form" style={{ display: 'grid', gap: 16 }}>
      {error && (
        <p role="alert" style={{ margin: 0, fontSize: 'var(--wa-type-body)', color: 'var(--wa-danger)', fontWeight: 600 }}>
          {error}
        </p>
      )}
      <p style={{ margin: 0, color: 'var(--wa-muted)', fontSize: 'var(--wa-type-body)', lineHeight: 1.5 }}>
        A few questions so your counselor can prepare for your interview. All fields are required to submit.
      </p>
      <div aria-live="polite" style={{ display: 'grid', gap: 6 }}>
        <div className="wa-flex wa-items-center wa-justify-between" style={{ gap: 12 }}>
          <span className="wa-kit-meta" style={{ fontWeight: 600 }}>
            {isComplete ? 'All fields complete, ready to submit' : `${adjustedCompleted} of ${totalFields} fields complete`}
          </span>
          <span className="wa-kit-meta" style={{ fontVariantNumeric: 'tabular-nums' }}>{progressPct}%</span>
        </div>
        <ProgressBar pct={progressPct} tone={isComplete ? 'ok' : undefined} aria-label="Pre-screening completion" />
      </div>
      <p className="wa-kit-meta" style={{ margin: 0 }} aria-live="polite">
        {draftHint}
      </p>
      <div style={FIELD_STYLE}>
        <label htmlFor="emp" className="wa-kit-field-label">Current employment status</label>
        <select id="emp" className={CONTROL_CLASS} value={employmentStatus} onChange={(e) => setEmploymentStatus(e.target.value)} required>
          {EMPLOYMENT.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </div>
      <div style={FIELD_STYLE}>
        <label htmlFor="goal" className="wa-kit-field-label">Primary goal</label>
        <select id="goal" className={CONTROL_CLASS} value={primaryGoal} onChange={(e) => setPrimaryGoal(e.target.value)} required>
          {GOALS.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </div>
      <div style={FIELD_STYLE}>
        <label htmlFor="hrs" className="wa-kit-field-label">Time you can commit weekly</label>
        <select id="hrs" className={CONTROL_CLASS} value={weeklyHours} onChange={(e) => setWeeklyHours(e.target.value)} required>
          {HOURS.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </div>
      <div style={FIELD_STYLE}>
        <label htmlFor="barrier" className="wa-kit-field-label">Biggest barrier right now (max 200 characters)</label>
        <textarea
          id="barrier"
          className={CONTROL_CLASS}
          rows={3}
          maxLength={200}
          value={barrier}
          onChange={(e) => setBarrier(e.target.value)}
          required
        />
      </div>
      <div style={FIELD_STYLE}>
        <label htmlFor="hear" className="wa-kit-field-label">How did you hear about us?</label>
        <HearAboutSelect id="hear" className={CONTROL_CLASS} value={hearAbout} onChange={setHearAbout} required />
      </div>
      {hearAboutNeedsOther(hearAbout) ? (
        <div style={FIELD_STYLE}>
          <label htmlFor="hearOther" className="wa-kit-field-label">Please specify</label>
          <input id="hearOther" className={CONTROL_CLASS} value={hearAboutOther} onChange={(e) => setHearAboutOther(e.target.value)} required />
        </div>
      ) : null}
      <div style={FIELD_STYLE}>
        <label htmlFor="phone" className="wa-kit-field-label">Phone number</label>
        <input id="phone" className={CONTROL_CLASS} type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required minLength={10} />
      </div>
      <div style={FIELD_STYLE}>
        <label htmlFor="addr" className="wa-kit-field-label">Physical address (street, city, state)</label>
        <input id="addr" className={CONTROL_CLASS} type="text" autoComplete="street-address" value={address} onChange={(e) => setAddress(e.target.value)} required minLength={5} />
      </div>
      <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
        <legend className="wa-kit-field-label" style={{ marginBottom: 4 }}>
          Are you currently receiving any workforce assistance?
        </legend>
        <div className="wa-flex wa-flex-wrap" style={{ gap: 16 }}>
          {(['yes', 'no'] as const).map((value) => (
            <label
              key={value}
              className="wa-flex wa-items-center"
              style={{ gap: 8, minHeight: 44, fontSize: 'var(--wa-type-body)', color: 'var(--wa-text)', cursor: 'pointer' }}
            >
              <input
                type="radio"
                name="wa"
                className="wa-kit-focus"
                checked={workforceAssistance === value}
                onChange={() => setWorkforceAssistance(value)}
                required
              />
              {value === 'yes' ? 'Yes' : 'No'}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <button
          type="submit"
          className="wa-kit-cta wa-kit-focus hover:wa-opacity-90"
          disabled={loading || workforceAssistance === ''}
          aria-busy={loading}
        >
          {loading ? 'Submitting…' : 'Submit pre-screening'}
        </button>
      </div>
    </form>
  );
}
