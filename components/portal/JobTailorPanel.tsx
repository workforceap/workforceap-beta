'use client';

import { useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { History, Sparkles } from 'lucide-react';

type TailorResult = {
  matchScoreBefore: number;
  matchScoreAfter: number;
  tailoredResume: string;
  changes: string[];
  gaps: string[];
};

type TailorResponse = (TailorResult & { ok: true }) | { ok: false; error: string };

const KIT_BTN =
  'wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none';

const kitBtnSolid: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 44,
  padding: '10px 16px',
  background: 'var(--wa-accent)',
  color: 'var(--wa-on-accent-control)',
  border: '1px solid var(--wa-accent)',
  fontWeight: 600,
  fontSize: 14,
  borderRadius: 999,
  cursor: 'pointer',
};

const kitBtnOutline: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 44,
  padding: '10px 16px',
  background: 'transparent',
  color: 'var(--wa-accent)',
  border: '1px solid var(--wa-border)',
  fontWeight: 600,
  fontSize: 14,
  borderRadius: 999,
  cursor: 'pointer',
};

export const JOB_TAILOR_PREVIEW_RESULT: TailorResult = {
  matchScoreBefore: 62,
  matchScoreAfter: 84,
  changes: [
    'Lead with ticket triage and runbook writing instead of generic IT support.',
    'Named AWS and Azure incidents from your lab work in the summary.',
    'Cut two unrelated retail bullets so the cloud support signal is first.',
  ],
  gaps: [
    'This posting asks for CompTIA A+ or Google IT Support — add the credential if you have it.',
    'No explicit hybrid-schedule line. Confirm Austin office days in the cover letter.',
  ],
  tailoredResume:
    'JORDAN REYES\nCloud support · Austin, TX\n\nSUMMARY\nIT support graduate who triages VPN and identity tickets, writes runbooks, and has lab hours on AWS and Azure. Looking for a hybrid Austin cloud support seat.\n\nEXPERIENCE\nWorkforceAP labs — Ticket triage, runbook drafts, and escalation notes for cloud identity incidents.\n',
};

/** Score text sits on a light card; use the text-grade tokens (--wa-success is
 *  a fill colour at 3.4:1 on white, --wa-gold 3.5:1), see WAP-100. */
function scoreColor(score: number): string {
  if (score >= 75) return 'var(--wa-success-dark)';
  if (score >= 50) return 'var(--wa-gold-dark)';
  return 'var(--wa-danger)';
}

function ScoreBadge({ label, score }: { label: string; score: number }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          fontSize: 30,
          fontWeight: 800,
          lineHeight: 1,
          letterSpacing: '-0.03em',
          fontVariantNumeric: 'tabular-nums',
          color: scoreColor(score),
        }}
      >
        {score}%
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: 'var(--wa-muted)',
          marginTop: 6,
        }}
      >
        {label}
      </div>
    </div>
  );
}

export default function JobTailorPanel({
  jobId,
  preview = false,
  initialResult = null,
}: {
  jobId: string;
  /** Skip the tailor POST — /dev/member proofs. */
  preview?: boolean;
  /** Seed the result view so proofs can screenshot populated chrome. */
  initialResult?: TailorResult | null;
}) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TailorResult | null>(initialResult);
  const [error, setError] = useState<string | null>(null);
  const [needsResume, setNeedsResume] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showResume, setShowResume] = useState(Boolean(initialResult));

  async function runTailor() {
    setLoading(true);
    setError(null);
    setNeedsResume(false);
    if (preview) {
      setResult(JOB_TAILOR_PREVIEW_RESULT);
      setShowResume(true);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/ai/job-tailor/${encodeURIComponent(jobId)}`, {
        method: 'POST',
      });
      const data = (await res.json()) as TailorResponse;
      if (!data.ok) {
        if (res.status === 409) setNeedsResume(true);
        else setError(data.error || 'Could not tailor this resume. Try again.');
        return;
      }
      setResult(data);
      setShowResume(true);
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setLoading(false);
    }
  }

  async function copyResume() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.tailoredResume);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the textarea below is selectable */
    }
  }

  function downloadResume() {
    if (!result) return;
    const blob = new Blob([result.tailoredResume], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tailored-resume.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="wa-kit-card" aria-label="Resume tailor" style={{ margin: 0 }}>
      <p
        className="wa-flex wa-items-center wa-gap-2"
        style={{
          margin: '0 0 8px',
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--wa-accent)',
        }}
      >
        <Sparkles size={13} aria-hidden="true" />
        Resume tailor
      </p>

      {!result && (
        <>
          <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.55, color: 'var(--wa-muted)' }}>
            Score your resume against this posting, then rewrite it in the employer&apos;s language
            from experience you already have.
          </p>
          <button
            type="button"
            className={KIT_BTN}
            onClick={() => void runTailor()}
            disabled={loading}
            aria-busy={loading}
            style={kitBtnSolid}
          >
            <span aria-live="polite">{loading ? 'Tailoring…' : 'Tailor resume'}</span>
          </button>
          {needsResume && (
            <p style={{ margin: '12px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--wa-text)' }}>
              Upload a resume in{' '}
              <Link
                href="/dashboard/resume"
                className="wa-kit-focus"
                style={{ fontWeight: 700, color: 'var(--wa-accent)' }}
              >
                Resume Studio
              </Link>{' '}
              first.
            </p>
          )}
          {error && (
            <p role="alert" style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--wa-danger)' }}>
              {error}
            </p>
          )}
        </>
      )}

      {result && (
        <div>
          <div
            className="wa-flex wa-items-center wa-flex-wrap"
            style={{ gap: 20, margin: '8px 0 16px' }}
          >
            <ScoreBadge label="Your resume" score={result.matchScoreBefore} />
            <span style={{ fontSize: 18, color: 'var(--wa-muted)', fontWeight: 600 }} aria-hidden>
              →
            </span>
            <ScoreBadge label="Tailored" score={result.matchScoreAfter} />
          </div>

          {result.changes.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p
                style={{
                  margin: '0 0 6px',
                  fontSize: 13,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  color: 'var(--wa-muted)',
                }}
              >
                What changed
              </p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.55, color: 'var(--wa-text)' }}>
                {result.changes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}

          {result.gaps.length > 0 && (
            <div
              style={{
                marginBottom: 16,
                padding: '12px 14px',
                borderRadius: 'var(--wa-radius-sm)',
                background: 'var(--wa-gold-soft)',
                border: '1px solid var(--wa-border)',
              }}
            >
              <p
                style={{
                  margin: '0 0 6px',
                  fontSize: 13,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  color: 'var(--wa-gold-dark)',
                }}
              >
                Cover in your letter
              </p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.55, color: 'var(--wa-text)' }}>
                {result.gaps.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="wa-flex wa-flex-wrap" style={{ gap: 8, marginBottom: 12 }}>
            <button type="button" className={KIT_BTN} style={kitBtnSolid} onClick={() => void copyResume()}>
              <span aria-live="polite">{copied ? 'Copied' : 'Copy tailored resume'}</span>
            </button>
            <button type="button" className={KIT_BTN} style={kitBtnOutline} onClick={downloadResume}>
              Download .txt
            </button>
            <button
              type="button"
              className={KIT_BTN}
              style={kitBtnOutline}
              onClick={() => setShowResume((v) => !v)}
            >
              {showResume ? 'Hide resume' : 'Show resume'}
            </button>
          </div>
          {showResume && (
            <textarea
              readOnly
              value={result.tailoredResume}
              rows={12}
              aria-label="Tailored resume"
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 'var(--wa-radius-sm)',
                border: '1px solid var(--wa-border)',
                background: 'var(--wa-surface-2)',
                color: 'var(--wa-text)',
                fontSize: 13,
                lineHeight: 1.55,
                fontFamily: 'inherit',
                boxSizing: 'border-box',
                resize: 'vertical',
              }}
            />
          )}
          <div style={{ marginTop: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--wa-muted)', lineHeight: 1.5 }}>
              Saved to history. Match scores are estimates, not a guarantee.
            </p>
            <Link
              href="/dashboard/ai-tools/history"
              className="wa-page-action wa-kit-focus"
              style={{ marginTop: 4 }}
            >
              <History size={14} aria-hidden="true" />
              Open AI tool history
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
