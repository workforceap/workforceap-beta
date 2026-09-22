'use client';

import { useState, useId } from 'react';
import { useTranslations } from 'next-intl';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';

type SurveyClientProps = {
  userId: string;
  placementId: string;
};

type SurveyForm = {
  jobSatisfaction: number;
  trainingRelevance: number;
  supportQuality: number;
  whatHelpedMost: string;
  whatCouldImprove: string;
  stillEmployed: boolean | null;
  currentSalary: string;
  allowTestimonial: boolean;
};

function StarRating({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const [hover, setHover] = useState(0);

  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <label
        style={{
          display: 'block',
          fontSize: '0.875rem',
          fontWeight: 700,
          color: 'var(--color-on-surface)',
          marginBottom: '0.5rem',
        }}
      >
        {label}
      </label>
      <div
        role="radiogroup"
        aria-label={label}
        style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const filled = star <= (hover || value);
          return (
            <button
              key={star}
              type="button"
              role="radio"
              aria-checked={star === value}
              onMouseEnter={() => setHover(star)}
              onMouseLeave={() => setHover(0)}
              onClick={() => onChange(star)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '0.25rem',
                minWidth: '2.75rem',
                minHeight: '2.75rem',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.75rem',
                lineHeight: 1,
                color: filled ? 'var(--color-gold)' : 'var(--color-on-surface-variant)',
                transition: 'color 0.15s, transform 0.1s',
                transform: filled && hover ? 'scale(1.1)' : 'scale(1)',
              }}
              aria-label={`${star} out of 5`}
            >
              <span
                className="material-symbols-outlined"
                style={{
                  fontVariationSettings: "'FILL' 1",
                  fontSize: '1.75rem',
                }}
                aria-hidden="true"
              >
                {filled ? 'star' : 'star_border'}
              </span>
            </button>
          );
        })}
        <span
          style={{
            marginLeft: '0.5rem',
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: 'var(--color-on-surface-variant)',
            minWidth: '4rem',
          }}
        >
          {value > 0 ? `${value} / 5` : 'Select'}
        </span>
      </div>
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  required?: boolean;
}) {
  const id = useId();
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <label
        htmlFor={id}
        style={{
          display: 'block',
          fontSize: '0.875rem',
          fontWeight: 700,
          color: 'var(--color-on-surface)',
          marginBottom: '0.5rem',
        }}
      >
        {label}
        {required && (
          <span style={{ color: 'var(--color-error)', marginLeft: '0.25rem' }}>*</span>
        )}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        rows={4}
        style={{
          width: '100%',
          padding: '0.75rem',
          borderRadius: '0.625rem',
          border: '1px solid var(--outline-variant)',
          background: 'var(--surface-container-lowest)',
          color: 'var(--color-on-surface)',
          fontSize: '0.9375rem',
          lineHeight: 1.5,
          resize: 'vertical',
          fontFamily: 'inherit',
        }}
      />
    </div>
  );
}

function ToggleGroup({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <label
        style={{
          display: 'block',
          fontSize: '0.875rem',
          fontWeight: 700,
          color: 'var(--color-on-surface)',
          marginBottom: '0.5rem',
        }}
      >
        {label}
      </label>
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        {[
          { label: 'Yes', val: true },
          { label: 'No', val: false },
        ].map((opt) => {
          const active = value === opt.val;
          return (
            <button
              key={opt.label}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(opt.val)}
              style={{
                flex: 1,
                minHeight: '2.75rem',
                padding: '0.625rem 1rem',
                borderRadius: '0.5rem',
                border: active
                  ? '2px solid var(--color-accent)'
                  : '1px solid var(--outline-variant)',
                background: active
                  ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)'
                  : 'var(--surface-container-lowest)',
                color: active
                  ? 'var(--color-accent-dark)'
                  : 'var(--color-on-surface)',
                fontWeight: 700,
                fontSize: '0.9375rem',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function SurveyClient({ userId, placementId }: SurveyClientProps) {
  const salaryId = useId();
  const [form, setForm] = useState<SurveyForm>({
    jobSatisfaction: 0,
    trainingRelevance: 0,
    supportQuality: 0,
    whatHelpedMost: '',
    whatCouldImprove: '',
    stillEmployed: null,
    currentSalary: '',
    allowTestimonial: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tCommon = useTranslations('common');

  const update = <K extends keyof SurveyForm>(key: K, value: SurveyForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (form.jobSatisfaction < 1 || form.trainingRelevance < 1 || form.supportQuality < 1) {
      setError('Please rate all three categories before submitting.');
      return;
    }
    if (form.stillEmployed === null) {
      setError('Please indicate whether you are still employed.');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/placement-survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          placementId,
          jobSatisfaction: form.jobSatisfaction,
          trainingRelevance: form.trainingRelevance,
          supportQuality: form.supportQuality,
          whatHelpedMost: form.whatHelpedMost || null,
          whatCouldImprove: form.whatCouldImprove || null,
          stillEmployed: form.stillEmployed,
          currentSalary: form.currentSalary ? parseInt(form.currentSalary, 10) : null,
          allowTestimonial: form.allowTestimonial,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Submission failed. Please try again.');
      }

      setSubmitted(true);
    } catch (err) {
      setError(
        requestFailureMessage(
          err,
          { connection: tCommon('connectionError'), fallback: 'Something went wrong. Please try again.' },
          'placement-survey',
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div
        className="portal-card portal-card--flat"
        style={{ padding: '2.5rem 1.5rem', textAlign: 'center' }}
      >
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: '3rem',
            color: 'var(--color-success, #16a34a)',
            marginBottom: '0.75rem',
            display: 'block',
          }}
          aria-hidden="true"
        >
          check_circle
        </span>
        <h2
          style={{
            margin: '0 0 0.5rem',
            fontSize: '1.25rem',
            fontWeight: 800,
            color: 'var(--color-on-surface)',
          }}
        >
          Thank you!
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: '0.9375rem',
            color: 'var(--color-on-surface-variant)',
            lineHeight: 1.6,
          }}
        >
          Your feedback has been submitted. It helps us improve programs for future members.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div
        className="portal-card portal-card--flat"
        style={{ padding: '1.5rem', marginBottom: '1rem' }}
      >
        <h2
          style={{
            margin: '0 0 1.25rem',
            fontSize: '1rem',
            fontWeight: 800,
            color: 'var(--color-on-surface)',
          }}
        >
          Rate your experience
        </h2>

        <StarRating
          label="How satisfied are you with your job?"
          value={form.jobSatisfaction}
          onChange={(v) => update('jobSatisfaction', v)}
        />
        <StarRating
          label="How relevant was your training to your job?"
          value={form.trainingRelevance}
          onChange={(v) => update('trainingRelevance', v)}
        />
        <StarRating
          label="How was the quality of counselor support?"
          value={form.supportQuality}
          onChange={(v) => update('supportQuality', v)}
        />
      </div>

      <div
        className="portal-card portal-card--flat"
        style={{ padding: '1.5rem', marginBottom: '1rem' }}
      >
        <h2
          style={{
            margin: '0 0 1.25rem',
            fontSize: '1rem',
            fontWeight: 800,
            color: 'var(--color-on-surface)',
          }}
        >
          Open feedback
        </h2>

        <TextAreaField
          label="What helped you most in getting this job?"
          placeholder="e.g. resume coaching, interview practice, a specific course..."
          value={form.whatHelpedMost}
          onChange={(v) => update('whatHelpedMost', v)}
        />
        <TextAreaField
          label="What could we improve?"
          placeholder="Be honest — we read every response."
          value={form.whatCouldImprove}
          onChange={(v) => update('whatCouldImprove', v)}
        />
      </div>

      <div
        className="portal-card portal-card--flat"
        style={{ padding: '1.5rem', marginBottom: '1rem' }}
      >
        <h2
          style={{
            margin: '0 0 1.25rem',
            fontSize: '1rem',
            fontWeight: 800,
            color: 'var(--color-on-surface)',
          }}
        >
          Current status
        </h2>

        <ToggleGroup
          label="Are you still employed in this role?"
          value={form.stillEmployed}
          onChange={(v) => update('stillEmployed', v)}
        />

        <div style={{ marginBottom: '1.25rem' }}>
          <label
            htmlFor={salaryId}
            style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: 700,
              color: 'var(--color-on-surface)',
              marginBottom: '0.5rem',
            }}
          >
            Current annual salary (optional)
          </label>
          <div style={{ position: 'relative' }}>
            <span
              style={{
                position: 'absolute',
                left: '0.75rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--color-on-surface-variant)',
                fontWeight: 600,
                fontSize: '0.9375rem',
              }}
            >
              $
            </span>
            <input
              id={salaryId}
              type="number"
              min={0}
              step={1000}
              value={form.currentSalary}
              onChange={(e) => update('currentSalary', e.target.value)}
              placeholder="e.g. 45000"
              style={{
                width: '100%',
                padding: '0.75rem 0.75rem 0.75rem 1.75rem',
                borderRadius: '0.625rem',
                border: '1px solid var(--outline-variant)',
                background: 'var(--surface-container-lowest)',
                color: 'var(--color-on-surface)',
                fontSize: '0.9375rem',
                fontFamily: 'inherit',
              }}
            />
          </div>
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.625rem',
            cursor: 'pointer',
            padding: '0.75rem',
            borderRadius: '0.5rem',
            border: form.allowTestimonial
              ? '1px solid var(--color-accent)'
              : '1px solid var(--outline-variant)',
            background: form.allowTestimonial
              ? 'color-mix(in srgb, var(--color-accent) 6%, transparent)'
              : 'var(--surface-container-lowest)',
            transition: 'all 0.15s',
          }}
        >
          <input
            type="checkbox"
            checked={form.allowTestimonial}
            onChange={(e) => update('allowTestimonial', e.target.checked)}
            style={{
              width: '1.25rem',
              height: '1.25rem',
              marginTop: '0.1rem',
              accentColor: 'var(--color-accent)',
              flexShrink: 0,
            }}
          />
          <span
            style={{
              display: 'block',
              fontSize: '0.875rem',
              fontWeight: 700,
              color: 'var(--color-on-surface)',
            }}
          >
            Share my feedback as a testimonial
            <span
              style={{
                display: 'block',
                marginTop: '0.2rem',
                fontSize: '0.8125rem',
                fontWeight: 400,
                color: 'var(--color-on-surface-variant)',
                lineHeight: 1.5,
              }}
            >
              I agree that WorkforceAP may use my anonymized responses in grant
              reports and promotional materials.
            </span>
          </span>
        </label>
      </div>

      {error && (
        <div
          style={{
            padding: '0.875rem 1rem',
            borderRadius: '0.625rem',
            background: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-error) 25%, transparent)',
            color: 'var(--color-error)',
            fontSize: '0.875rem',
            fontWeight: 600,
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
          role="alert"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '1.125rem' }} aria-hidden="true">
            error
          </span>
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="btn btn-primary"
        style={{ width: '100%', justifyContent: 'center', padding: '0.875rem' }}
        aria-busy={submitting}
      >
        {submitting ? (
          <>
            <span
              className="material-symbols-outlined"
              style={{ fontSize: '1.125rem', animation: 'spin 1s linear infinite' }}
              aria-hidden="true"
            >
              progress_activity
            </span>
            Submitting…
          </>
        ) : (
          'Submit feedback'
        )}
      </button>
    </form>
  );
}
