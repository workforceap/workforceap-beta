'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { resolvePortalReturnTo } from '@/lib/nav/returnContext';
import SuggestedProgramsRanked from '@/components/employer/SuggestedProgramsRanked';
import { trackFunnelEvent } from '@/lib/analytics/events';
import { EMPLOYER_JOB_SUBMIT_REVIEW_DRAFT_FLASH } from '@/lib/employer/employerJobFormFlash';
import { jobExpiryDateInput, jobExpiryInstant } from '@/lib/employer/jobExpiryInstant';

type JobProvenance = {
  sourceUrl?: string | null;
  importProvider?: string | null;
  importMethod?: string | null;
};

type JobFormProps = {
  job?: {
    id: string;
    title: string;
    location?: string | null;
    locationType: string;
    jobType: string;
    salaryMin?: number | null;
    salaryMax?: number | null;
    description: string;
    requirements: string[];
    preferredCertifications: string[];
    suggestedPrograms: string[];
    status: string;
    expiresAt?: string | null;
  } & JobProvenance;
  initialData?: Partial<{
    title: string;
    location: string;
    locationType: string;
    jobType: string;
    salaryMin: number;
    salaryMax: number;
    description: string;
    requirements: string[];
    preferredCertifications: string[];
    suggestedPrograms: string[];
    sourceUrl: string;
    importProvider: string;
    importMethod: string;
    expiresAt: string;
  }>;
  companyName: string;
  programSlugs: string[];
  isImportReview?: boolean;
};

type FieldErrors = Partial<
  Record<'title' | 'location' | 'salaryMin' | 'salaryMax' | 'description' | 'requirements' | 'suggestedPrograms', string>
>;

function formatImportMethod(importMethod?: string | null) {
  if (!importMethod) return null;
  return importMethod
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export default function JobForm({ job, initialData, companyName, programSlugs, isImportReview }: JobFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const clearFieldError = (name: keyof FieldErrors) => {
    setFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const isEdit = !!job && !!job.id;
  const prefill = job ?? initialData;
  const provenance = {
    sourceUrl: prefill?.sourceUrl ?? null,
    importProvider: prefill?.importProvider ?? null,
    importMethod: prefill?.importMethod ?? null,
  };
  const hasProvenance = !!(provenance.sourceUrl || provenance.importProvider || provenance.importMethod);

  const importEmpty = isImportReview
    ? {
        location: !prefill?.location,
        salary: prefill?.salaryMin == null && prefill?.salaryMax == null,
        requirements: (prefill?.requirements?.length ?? 0) < 2,
        certs: (prefill?.preferredCertifications?.length ?? 0) === 0,
      }
    : null;

  const initialHaystack = [prefill?.title, prefill?.description, ...(prefill?.requirements ?? [])]
    .filter(Boolean)
    .join(' ');

  const defaultPrograms = prefill?.suggestedPrograms ?? [];

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    const requirements = String(formData.get('requirements') || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const certs = String(formData.get('preferredCertifications') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const programs = Array.from(formData.getAll('suggestedPrograms') as string[]);

    const submitForReview = !!formData.get('submitForReview') || !!formData.get('resubmitForReview');
    const salaryMin = formData.get('salaryMin') ? parseInt(String(formData.get('salaryMin')), 10) : null;
    const salaryMax = formData.get('salaryMax') ? parseInt(String(formData.get('salaryMax')), 10) : null;
    const expiresAtRaw = formData.get('expiresAt') as string;
    // End of the chosen day in Central time, so the board hides the job
    // *after* that date (as the hint promises) rather than the evening before.
    const expiresAt = jobExpiryInstant(expiresAtRaw);
    const payload = {
      title: String(formData.get('title') || '').trim(),
      location: String(formData.get('location') || '').trim() || undefined,
      locationType: (formData.get('locationType') as string) || 'onsite',
      jobType: (formData.get('jobType') as string) || 'fulltime',
      salaryMin,
      salaryMax,
      description: String(formData.get('description') || '').trim(),
      sourceUrl: provenance.sourceUrl ?? undefined,
      importProvider: provenance.importProvider ?? undefined,
      importMethod: provenance.importMethod ?? undefined,
      requirements,
      preferredCertifications: certs,
      suggestedPrograms: programs,
      status: submitForReview ? 'pending' : 'draft',
      expiresAt,
    };

    const nextFieldErrors: FieldErrors = {};
    if (!payload.title) nextFieldErrors.title = 'Add a job title.';
    if (!payload.description) nextFieldErrors.description = 'Add a job description.';
    if (salaryMin != null && salaryMax != null && salaryMax < salaryMin) {
      nextFieldErrors.salaryMax = 'Salary max must be greater than or equal to salary min.';
    }
    if (submitForReview) {
      if (!payload.location) nextFieldErrors.location = 'Add where people work before submitting for review.';
      if (requirements.length < 2) nextFieldErrors.requirements = 'Add at least 2 requirement lines before submitting for review.';
      if (payload.salaryMin == null && payload.salaryMax == null) {
        nextFieldErrors.salaryMin = 'Add a salary range (min and/or max) before submitting for review.';
      }
      if (payload.description.length < 140) {
        nextFieldErrors.description = 'Expand the job description (about 140+ characters) before submitting for review.';
      }
      if (programs.length < 1) {
        nextFieldErrors.suggestedPrograms = 'Select at least one training match before submitting for review.';
      }
    }

    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) {
      trackFunnelEvent('employer_job_review', 'validation_blocked', {
        is_edit: isEdit,
        submit_for_review: submitForReview,
        error_fields: Object.keys(nextFieldErrors),
      });
      setErrorMsg('Please fix the highlighted fields.');
      setStatus('error');
      // Move focus to the first invalid field so keyboard and screen-reader
      // users land on the problem instead of hunting for it (WCAG focus management).
      requestAnimationFrame(() => {
        formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
      return;
    }

    setStatus('saving');
    setErrorMsg(null);

    try {
      const url = isEdit ? `/api/employer/jobs/${job.id}` : '/api/employer/jobs';
      const method = isEdit ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        trackFunnelEvent('employer_job_review', 'save_failed', {
          is_edit: isEdit,
          submit_for_review: submitForReview,
          status: payload.status,
        });
        setStatus('error');
        setErrorMsg(data.error ?? 'Failed to save');
        return;
      }

      const saved = data as { status?: string };
      if (submitForReview && saved.status === 'draft') {
        try {
          sessionStorage.setItem(
            EMPLOYER_JOB_SUBMIT_REVIEW_DRAFT_FLASH,
            JSON.stringify({
              title: payload.title,
              reasons: [
                !payload.location ? 'work location' : null,
                requirements.length < 2 ? 'at least two requirement lines' : null,
                payload.salaryMin == null && payload.salaryMax == null ? 'salary range' : null,
                payload.description.length < 140 ? 'a fuller job description' : null,
                programs.length < 1 ? 'at least one training track match' : null,
              ].filter(Boolean),
            })
          );
        } catch {
          /* ignore */
        }
      }

      trackFunnelEvent('employer_job_review', submitForReview ? 'submit_for_review' : 'draft_saved', {
        is_edit: isEdit,
        status: payload.status,
        is_import_review: !!isImportReview,
        suggested_programs_count: programs.length,
      });
      router.push(resolvePortalReturnTo(new URLSearchParams(window.location.search).get('returnTo'), '/employer/jobs'));
      router.refresh();
    } catch {
      trackFunnelEvent('employer_job_review', 'network_error', {
        is_edit: isEdit,
        submit_for_review: submitForReview,
      });
      setStatus('error');
      setErrorMsg('Network error');
    }
  }

  const fieldErrorId = (name: keyof FieldErrors) => `job-form-error-${name}`;

  return (
    <form ref={formRef} className="employer-job-form" onSubmit={handleSubmit} noValidate>
      {status === 'error' && errorMsg && (
        <div className="employer-job-form-error" role="alert">
          {errorMsg}
        </div>
      )}

      {hasProvenance && (
        <section className="employer-job-form-provenance" aria-label="Import source details">
          <p className="employer-job-form-provenance__eyebrow">Imported draft</p>
          <dl className="employer-job-form-provenance__grid">
            {provenance.importProvider && (
              <>
                <dt>Provider</dt>
                <dd>{provenance.importProvider}</dd>
              </>
            )}
            {provenance.importMethod && (
              <>
                <dt>Method</dt>
                <dd>{formatImportMethod(provenance.importMethod)}</dd>
              </>
            )}
            {provenance.sourceUrl && (
              <>
                <dt>Source</dt>
                <dd>
                  <a href={provenance.sourceUrl} target="_blank" rel="noreferrer">
                    {provenance.sourceUrl}
                  </a>
                </dd>
              </>
            )}
          </dl>
          <p className="employer-job-form-provenance__note">
            Traceability stays here for admins and employers. It will not be mixed into the posting body.
          </p>
        </section>
      )}

      <div className="form-group">
        <label htmlFor="job-title">Job Title *</label>
        <input
          id="job-title"
          type="text"
          name="title"
          required
          defaultValue={prefill?.title}
          disabled={status === 'saving'}
          aria-invalid={!!fieldErrors.title}
          aria-describedby={fieldErrors.title ? fieldErrorId('title') : undefined}
          onInput={() => clearFieldError('title')}
        />
        {fieldErrors.title ? <p id={fieldErrorId('title')} className="form-error">{fieldErrors.title}</p> : null}
      </div>

      <div className="form-group">
        <label htmlFor="company-name">Company Name</label>
        <input id="company-name" type="text" value={companyName} readOnly disabled className="employer-job-form-readonly" />
      </div>

      <div id="job-form-target-location" className="form-group">
        <label htmlFor="job-location">Location (City, State or Remote)</label>
        <input
          id="job-location"
          type="text"
          name="location"
          placeholder="e.g. Austin, TX or Remote"
          defaultValue={prefill?.location ?? ''}
          disabled={status === 'saving'}
          aria-invalid={!!fieldErrors.location}
          aria-describedby={fieldErrors.location ? fieldErrorId('location') : undefined}
          onInput={() => clearFieldError('location')}
        />
        {fieldErrors.location ? <p id={fieldErrorId('location')} className="form-error">{fieldErrors.location}</p> : null}
        {importEmpty?.location && <p className="employer-job-form-import-hint">Not detected — add where people work so candidates can filter.</p>}
      </div>

      <div className="form-group">
        <label htmlFor="job-location-type">Location Type</label>
        <select id="job-location-type" name="locationType" defaultValue={prefill?.locationType ?? 'onsite'} disabled={status === 'saving'}>
          <option value="remote">Remote</option>
          <option value="hybrid">Hybrid</option>
          <option value="onsite">On-site</option>
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="job-type">Job Type</label>
        <select id="job-type" name="jobType" defaultValue={prefill?.jobType ?? 'fulltime'} disabled={status === 'saving'}>
          <option value="fulltime">Full-time</option>
          <option value="parttime">Part-time</option>
          <option value="contract">Contract</option>
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="job-expires-at">Expires At (optional)</label>
        <input
          id="job-expires-at"
          type="date"
          name="expiresAt"
          defaultValue={jobExpiryDateInput(prefill?.expiresAt)}
          disabled={status === 'saving'}
        />
        <p className="form-hint">If set, the job will be hidden from the public board after this date.</p>
      </div>

      <div id="job-form-target-salary" className="employer-job-form-salary-grid">
        <div className="form-group">
          <label htmlFor="salary-min">Salary Min (optional)</label>
          <input
            id="salary-min"
            type="number"
            name="salaryMin"
            placeholder="50000"
            defaultValue={prefill?.salaryMin ?? ''}
            disabled={status === 'saving'}
            aria-invalid={!!fieldErrors.salaryMin}
            aria-describedby={fieldErrors.salaryMin ? fieldErrorId('salaryMin') : undefined}
            onInput={() => {
              clearFieldError('salaryMin');
              clearFieldError('salaryMax');
            }}
          />
          {fieldErrors.salaryMin ? <p id={fieldErrorId('salaryMin')} className="form-error">{fieldErrors.salaryMin}</p> : null}
        </div>
        <div className="form-group">
          <label htmlFor="salary-max">Salary Max (optional)</label>
          <input
            id="salary-max"
            type="number"
            name="salaryMax"
            placeholder="70000"
            defaultValue={prefill?.salaryMax ?? ''}
            disabled={status === 'saving'}
            aria-invalid={!!fieldErrors.salaryMax}
            aria-describedby={fieldErrors.salaryMax ? fieldErrorId('salaryMax') : undefined}
            onInput={() => {
              clearFieldError('salaryMin');
              clearFieldError('salaryMax');
            }}
          />
          {fieldErrors.salaryMax ? <p id={fieldErrorId('salaryMax')} className="form-error">{fieldErrors.salaryMax}</p> : null}
        </div>
      </div>
      {importEmpty?.salary && <p className="employer-job-form-import-hint">No pay range detected — adding one helps candidates decide faster.</p>}

      <div id="job-form-target-description" className="form-group">
        <label htmlFor="job-description">Job Description *</label>
        <textarea
          id="job-description"
          name="description"
          rows={8}
          required
          defaultValue={prefill?.description}
          disabled={status === 'saving'}
          aria-invalid={!!fieldErrors.description}
          aria-describedby={fieldErrors.description ? fieldErrorId('description') : undefined}
          onInput={() => clearFieldError('description')}
        />
        {fieldErrors.description ? <p id={fieldErrorId('description')} className="form-error">{fieldErrors.description}</p> : null}
      </div>

      <div id="job-form-target-requirements" className="form-group">
        <label htmlFor="job-requirements">Requirements (one per line)</label>
        <textarea
          id="job-requirements"
          name="requirements"
          rows={4}
          placeholder="2+ years experience&#10;Bachelor's degree&#10;Proficiency in Python"
          defaultValue={prefill?.requirements?.join('\n') ?? ''}
          disabled={status === 'saving'}
          aria-invalid={!!fieldErrors.requirements}
          aria-describedby={fieldErrors.requirements ? fieldErrorId('requirements') : undefined}
          onInput={() => clearFieldError('requirements')}
        />
        {fieldErrors.requirements ? <p id={fieldErrorId('requirements')} className="form-error">{fieldErrors.requirements}</p> : null}
        {importEmpty?.requirements && <p className="employer-job-form-import-hint">Fewer than 2 requirements detected — add the must-haves for this role.</p>}
      </div>

      <div className="form-group">
        <label htmlFor="job-certs">Preferred Certificates (comma-separated)</label>
        <input id="job-certs" type="text" name="preferredCertifications" placeholder="CompTIA A+, AWS Certified" defaultValue={prefill?.preferredCertifications?.join(', ') ?? ''} disabled={status === 'saving'} />
      </div>

      {programSlugs.length > 0 && (
        <div
          onChange={() => clearFieldError('suggestedPrograms')}
        >
          <SuggestedProgramsRanked
            fieldsetId="job-form-target-suggested-programs"
            formRef={formRef}
            programSlugs={programSlugs}
            defaultSelected={defaultPrograms}
            initialHaystack={initialHaystack}
            disabled={status === 'saving'}
          />
        </div>
      )}
      {fieldErrors.suggestedPrograms ? (
        <p id={fieldErrorId('suggestedPrograms')} className="form-error" role="alert">
          {fieldErrors.suggestedPrograms}
        </p>
      ) : null}

      <div className="employer-job-form-actions">
        <button type="submit" className="btn btn-primary" disabled={status === 'saving'} aria-busy={status === 'saving'}>
          <span aria-live="polite">{status === 'saving' ? 'Saving…' : 'Save as Draft'}</span>
        </button>
        {(!isEdit || (job && job.status === 'draft')) && (
          <button type="submit" name="submitForReview" value="1" className="btn btn-accent" disabled={status === 'saving'} aria-busy={status === 'saving'}>
            Submit for Review
          </button>
        )}
        {job && job.status === 'closed' && (
          <button type="submit" name="resubmitForReview" value="1" className="btn btn-accent" disabled={status === 'saving'} aria-busy={status === 'saving'}>
            Resubmit for Review
          </button>
        )}
      </div>
    </form>
  );
}
