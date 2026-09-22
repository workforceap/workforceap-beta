'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';
import type { CSSProperties } from 'react';
import { JobApplicationSourceMembers } from '@/lib/jobApplications/constants';

interface JobApplicationFormProps {
  onSubmit: (data: any) => Promise<void>;
  onClose: () => void;
}

export default function JobApplicationForm({ onSubmit, onClose }: JobApplicationFormProps) {
  const titleId = useId();
  const errorId = useId();
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    role: '',
    company: '',
    appliedAt: new Date().toISOString().split('T')[0],
    source: JobApplicationSourceMembers.OTHER,
    notes: '',
    nextInterviewDate: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tCommon = useTranslations('common');

  useEffect(() => {
    firstFieldRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSubmitting, onClose]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      setError(null);

      const submitData = {
        ...formData,
        appliedAt: formData.appliedAt ? new Date(formData.appliedAt) : null,
        nextInterviewDate: formData.nextInterviewDate ? new Date(formData.nextInterviewDate) : null,
        status: 'APPLIED',
      };

      await onSubmit(submitData);
    } catch (err) {
      setError(
        requestFailureMessage(
          err,
          { connection: tCommon('connectionError'), fallback: 'An error occurred' },
          'job-application',
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const fieldClassName = "wa-w-full wa-px-3 wa-py-2 wa-rounded-lg focus-visible:wa-outline-none focus-visible:wa-ring-2 focus-visible:wa-ring-[var(--color-accent)] focus-visible:wa-ring-offset-1";
  const fieldStyle: CSSProperties = {
    border: "1px solid var(--outline-variant)",
    background: "var(--surface-container-lowest)",
    color: "var(--color-on-surface)",
  };
  const labelClassName = "wa-block wa-text-sm wa-font-bold wa-mb-2";
  const labelStyle: CSSProperties = { color: "var(--color-on-surface)" };

  return (
    <div className="wa-fixed wa-inset-0 wa-bg-black wa-bg-opacity-50 wa-flex wa-items-center wa-justify-center wa-z-50 wa-p-4" role="presentation">
      <div
        className="wa-rounded-lg wa-shadow-xl wa-max-w-md wa-w-full wa-max-h-[90vh] wa-overflow-y-auto"
        style={{ background: "var(--surface-container-low)" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {/* Header */}
        <div
          className="wa-sticky wa-top-0 wa-p-6 wa-flex wa-justify-between wa-items-center"
          style={{ background: "var(--surface-container-low)", borderBottom: "1px solid var(--outline-variant)" }}
        >
          <h2 id={titleId} className="wa-text-xl wa-font-bold" style={{ color: "var(--color-on-surface)" }}>
            Add Application
          </h2>
          <button type="button"
            onClick={onClose}
            className="wa-text-2xl wa-leading-none focus-visible:wa-outline-none focus-visible:wa-ring-2 focus-visible:wa-ring-[var(--color-accent)] focus-visible:wa-ring-offset-1"
            style={{ color: "var(--color-on-surface-variant)" }}
            aria-label="Close add application dialog"
          >
            ×
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="wa-p-6 wa-space-y-4">
          {error && (
            <div
              id={errorId}
              role="alert"
              className="wa-p-3 wa-rounded wa-text-sm"
              style={{
                background: "color-mix(in srgb, var(--color-error) 10%, transparent)",
                border: "1px solid color-mix(in srgb, var(--color-error) 25%, transparent)",
                color: "var(--color-error)",
              }}
            >
              {error}
            </div>
          )}

          <div>
            <label htmlFor="jobapplicationform-job-title-field" className={labelClassName} style={labelStyle}>
              Job Title *
            </label>
            <input id="jobapplicationform-job-title-field"
              ref={firstFieldRef}
              type="text"
              name="role"
              value={formData.role}
              onChange={handleChange}
              required
              aria-describedby={error ? errorId : undefined}
              className={fieldClassName}
              style={fieldStyle}
              placeholder="e.g., Software Engineer"
            />
          </div>

          <div>
            <label htmlFor="jobapplicationform-company-field" className={labelClassName} style={labelStyle}>
              Company *
            </label>
            <input id="jobapplicationform-company-field"
              type="text"
              name="company"
              value={formData.company}
              onChange={handleChange}
              required
              className={fieldClassName}
              style={fieldStyle}
              placeholder="e.g., Techvera"
            />
          </div>

          <div>
            <label htmlFor="jobapplicationform-date-applied-field" className={labelClassName} style={labelStyle}>
              Date Applied *
            </label>
            <input id="jobapplicationform-date-applied-field"
              type="date"
              name="appliedAt"
              value={formData.appliedAt}
              onChange={handleChange}
              required
              className={fieldClassName}
              style={fieldStyle}
            />
          </div>

          <div>
            <label htmlFor="jobapplicationform-source-field" className={labelClassName} style={labelStyle}>
              Source *
            </label>
            <select id="jobapplicationform-source-field"
              name="source"
              value={formData.source}
              onChange={handleChange}
              className={fieldClassName}
              style={fieldStyle}
            >
              <option value="INDEED">Indeed</option>
              <option value="LINKEDIN">LinkedIn</option>
              <option value="DIRECT">Direct</option>
              <option value="OTHER">Other</option>
            </select>
          </div>

          <div>
            <label htmlFor="jobapplicationform-interview-date-field" className={labelClassName} style={labelStyle}>
              Interview Date
            </label>
            <input id="jobapplicationform-interview-date-field"
              type="date"
              name="nextInterviewDate"
              value={formData.nextInterviewDate}
              onChange={handleChange}
              className={fieldClassName}
              style={fieldStyle}
            />
          </div>

          <div>
            <label htmlFor="jobapplicationform-notes-field" className={labelClassName} style={labelStyle}>
              Notes
            </label>
            <textarea id="jobapplicationform-notes-field"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              className={fieldClassName}
              style={fieldStyle}
              rows={3}
              placeholder="Any notes about this application..."
            />
          </div>

          {/* Buttons */}
          <div className="wa-flex wa-gap-3 wa-pt-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className="wa-flex-1 wa-px-4 wa-py-2 wa-text-white wa-font-medium wa-rounded-lg disabled:wa-opacity-50 disabled:wa-cursor-not-allowed wa-transition-colors focus-visible:wa-outline-none focus-visible:wa-ring-2 focus-visible:wa-ring-[var(--color-accent)] focus-visible:wa-ring-offset-1"
              style={{ background: "var(--color-accent-dark, #6b0c29)" }}
            >
              {isSubmitting ? 'Adding...' : 'Add Application'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="wa-flex-1 wa-px-4 wa-py-2 wa-font-medium wa-rounded-lg wa-transition-colors focus-visible:wa-outline-none focus-visible:wa-ring-2 focus-visible:wa-ring-[var(--color-accent)] focus-visible:wa-ring-offset-1"
              style={{ background: "var(--surface-container-high)", color: "var(--color-on-surface)" }}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
