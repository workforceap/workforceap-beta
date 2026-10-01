'use client';

import { useState, useRef, useEffect, type CSSProperties } from 'react';
import { Upload } from 'lucide-react';
import { PortalInlineSpinner } from '@/components/portal/PortalInlineSpinner';
import { trackAIToolRun, trackToolLaunch } from '@/lib/analytics/events';
import { getResumeExtractionWarning } from '@/lib/resume/extractionQuality';
import ResumeAnalysisPanel, { type ResumeSectionAuditCard } from './ResumeAnalysisPanel';
import ResumeScoreBreakdown, { type ResumeScorePayload } from './ResumeScoreBreakdown';
import AiToolError from './AiToolError';
import { useHydrateMemberResumePlainText } from '@/hooks/useHydrateMemberResumePlainText';

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
  minHeight: 200,
  boxSizing: 'border-box',
  resize: 'vertical',
};

const SECTION_AUDIT_STYLE = {
  structure: {
    title: 'Sections & structure',
    description: 'See strengths and improvements in the analysis text.',
  },
  quantification: {
    title: 'Quantified achievements',
    description: 'Check bullets for metrics, scope, and strong action verbs.',
  },
  actionVerbs: {
    title: 'Action-verb openers',
    description: 'Lead bullets with strong action verbs aligned to your target roles.',
  },
  contact: {
    title: 'Contact essentials',
    description: 'Ensure email, phone, and location are present and ATS-parsable.',
  },
} as const;

const SECTION_AUDIT_ORDER = ['structure', 'quantification', 'actionVerbs', 'contact'] as const;

function deriveSectionAuditCards(payload: ResumeScorePayload | null): ResumeSectionAuditCard[] {
  const breakdown = payload?.structural?.breakdown;
  if (!breakdown) return [];
  return SECTION_AUDIT_ORDER.flatMap((key) => {
    const sub = breakdown[key as keyof typeof breakdown];
    if (!sub) return [];
    const style = SECTION_AUDIT_STYLE[key];
    const isPass = sub.score >= 70;
    return [{
      title: style.title,
      status: isPass ? 'Pass' : 'Review',
      description: style.description,
      tone: isPass ? 'ok' : 'warn',
    }];
  });
}

function deriveMissingMetrics(payload: ResumeScorePayload | null): string[] {
  const breakdown = payload?.structural?.breakdown;
  if (!breakdown) return [];
  const findings: string[] = [];
  for (const key of ['quantification', 'structure', 'contact', 'bulletLength'] as const) {
    const sub = breakdown[key];
    if (sub && sub.score < 80) {
      for (const note of sub.notes) {
        const trimmed = note.trim();
        if (trimmed && !findings.includes(trimmed)) findings.push(trimmed);
      }
    }
  }
  return findings;
}

function deriveKeyword(
  payload: ResumeScorePayload | null,
  field: 'mustHavePresent' | 'mustHaveMissing',
): string[] {
  const market = payload?.marketCoverage;
  if (!market) return [];
  const seen = new Set<string>();
  for (const m of market) {
    if (m.source === 'unavailable') continue;
    for (const kw of m[field]) {
      if (!seen.has(kw.phrase)) seen.add(kw.phrase);
    }
  }
  return Array.from(seen).slice(0, 8);
}

export default function ResumeStrengthForm({
  preview = false,
  initialResume = '',
  previewOutput,
  previewPayload,
}: {
  preview?: boolean;
  initialResume?: string;
  previewOutput?: string;
  previewPayload?: ResumeScorePayload | null;
} = {}) {
  const [resume, setResume] = useState(initialResume);
  const [output, setOutput] = useState(previewOutput ?? '');
  const [scorePayload, setScorePayload] = useState<ResumeScorePayload | null>(previewPayload ?? null);
  const [extractionWarning, setExtractionWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [showFloating, setShowFloating] = useState(false);

  useHydrateMemberResumePlainText(setResume, undefined, !preview);

  const canSubmit = resume.trim().length >= 100 && !loading;

  useEffect(() => {
    if (preview || !formRef.current || !canSubmit) {
      setShowFloating(false);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setShowFloating(!entry.isIntersecting && canSubmit),
      { threshold: 0 },
    );
    const submitBtn = formRef.current.querySelector('button[type="submit"]');
    if (submitBtn) observer.observe(submitBtn);
    return () => observer.disconnect();
  }, [canSubmit, preview]);

  const applyPreview = () => {
    if (previewOutput) setOutput(previewOutput);
    if (previewPayload) setScorePayload(previewPayload);
    setExtractionWarning(getResumeExtractionWarning(resume));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (preview) {
      applyPreview();
      return;
    }
    setError('');
    setOutput('');
    setScorePayload(null);
    setExtractionWarning(getResumeExtractionWarning(resume));
    setLoading(true);
    trackToolLaunch('resume-analysis', 'Resume Analysis');
    trackAIToolRun('started', 'resume-analysis');

    try {
      const res = await fetch('/api/ai/resume-strength', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume }),
      });

      const data = await res.json();

      if (!res.ok) {
        trackAIToolRun('errored', 'resume-analysis', { reason: data.error ?? 'request_failed' });
        setError(data.error ?? 'Something went wrong');
        return;
      }

      trackAIToolRun('completed', 'resume-analysis', { output_length: (data.output ?? '').length });
      setOutput(data.output ?? '');
      setScorePayload({
        composite: data.composite,
        pillars: data.pillars,
        structural: data.structural,
        occupations: data.occupations,
        onetCoverage: data.onetCoverage,
        marketCoverage: data.marketCoverage,
      });
    } catch {
      trackAIToolRun('errored', 'resume-analysis', { reason: 'network_error' });
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || preview) return;
    setError('');
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
        setExtractionWarning(getResumeExtractionWarning(data.text));
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

  const scorePercent = scorePayload?.composite ?? 0;
  const sectionAuditCards = deriveSectionAuditCards(scorePayload);
  const missingMetrics = deriveMissingMetrics(scorePayload);
  const matchedSkills = deriveKeyword(scorePayload, 'mustHavePresent');
  const missingSkills = deriveKeyword(scorePayload, 'mustHaveMissing');

  return (
    <form ref={formRef} onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label htmlFor="resume-strength-body" className="wa-kit-field-label" style={{ marginBottom: 8, display: 'block' }}>
          Resume
        </label>
        {!preview ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, margin: '0 0 8px' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt"
              onChange={handleFileUpload}
              disabled={extracting || loading}
              className="wa-sr-only"
              id="resume-strength-file"
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
          id="resume-strength-body"
          value={resume}
          onChange={(e) => setResume(e.target.value)}
          placeholder="Paste your resume (100 characters min)."
          rows={12}
          required
          minLength={100}
          disabled={loading}
          className="wa-kit-focus"
          style={FIELD_CONTROL}
        />
      </div>
      <p style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', margin: '-8px 0 0', lineHeight: 1.45 }}>
        Prefills from a resume on file.
      </p>
      {error ? <AiToolError error={error} /> : null}
      <button
        type="submit"
        className={KIT_BTN}
        disabled={loading || !canSubmit}
        aria-busy={loading}
        style={{
          ...kitBtnSolid,
          alignSelf: 'flex-start',
          opacity: loading || !canSubmit ? 0.6 : 1,
          cursor: loading || !canSubmit ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? (
          <>
            <PortalInlineSpinner size={18} />
            Analyzing…
          </>
        ) : (
          'Analyze resume'
        )}
      </button>

      {output ? (
        <>
          {scorePayload ? <ResumeScoreBreakdown payload={scorePayload} /> : null}
          <ResumeAnalysisPanel
            resumePreview={resume}
            scorePercent={scorePercent}
            gaugeLabel="Overall strength"
            extractionWarning={extractionWarning}
            matchedSkills={matchedSkills}
            missingSkills={missingSkills}
            analysisText={output}
            sectionAuditCards={sectionAuditCards}
            missingMetrics={missingMetrics}
            bulletSuggestions={[]}
            exportTitle="Resume Strength Analysis"
            pdfToolName="Resume Analysis"
            preview={preview}
          />
        </>
      ) : null}
      {showFloating ? (
        <div
          style={{
            position: 'fixed',
            bottom: '5rem',
            left: '1rem',
            right: '1rem',
            zIndex: 'var(--z-sticky)',
          }}
        >
          <button
            type="submit"
            className={KIT_BTN}
            style={{
              ...kitBtnSolid,
              width: '100%',
              boxShadow: 'var(--wa-shadow-lg)',
              opacity: loading || !canSubmit ? 0.6 : 1,
              cursor: loading || !canSubmit ? 'not-allowed' : 'pointer',
            }}
            disabled={loading || !canSubmit}
          >
            {loading ? 'Analyzing…' : 'Analyze resume'}
          </button>
        </div>
      ) : null}
    </form>
  );
}
