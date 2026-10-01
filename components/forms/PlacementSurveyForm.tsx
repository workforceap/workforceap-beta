'use client';

import { marketingButtonPresets } from '@/lib/marketing/buttonClasses';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const ratingSchema = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === 'string' ? Number(v) : v))
  .refine((v) => Number.isFinite(v) && v >= 1 && v <= 5, { message: 'Pick 1 through 5' });

const salarySchema = z
  .union([z.literal(''), z.string(), z.number()])
  .transform((v) => {
    if (v === '' || v === undefined) return undefined;
    const n = typeof v === 'string' ? Number(v.replace(/[^0-9.]/g, '')) : v;
    return Number.isFinite(n) ? n : undefined;
  })
  .optional();

const surveySchema = z.object({
  jobSatisfaction: ratingSchema,
  trainingRelevance: ratingSchema,
  supportQuality: ratingSchema,
  whatHelpedMost: z.string().max(4000).optional(),
  whatCouldImprove: z.string().max(4000).optional(),
  stillEmployed: z.enum(['yes', 'no']).optional(),
  currentSalary: salarySchema,
  allowTestimonial: z.boolean().optional(),
});

type SurveyInput = z.infer<typeof surveySchema>;

const fieldStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '0.625rem 0.75rem',
  fontSize: '1rem',
  borderRadius: '8px',
  border: '1px solid #d4d4d8',
  background: '#fff',
  color: 'inherit',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '0.4rem',
  fontWeight: 600,
  fontSize: '0.95rem',
};

const blockStyle: React.CSSProperties = { marginBottom: '1.5rem' };

function RatingRow({
  name,
  register,
  error,
}: {
  name: 'jobSatisfaction' | 'trainingRelevance' | 'supportQuality';

  register: any;
  error?: string;
}) {
  const errorId = `${name}-error`;
  return (
    <div
      role="radiogroup"
      aria-labelledby={`${name}-label`}
      aria-invalid={!!error}
      aria-describedby={error ? errorId : undefined}
      style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <label key={n} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
          <input type="radio" value={n} {...register(name, { valueAsNumber: true })} /> {n}
        </label>
      ))}
      {error ? (
        <span id={errorId} role="alert" style={{ color: 'var(--wa-accent-text)', fontSize: '0.85rem', marginLeft: '0.5rem' }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

export default function PlacementSurveyForm({
  token,
  programName,
}: {
  token: string;
  programName: string | null;
}) {
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SurveyInput>({
    mode: 'onBlur',
    resolver: zodResolver(surveySchema),
  });

  const onSubmit = async (data: SurveyInput) => {
    setSubmitStatus('loading');
    setErrorMessage(null);

    try {
      const res = await fetch('/api/placement-survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          jobSatisfaction: data.jobSatisfaction,
          trainingRelevance: data.trainingRelevance,
          supportQuality: data.supportQuality,
          whatHelpedMost: data.whatHelpedMost,
          whatCouldImprove: data.whatCouldImprove,
          stillEmployed: data.stillEmployed ? data.stillEmployed === 'yes' : undefined,
          currentSalary: data.currentSalary,
          allowTestimonial: data.allowTestimonial ?? false,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setSubmitStatus('error');
        setErrorMessage(json.error ?? 'Something went wrong. Please try again.');
        return;
      }
      setSubmitStatus('success');
    } catch {
      setSubmitStatus('error');
      setErrorMessage('Network error. Please try again.');
    }
  };

  if (submitStatus === 'success') {
    return (
      <div
        style={{
          background: 'var(--color-light, #f8f5f3)',
          padding: '2rem',
          borderRadius: '12px',
          textAlign: 'center',
        }}
      >
        <h2 style={{ marginBottom: '0.75rem' }}>Thanks for sharing</h2>
        <p style={{ color: '#584144' }}>
          Your responses are saved. The team uses survey data to refine the program and report outcomes to funders — you just made the next cohort&apos;s experience better.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <div style={blockStyle}>
        <span id="jobSatisfaction-label" style={labelStyle}>
          How satisfied are you with your job? (1 = not at all, 5 = very)
        </span>
        <RatingRow name="jobSatisfaction" register={register} error={errors.jobSatisfaction?.message} />
      </div>

      <div style={blockStyle}>
        <span id="trainingRelevance-label" style={labelStyle}>
          How relevant was your training{programName ? ` (${programName})` : ''} to the work you&apos;re doing now?
        </span>
        <RatingRow name="trainingRelevance" register={register} error={errors.trainingRelevance?.message} />
      </div>

      <div style={blockStyle}>
        <span id="supportQuality-label" style={labelStyle}>How was the counselor support during the program?</span>
        <RatingRow name="supportQuality" register={register} error={errors.supportQuality?.message} />
      </div>

      <div style={blockStyle}>
        <label htmlFor="whatHelpedMost" style={labelStyle}>
          What helped you the most? (optional)
        </label>
        <textarea
          id="whatHelpedMost"
          rows={3}
          maxLength={4000}
          style={fieldStyle}
          {...register('whatHelpedMost')}
        />
      </div>

      <div style={blockStyle}>
        <label htmlFor="whatCouldImprove" style={labelStyle}>
          What could we improve for the next cohort? (optional)
        </label>
        <textarea
          id="whatCouldImprove"
          rows={3}
          maxLength={4000}
          style={fieldStyle}
          {...register('whatCouldImprove')}
        />
      </div>

      <div style={blockStyle}>
        <span id="stillEmployed-label" style={labelStyle}>Are you still employed in this role?</span>
        <div role="radiogroup" aria-labelledby="stillEmployed-label" style={{ display: 'flex', gap: '1rem' }}>
          <label style={{ cursor: 'pointer' }}>
            <input type="radio" value="yes" {...register('stillEmployed')} /> Yes
          </label>
          <label style={{ cursor: 'pointer' }}>
            <input type="radio" value="no" {...register('stillEmployed')} /> No
          </label>
        </div>
      </div>

      <div style={blockStyle}>
        <label htmlFor="currentSalary" style={labelStyle}>
          Current annual salary, if it&apos;s changed (optional)
        </label>
        <input
          id="currentSalary"
          type="text"
          inputMode="numeric"
          placeholder="e.g. 52000"
          style={fieldStyle}
          {...register('currentSalary')}
        />
      </div>

      <div style={blockStyle}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
          <input type="checkbox" {...register('allowTestimonial')} style={{ marginTop: '0.25rem' }} />
          <span style={{ fontSize: '0.95rem', lineHeight: 1.45 }}>
            You can share my responses (with my name) as a testimonial on the WorkforceAP website and in funder reports.
          </span>
        </label>
      </div>

      {errorMessage ? (
        <p role="alert" style={{ color: 'var(--wa-accent-text)', marginBottom: '1rem', fontSize: '0.95rem' }}>{errorMessage}</p>
      ) : null}

      <button
        type="submit"
        className={marketingButtonPresets.formSubmitPrimary()}
        disabled={submitStatus === 'loading'}
        aria-busy={submitStatus === 'loading'}
      >
        <span aria-live="polite">
          {submitStatus === 'loading' ? 'Submitting…' : 'Submit survey'}
        </span>
      </button>
    </form>
  );
}
