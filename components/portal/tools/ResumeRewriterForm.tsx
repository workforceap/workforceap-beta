'use client';

import { useState, useRef, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { Check, Copy, Upload } from 'lucide-react';
import { PortalInlineSpinner } from '@/components/portal/PortalInlineSpinner';
import { trackToolLaunch } from '@/lib/analytics/events';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { useHydrateMemberResumePlainText } from '@/hooks/useHydrateMemberResumePlainText';
import { FormField, Toggle } from '@/components/portal/kit';
import ExportPdfButton from './ExportPdfButton';
import AiToolLanguageSelector, { type AiToolLanguage } from './AiToolLanguageSelector';
import { useRetryableFetch } from '@/hooks/useRetryableFetch';
import AiToolError from './AiToolError';
import ToolFollowThrough from './ToolFollowThrough';

const SALARY_RANGES = [
  '',
  'Under $40,000',
  '$40,000 - $60,000',
  '$60,000 - $80,000',
  '$80,000 - $100,000',
  '$100,000 - $130,000',
  '$130,000+',
];

const TONES = ['professional', 'conversational', 'executive'] as const;
type Tone = (typeof TONES)[number];

const KIT_BTN =
  'wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none';

const kitBtnSolid: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  minHeight: 44,
  padding: '10px 16px',
  background: 'var(--wa-accent)',
  color: 'var(--wa-on-accent-control)',
  border: '1px solid var(--wa-accent)',
  fontWeight: 600,
  fontSize: 'var(--wa-type-body)',
  borderRadius: 999,
  cursor: 'pointer',
};

const kitBtnOutline: CSSProperties = {
  ...kitBtnSolid,
  background: 'transparent',
  color: 'var(--wa-accent)',
  border: '1px solid var(--wa-border)',
};

const FIELD_CONTROL: CSSProperties = {
  marginTop: 4,
  width: '100%',
  fontSize: 'var(--wa-type-body)',
  border: '1px solid var(--wa-border)',
  borderRadius: 'var(--wa-radius-sm)',
  padding: '10px 12px',
  outline: 'none',
  background: 'var(--wa-surface)',
  color: 'var(--wa-text)',
  fontFamily: 'inherit',
  minHeight: 44,
  boxSizing: 'border-box',
};

type ResumeRewriterFormProps = {
  initialResume?: string;
  initialJobTarget?: string;
  initialTargetSalary?: string;
  initialTargetLocation?: string;
  /** When set with onResumeChange, the resume field is controlled (e.g. profile coach Accept → append). */
  resumeControlled?: string;
  onResumeChange?: (value: string) => void;
  resumeBanner?: ReactNode;
  preview?: boolean;
  previewOutput?: string;
};

export default function ResumeRewriterForm({
  initialResume,
  initialJobTarget = '',
  initialTargetSalary = '',
  initialTargetLocation = '',
  resumeControlled,
  onResumeChange,
  resumeBanner,
  preview = false,
  previewOutput,
}: ResumeRewriterFormProps = {}) {
  const [internalResume, setInternalResume] = useState(initialResume ?? '');
  const isControlled = onResumeChange != null;
  const resume = isControlled ? (resumeControlled ?? '') : internalResume;

  const setResume = (value: string) => {
    if (isControlled) onResumeChange(value);
    else setInternalResume(value);
  };

  useHydrateMemberResumePlainText(setInternalResume, undefined, !preview && !isControlled);

  const [jobTarget, setJobTarget] = useState(initialJobTarget);
  const [targetSalary, setTargetSalary] = useState(initialTargetSalary);
  const [targetLocation, setTargetLocation] = useState(initialTargetLocation);
  const [language, setLanguage] = useState<AiToolLanguage>('en');
  const [output, setOutput] = useState(previewOutput ?? '');
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractionWarning, setExtractionWarning] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [tone, setTone] = useState<Tone>('professional');
  const [atsOptimize, setAtsOptimize] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { copy, copied } = useCopyToClipboard();
  const { execute, clearRetry, retryState } = useRetryableFetch();

  const doSubmit = async () => {
    if (preview) {
      if (previewOutput) setOutput(previewOutput);
      return;
    }
    setError('');
    setOutput('');
    setLoading(true);
    trackToolLaunch('resume-rewriter', 'Resume Rewriter');

    await execute(
      async () => {
        const res = await fetch('/api/ai/resume-rewriter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resume,
            jobTarget,
            targetSalary: targetSalary || undefined,
            targetLocation: targetLocation.trim() || undefined,
            tone,
            atsOptimize,
            language,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Something went wrong');
        return data;
      },
      (data) => setOutput(data.output ?? ''),
      (err) => setError(err),
    );

    setLoading(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (preview) {
      if (previewOutput) setOutput(previewOutput);
      return;
    }
    clearRetry();
    void doSubmit();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || preview) return;
    setError('');
    setExtractionWarning(null);
    setExtracting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/ai/extract-resume-text', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.text) {
        setResume(data.text);
        const warning = data.extractionWarning;
        setExtractionWarning(
          typeof warning === 'string' && warning.trim() ? warning.trim() : null,
        );
      } else {
        setError(data.error ?? 'Could not extract text');
      }
    } catch {
      setError('Upload failed. Try pasting instead.');
    } finally {
      setExtracting(false);
      e.target.value = '';
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <AiToolLanguageSelector value={language} onChange={setLanguage} />

      <div>
        <p className="wa-kit-field-label" style={{ marginBottom: 8 }}>
          Tone
        </p>
        <div role="group" aria-label="Tone" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {TONES.map((t) => {
            const on = tone === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTone(t)}
                disabled={loading}
                aria-pressed={on}
                className={KIT_BTN}
                style={{
                  ...(on ? kitBtnSolid : kitBtnOutline),
                  textTransform: 'capitalize',
                  opacity: loading ? 0.55 : 1,
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      <Toggle checked={atsOptimize} onChange={setAtsOptimize} label="ATS keywords" />

      <FormField label="Target job title" id="job-target" full>
        <input
          id="job-target"
          type="text"
          value={jobTarget}
          onChange={(e) => setJobTarget(e.target.value)}
          placeholder="IT Support Specialist, Cybersecurity Analyst"
          required
          disabled={loading}
          style={FIELD_CONTROL}
        />
      </FormField>

      <div className="wa-grid wa-grid-cols-1 sm:wa-grid-cols-2 wa-gap-3">
        <FormField label="Salary range" id="target-salary">
          <select
            id="target-salary"
            value={targetSalary}
            onChange={(e) => setTargetSalary(e.target.value)}
            disabled={loading}
            style={FIELD_CONTROL}
          >
            {SALARY_RANGES.map((s) => (
              <option key={s} value={s}>
                {s || 'Optional'}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="City / location" id="target-location">
          <input
            id="target-location"
            type="text"
            value={targetLocation}
            onChange={(e) => setTargetLocation(e.target.value)}
            placeholder="Austin, TX"
            disabled={loading}
            style={FIELD_CONTROL}
          />
        </FormField>
      </div>
      <p style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', margin: '-8px 0 0', lineHeight: 1.45 }}>
        Salary and city calibrate seniority and local phrasing. Optional.
      </p>

      <div>
        <label htmlFor="resume" className="wa-kit-field-label" style={{ marginBottom: 8, display: 'block' }}>
          Resume
        </label>
        {resumeBanner}
        {!preview ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, margin: '0 0 8px' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt"
              onChange={handleFileUpload}
              disabled={extracting || loading}
              className="wa-sr-only"
              id="resume-file"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={extracting || loading}
              className={KIT_BTN}
              style={{
                ...kitBtnOutline,
                opacity: extracting || loading ? 0.55 : 1,
                cursor: extracting || loading ? 'not-allowed' : 'pointer',
              }}
            >
              <Upload size={16} aria-hidden="true" />
              {extracting ? 'Extracting…' : 'Upload PDF, DOCX, or TXT'}
            </button>
          </div>
        ) : null}
        <textarea
          id="resume"
          value={resume}
          onChange={(e) => setResume(e.target.value)}
          placeholder="Paste your resume."
          rows={12}
          required
          disabled={loading}
          className="wa-kit-focus"
          style={{ ...FIELD_CONTROL, resize: 'vertical', minHeight: 200 }}
        />
      </div>
      <p style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', margin: '-8px 0 0', lineHeight: 1.45 }}>
        Prefills from a resume on file.
      </p>
      {extractionWarning ? (
        <p
          role="status"
          style={{
            margin: '-0.25rem 0 0',
            padding: '0.75rem',
            borderRadius: 'var(--wa-radius-sm)',
            border: '1px solid var(--wa-gold)',
            background: 'var(--wa-gold-soft)',
            color: 'var(--wa-text)',
            fontSize: 'var(--wa-type-meta)',
            lineHeight: 1.45,
          }}
        >
          {extractionWarning}
        </p>
      ) : null}

      <ul
        style={{
          margin: 0,
          paddingLeft: 18,
          fontSize: 'var(--wa-type-meta)',
          color: 'var(--wa-muted)',
          lineHeight: 1.65,
        }}
      >
        <li>Quantify bullets (“Reduced ticket response time by 40%”).</li>
        <li>Mirror keywords from the posting.</li>
        <li>One page under 10 years; two pages max.</li>
        <li>Lead each bullet with an action verb.</li>
      </ul>

      {error ? (
        <AiToolError
          error={error}
          onRetry={retryState.isRetrying ? undefined : doSubmit}
          isRetrying={retryState.isRetrying}
          nextRetryIn={retryState.nextRetryIn}
          retryCount={retryState.retryCount}
        />
      ) : null}

      <button
        type="submit"
        disabled={loading}
        aria-busy={loading}
        className={KIT_BTN}
        style={{
          ...kitBtnSolid,
          alignSelf: 'flex-start',
          opacity: loading ? 0.6 : 1,
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? (
          <>
            <PortalInlineSpinner size={18} />
            Rewriting…
          </>
        ) : (
          'Rewrite resume'
        )}
      </button>

      {output ? (
        <div
          style={{
            marginTop: 8,
            padding: 20,
            background: 'var(--wa-surface-2)',
            borderRadius: 'var(--wa-radius)',
            border: '1px solid var(--wa-border)',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <h3 style={{ flex: '1 1 100%', margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--wa-text)' }}>
              Rewritten resume
            </h3>
            <button type="button" onClick={() => void copy(output)} className={KIT_BTN} style={kitBtnOutline}>
              <span aria-live="polite" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                {copied ? 'Copied' : 'Copy'}
              </span>
            </button>
            <ExportPdfButton kit text={output} title="Resume" toolName="Resume Rewriter" />
          </div>
          <pre
            className="resume-rewriter-output-content"
            style={{
              margin: 0,
              padding: 16,
              borderRadius: 'var(--wa-radius-sm)',
              background: 'var(--wa-surface)',
              border: '1px solid var(--wa-border)',
              color: 'var(--wa-text)',
              fontFamily: 'inherit',
              fontSize: 'var(--wa-type-body)',
              lineHeight: 1.65,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {output}
          </pre>
          {!preview ? (
            <p style={{ margin: '12px 0 0', fontSize: 'var(--wa-type-body)', color: 'var(--wa-muted)' }}>
              Saved to history.{' '}
              <Link href="/dashboard/ai-tools/history" style={{ color: 'var(--wa-accent)', fontWeight: 600 }}>
                View all results
              </Link>
            </p>
          ) : null}
          {!preview ? <ToolFollowThrough toolType="resume_rewriter" output={output} /> : null}
        </div>
      ) : null}
    </form>
  );
}
