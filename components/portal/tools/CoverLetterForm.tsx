'use client';

import { useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { Check, Copy } from 'lucide-react';
import { PortalInlineSpinner } from '@/components/portal/PortalInlineSpinner';
import { trackToolLaunch } from '@/lib/analytics/events';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { useDraftAutosave } from '@/hooks/useDraftAutosave';
import { useHydrateMemberResumePlainText } from '@/hooks/useHydrateMemberResumePlainText';
import { FormField } from '@/components/portal/kit';
import ExportPdfButton from './ExportPdfButton';
import ToolFollowThrough from './ToolFollowThrough';
import AiToolError from './AiToolError';

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

const TONES = ['formal', 'confident', 'conversational'] as const;
type Tone = (typeof TONES)[number];

export default function CoverLetterForm({
  preview = false,
  initialCompany = '',
  initialJobDescription = '',
  initialResume = '',
  previewOutput,
}: {
  preview?: boolean;
  initialCompany?: string;
  initialJobDescription?: string;
  initialResume?: string;
  previewOutput?: string;
} = {}) {
  const [resume, setResume] = useState(initialResume);
  const [jobDescription, setJobDescription] = useState(initialJobDescription);
  const [companyName, setCompanyName] = useState(initialCompany);
  const [tone, setTone] = useState<Tone>('formal');
  const [output, setOutput] = useState(previewOutput ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { copy, copied } = useCopyToClipboard();

  useHydrateMemberResumePlainText(setResume, undefined, !preview);
  useDraftAutosave('ai-tool:cover-letter:jobDescription', jobDescription, setJobDescription);
  useDraftAutosave('ai-tool:cover-letter:companyName', companyName, setCompanyName);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (preview) {
      if (previewOutput) setOutput(previewOutput);
      return;
    }
    setError('');
    setOutput('');
    setLoading(true);
    trackToolLaunch('cover-letter', 'Cover Letter Builder');

    try {
      const res = await fetch('/api/ai/cover-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume,
          jobDescription,
          companyName: companyName || 'the company',
          tone,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong');
        return;
      }
      setOutput(data.output ?? '');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="wa-grid wa-grid-cols-1 sm:wa-grid-cols-2 wa-gap-3">
        <FormField label="Company" id="company">
          <input
            id="company"
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Ashby, Deloitte, local employer"
            disabled={loading}
            style={FIELD_CONTROL}
          />
        </FormField>
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
      </div>

      <FormField label="Job description" id="job-desc" full>
        <textarea
          id="job-desc"
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          placeholder="Paste the posting."
          rows={6}
          required
          disabled={loading}
          style={{ ...FIELD_CONTROL, resize: 'vertical', minHeight: 120 }}
        />
      </FormField>

      <FormField label="Resume" id="resume" full>
        <textarea
          id="resume"
          value={resume}
          onChange={(e) => setResume(e.target.value)}
          placeholder="Paste your resume."
          rows={8}
          required
          disabled={loading}
          style={{ ...FIELD_CONTROL, resize: 'vertical', minHeight: 160 }}
        />
      </FormField>
      <p style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', margin: '-8px 0 0', lineHeight: 1.45 }}>
        Prefills from a resume on file. Used to tailor the letter — not shown to employers.
      </p>

      {error ? <AiToolError error={error} /> : null}

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
            Writing letter…
          </>
        ) : (
          'Write letter'
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
              Letter
            </h3>
            <button type="button" onClick={() => void copy(output)} className={KIT_BTN} style={kitBtnOutline}>
              <span aria-live="polite" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                {copied ? 'Copied' : 'Copy'}
              </span>
            </button>
            <ExportPdfButton kit text={output} title="Cover Letter" toolName="Cover Letter Builder" />
          </div>
          <pre
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
          {!preview ? <ToolFollowThrough toolType="cover_letter" output={output} /> : null}
        </div>
      ) : null}
    </form>
  );
}
