'use client';

import { useState, useEffect, useRef, type CSSProperties } from 'react';
import Link from 'next/link';
import { Check, Copy } from 'lucide-react';
import { PortalInlineSpinner } from '@/components/portal/PortalInlineSpinner';
import { trackToolLaunch } from '@/lib/analytics/events';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { useDraftAutosave } from '@/hooks/useDraftAutosave';
import ToolFollowThrough from './ToolFollowThrough';
import AiToolError from './AiToolError';
import { FormField } from '@/components/portal/kit';

const RESUME_PREFILL_MAX = 3500;

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
};

export default function LinkedInAboutForm({
  preview = false,
  initialRole = '',
  initialBullets = '',
  previewOutput,
  resumeHref = '/dashboard/resume',
}: {
  preview?: boolean;
  initialRole?: string;
  initialBullets?: string;
  previewOutput?: string;
  resumeHref?: string;
} = {}) {
  const [role, setRole] = useState(initialRole);
  const [bullets, setBullets] = useState(initialBullets);
  const [output, setOutput] = useState(previewOutput ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resumeLoaded, setResumeLoaded] = useState(Boolean(preview && initialBullets));
  const [resumeLoading, setResumeLoading] = useState(!preview);
  const { copy, copied } = useCopyToClipboard();
  const userEditedBullets = useRef(false);

  useDraftAutosave('ai-tool:linkedin-about:role', role, setRole);

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    setResumeLoading(true);
    fetch('/api/member/resume?includePlainText=1')
      .then((r) => r.json())
      .then(
        (d: {
          resumePlainText?: string | null;
        }) => {
          if (cancelled) return;
          const t = d.resumePlainText?.trim();
          if (!t || t.length < 40) {
            setResumeLoading(false);
            return;
          }
          setResumeLoaded(true);
          if (!userEditedBullets.current) {
            const prefill = t.length > RESUME_PREFILL_MAX ? `${t.slice(0, RESUME_PREFILL_MAX)}\n…` : t;
            setBullets((prev) => (prev.trim() ? prev : prefill));
          }
        },
      )
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setResumeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [preview]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (preview) {
      setOutput(
        previewOutput ??
          'I isolate AWS cost spikes and write the runbook the on-call rotation uses next.\n\nIT support graduate in Austin. VPN triage, Cost Explorer, and clean handoffs.\n\nLooking for a hybrid cloud support seat where evidence trails matter more than tickets closed.',
      );
      return;
    }
    setError('');
    setOutput('');
    setLoading(true);
    trackToolLaunch('linkedin-about', 'LinkedIn About Section Generator');

    try {
      const res = await fetch('/api/ai/linkedin-about', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, bullets }),
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

  const handleCopy = () => {
    if (output) void copy(output);
  };

  return (
    <form onSubmit={handleSubmit} style={{ margin: 0 }}>
      {resumeLoading ? (
        <p style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', margin: '0 0 16px', lineHeight: 1.45 }}>
          Looking for a resume on file…
        </p>
      ) : resumeLoaded ? (
        <p style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', margin: '0 0 16px', lineHeight: 1.45 }}>
          Prefills from a resume on file.{' '}
          <Link href={resumeHref} style={{ color: 'var(--wa-accent)', fontWeight: 600 }}>
            View resume
          </Link>
        </p>
      ) : (
        <p style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', margin: '0 0 16px', lineHeight: 1.45 }}>
          No resume on file.{' '}
          <Link href={resumeHref} style={{ color: 'var(--wa-accent)', fontWeight: 600 }}>
            Upload a resume
          </Link>{' '}
          to prefill next time.
        </p>
      )}

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
        <FormField label="Highlights" id="bullets" full>
          <textarea
            value={bullets}
            onChange={(e) => {
              userEditedBullets.current = true;
              setBullets(e.target.value);
            }}
            placeholder={'IT support graduate. VPN triage, runbooks, AWS lab hours.'}
            rows={8}
            required
            disabled={loading}
            style={{ ...FIELD_CONTROL, minHeight: 160, resize: 'vertical' }}
          />
        </FormField>
      </div>
      {error ? (
        <div style={{ marginTop: 12 }}>
          <AiToolError error={error} />
        </div>
      ) : null}
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
            Generating About…
          </>
        ) : (
          'Generate About'
        )}
      </button>
      {output ? (
        <div style={{ marginTop: 20 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              flexWrap: 'wrap',
              marginBottom: 8,
            }}
          >
            <h3 style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em', margin: 0 }}>About</h3>
            <button type="button" className={KIT_BTN} onClick={handleCopy} style={kitBtnOutline}>
              {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
              <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          <pre
            style={{
              margin: 0,
              padding: '12px 14px',
              background: 'var(--wa-surface-2)',
              border: '1px solid var(--wa-border)',
              borderRadius: 'var(--wa-radius-sm)',
              fontSize: 'var(--wa-type-body)',
              lineHeight: 1.55,
              whiteSpace: 'pre-wrap',
              fontFamily: 'inherit',
              color: 'var(--wa-text)',
            }}
          >
            {output}
          </pre>
          {!preview ? (
            <>
              <p style={{ margin: '12px 0 0', fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)' }}>
                Saved to your history.{' '}
                <Link href="/dashboard/ai-tools/history" style={{ color: 'var(--wa-accent)', fontWeight: 600 }}>
                  View all results
                </Link>
              </p>
              <ToolFollowThrough toolType="linkedin_about" />
            </>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
