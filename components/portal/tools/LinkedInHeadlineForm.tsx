'use client';

import { useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { Check, Copy } from 'lucide-react';
import { PortalInlineSpinner } from '@/components/portal/PortalInlineSpinner';
import { trackToolLaunch } from '@/lib/analytics/events';
import { useDraftAutosave } from '@/hooks/useDraftAutosave';
import ToolFollowThrough from './ToolFollowThrough';
import AiToolError from './AiToolError';
import { FormField } from '@/components/portal/kit';

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

export default function LinkedInHeadlineForm({
  preview = false,
  initialRole = '',
  initialSkills = '',
  initialYears = '',
  previewHeadlines,
}: {
  preview?: boolean;
  initialRole?: string;
  initialSkills?: string;
  initialYears?: string;
  previewHeadlines?: string[];
} = {}) {
  const [role, setRole] = useState(initialRole);
  const [keySkills, setKeySkills] = useState(initialSkills);
  const [yearsExperience, setYearsExperience] = useState(initialYears);
  const [headlines, setHeadlines] = useState<string[]>(previewHeadlines ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  useDraftAutosave('ai-tool:linkedin-headline:role', role, setRole);
  useDraftAutosave('ai-tool:linkedin-headline:keySkills', keySkills, setKeySkills);
  useDraftAutosave('ai-tool:linkedin-headline:yearsExperience', yearsExperience, setYearsExperience);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (preview) {
      setHeadlines(
        previewHeadlines ?? [
          'Cloud support specialist | AWS labs, runbooks, and ticket triage',
          'IT support graduate who isolates cost spikes before they hit the bill',
        ],
      );
      return;
    }
    setError('');
    setHeadlines([]);
    setLoading(true);
    trackToolLaunch('linkedin-headline', 'LinkedIn Headline Generator');

    try {
      const res = await fetch('/api/ai/linkedin-headline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, keySkills, yearsExperience: yearsExperience || undefined }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong');
        return;
      }
      setHeadlines(data.headlines ?? []);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      window.setTimeout(() => setCopiedIdx((c) => (c === idx ? null : c)), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ margin: 0 }}>
      <div className="wa-space-y-4">
        <FormField
          id="role"
          label="Target role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="e.g. Cloud support specialist"
          required
          disabled={loading}
        />
        <FormField
          id="skills"
          label="Key skills"
          value={keySkills}
          onChange={(e) => setKeySkills(e.target.value)}
          placeholder="e.g. AWS, Cost Explorer, runbooks"
          required
          disabled={loading}
        />
        <FormField
          id="experience"
          label="Years of experience (optional)"
          value={yearsExperience}
          onChange={(e) => setYearsExperience(e.target.value)}
          placeholder="e.g. 2 years"
          disabled={loading}
        />
      </div>
      {error ? <div style={{ marginTop: 12 }}><AiToolError error={error} /></div> : null}
      <button
        type="submit"
        className={KIT_BTN}
        disabled={loading}
        aria-busy={loading}
        style={{
          ...kitBtnSolid,
          marginTop: 16,
          opacity: loading ? 0.55 : 1,
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? (
          <>
            <PortalInlineSpinner size={18} />
            Generating headlines…
          </>
        ) : (
          'Generate headlines'
        )}
      </button>
      {headlines.length > 0 && (
        <div style={{ marginTop: 20 }} className="wa-space-y-3">
          <h3 style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em', margin: 0 }}>Headline options</h3>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {headlines.map((h, i) => (
              <li
                key={i}
                style={{
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                  background: 'var(--wa-surface-2)',
                  border: '1px solid var(--wa-border)',
                  borderRadius: 'var(--wa-radius-sm)',
                }}
              >
                <span style={{ flex: 1, minWidth: 0, fontSize: 'var(--wa-type-body)', lineHeight: 1.5, color: 'var(--wa-text)' }}>{h}</span>
                <button
                  type="button"
                  className={KIT_BTN}
                  onClick={() => void handleCopy(h, i)}
                  style={kitBtnOutline}
                >
                  {copiedIdx === i ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                  <span aria-live="polite">{copiedIdx === i ? 'Copied' : 'Copy'}</span>
                </button>
              </li>
            ))}
          </ul>
          {!preview ? (
            <>
              <p style={{ margin: 0, fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)' }}>
                Saved to your history.{' '}
                <Link href="/dashboard/ai-tools/history" style={{ color: 'var(--wa-accent)', fontWeight: 600 }}>
                  View all results
                </Link>
              </p>
              <ToolFollowThrough toolType="linkedin_headline" />
            </>
          ) : null}
        </div>
      )}
    </form>
  );
}
