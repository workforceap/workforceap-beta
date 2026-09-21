'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { Check, Copy } from 'lucide-react';
import ExportPdfButton from './ExportPdfButton';
import ToolFollowThrough from './ToolFollowThrough';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { ProgressRing, StatusTag, type KitTone } from '@/components/portal/kit';

export type ResumeSectionAuditCard = {
  title: string;
  status: string;
  description: string;
  tone: KitTone;
};

export type BulletSuggestionPair = { before: string; after: string };

type Props = {
  resumePreview: string;
  /** 0–100 match score for the circular gauge */
  scorePercent: number;
  /** Label under the score (e.g. job match vs. overall resume strength). */
  gaugeLabel?: string;
  extractionWarning?: string | null;
  matchedSkills: string[];
  missingSkills: string[];
  analysisText: string;
  sectionAuditCards: ResumeSectionAuditCard[];
  missingMetrics: string[];
  bulletSuggestions: BulletSuggestionPair[];
  exportTitle?: string;
  pdfToolName?: string;
  /** Hide history / follow-through — /dev/member proofs. */
  preview?: boolean;
};

const KIT_BTN =
  'wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none';

const kitBtnOutline: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  minHeight: 44,
  padding: '10px 16px',
  background: 'transparent',
  color: 'var(--wa-accent)',
  border: '1px solid var(--wa-border)',
  fontWeight: 600,
  fontSize: 'var(--wa-type-body)',
  borderRadius: 999,
  cursor: 'pointer',
};

const TONE_ACCENT: Record<KitTone, string> = {
  ok: 'var(--wa-success)',
  warn: 'var(--wa-gold)',
  alert: 'var(--wa-accent)',
  danger: 'var(--wa-danger)',
  info: 'var(--wa-info)',
  muted: 'var(--wa-muted)',
};

/**
 * Split-pane layout: resume document preview + target alignment score, skill tags, and audit sections.
 */
export default function ResumeAnalysisPanel({
  resumePreview,
  scorePercent,
  gaugeLabel = 'Target alignment',
  extractionWarning,
  matchedSkills,
  missingSkills,
  analysisText,
  sectionAuditCards,
  missingMetrics,
  bulletSuggestions,
  exportTitle = 'Job Match Analysis',
  pdfToolName = 'Job Match Scorer',
  preview = false,
}: Props) {
  const { copy, copied } = useCopyToClipboard();
  const clamped = Math.min(100, Math.max(0, scorePercent));

  return (
    <div className="resume-analysis-split" style={{ marginTop: 24 }}>
      <div className="resume-analysis-preview-pane">
        <div
          className="resume-analysis-preview-label"
          style={{ color: 'var(--wa-muted)', fontSize: 'var(--wa-type-meta)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}
        >
          Your resume
        </div>
        <div
          className="resume-analysis-preview-doc"
          style={{
            background: 'var(--wa-surface-2)',
            color: 'var(--wa-text)',
            borderRadius: 'var(--wa-radius)',
            border: '1px solid var(--wa-border)',
            boxShadow: 'var(--wa-shadow)',
            maxHeight: 'min(520px, 70vh)',
            overflow: 'auto',
            padding: 16,
          }}
        >
          <pre className="resume-analysis-preview-pre" style={{ margin: 0, fontFamily: 'inherit', fontSize: 'var(--wa-type-meta)', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--wa-text)' }}>
            {resumePreview || '—'}
          </pre>
        </div>
      </div>

      <div
        className="resume-analysis-results-pane resume-rewriter-output"
        style={{
          marginTop: 0,
          padding: 20,
          background: 'var(--wa-surface-2)',
          borderRadius: 'var(--wa-radius)',
          border: '1px solid var(--wa-border)',
        }}
      >
        <div className="resume-rewriter-output-header" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          <h3 style={{ flex: '1 1 100%', margin: 0, color: 'var(--wa-text)', fontSize: 16, fontWeight: 700 }}>
            Match analysis
          </h3>
          <button
            type="button"
            className={KIT_BTN}
            onClick={() => void copy(analysisText)}
            style={kitBtnOutline}
          >
            <span aria-live="polite" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
              {copied ? 'Copied' : 'Copy'}
            </span>
          </button>
          <ExportPdfButton text={analysisText} title={exportTitle} toolName={pdfToolName} kit />
        </div>

        {extractionWarning ? (
          <div
            role="alert"
            style={{
              marginTop: 12,
              padding: 14,
              borderRadius: 'var(--wa-radius-sm)',
              border: '1px solid var(--wa-gold)',
              background: 'var(--wa-gold-soft)',
              color: 'var(--wa-text)',
              fontSize: 'var(--wa-type-body)',
              lineHeight: 1.45,
            }}
          >
            {extractionWarning}
          </div>
        ) : null}

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, margin: '20px 0' }}>
          <ProgressRing pct={clamped} size={120} label={gaugeLabel} />
          <span style={{ fontSize: 'var(--wa-type-meta)', fontWeight: 600, color: 'var(--wa-muted)' }}>{gaugeLabel}</span>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {matchedSkills.map((skill) => (
            <span
              key={`m-${skill}`}
              style={{
                minHeight: 32,
                padding: '4px 12px',
                borderRadius: 999,
                fontSize: 'var(--wa-type-meta)',
                fontWeight: 600,
                background: 'var(--wa-success-soft)',
                color: 'var(--wa-success)',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              {skill}
            </span>
          ))}
          {missingSkills.map((skill) => (
            <span
              key={`x-${skill}`}
              style={{
                minHeight: 32,
                padding: '4px 12px',
                borderRadius: 999,
                fontSize: 'var(--wa-type-meta)',
                fontWeight: 600,
                background: 'var(--wa-danger-soft)',
                color: 'var(--wa-danger)',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              {skill}
            </span>
          ))}
        </div>

        <pre
          className="resume-rewriter-output-content"
          style={{ color: 'var(--wa-text)', fontFamily: 'inherit', fontSize: 'var(--wa-type-body)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}
        >
          {analysisText}
        </pre>

        <section aria-labelledby="resume-section-audit-heading" style={{ marginTop: 24, display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            <h4 id="resume-section-audit-heading" style={{ margin: 0, color: 'var(--wa-text)', fontSize: 15 }}>
              Section audit
            </h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {sectionAuditCards.map((card) => (
                <article
                  key={card.title}
                  style={{
                    flex: '1 1 220px',
                    minWidth: 220,
                    borderRadius: 'var(--wa-radius-sm)',
                    border: '1px solid var(--wa-border)',
                    borderLeft: `4px solid ${TONE_ACCENT[card.tone]}`,
                    background: 'var(--wa-surface)',
                    padding: 16,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <h5 style={{ margin: 0, fontSize: 15, color: 'var(--wa-text)' }}>{card.title}</h5>
                    <StatusTag tone={card.tone}>{card.status}</StatusTag>
                  </div>
                  <p style={{ margin: '10px 0 0', color: 'var(--wa-muted)', lineHeight: 1.5, fontSize: 'var(--wa-type-body)' }}>
                    {card.description}
                  </p>
                </article>
              ))}
            </div>
          </div>

          {missingMetrics.length > 0 ? (
            <section
              aria-labelledby="resume-missing-metrics-heading"
              style={{
                borderRadius: 'var(--wa-radius-sm)',
                border: '1px solid var(--wa-border)',
                background: 'var(--wa-gold-soft)',
                padding: 16,
              }}
            >
              <h4 id="resume-missing-metrics-heading" style={{ margin: 0, color: 'var(--wa-text)', fontSize: 15 }}>
                Metrics to add
              </h4>
              <ul
                style={{
                  margin: '12px 0 0',
                  paddingLeft: 20,
                  display: 'grid',
                  gap: 8,
                  color: 'var(--wa-text)',
                  fontSize: 'var(--wa-type-body)',
                }}
              >
                {missingMetrics.map((metric) => (
                  <li key={metric}>{metric}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {bulletSuggestions.length > 0 ? (
            <section aria-labelledby="resume-bullet-optimization-heading" style={{ display: 'grid', gap: 12 }}>
              <h4 id="resume-bullet-optimization-heading" style={{ margin: 0, color: 'var(--wa-text)', fontSize: 15 }}>
                Bullet rewrites
              </h4>
              <div style={{ display: 'grid', gap: 12 }}>
                {bulletSuggestions.map((item) => (
                  <article
                    key={item.before}
                    style={{
                      borderRadius: 'var(--wa-radius-sm)',
                      border: '1px solid var(--wa-border)',
                      background: 'var(--wa-surface)',
                      padding: 16,
                    }}
                  >
                    <div style={{ display: 'grid', gap: 12 }}>
                      <div
                        style={{
                          borderRadius: 'var(--wa-radius-sm)',
                          border: '1px solid var(--wa-border)',
                          background: 'var(--wa-surface-2)',
                          padding: 12,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 'var(--wa-type-meta)',
                            fontWeight: 700,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            color: 'var(--wa-muted)',
                          }}
                        >
                          Before
                        </div>
                        <p style={{ margin: '6px 0 0', lineHeight: 1.55, color: 'var(--wa-text)', fontSize: 'var(--wa-type-body)' }}>
                          {item.before}
                        </p>
                      </div>
                      <div
                        style={{
                          borderRadius: 'var(--wa-radius-sm)',
                          border: '1px solid var(--wa-border)',
                          background: 'var(--wa-success-soft)',
                          padding: 12,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 'var(--wa-type-meta)',
                            fontWeight: 700,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            color: 'var(--wa-success)',
                          }}
                        >
                          After
                        </div>
                        <p style={{ margin: '6px 0 0', lineHeight: 1.55, color: 'var(--wa-text)', fontSize: 'var(--wa-type-body)' }}>
                          {item.after}
                        </p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </section>

        {!preview ? <ToolFollowThrough toolType="resume_analysis" /> : null}

        {!preview ? (
          <p className="ai-result-saved" style={{ marginTop: 16, fontSize: 'var(--wa-type-body)', color: 'var(--wa-muted)' }}>
            Saved to history.{' '}
            <Link href="/dashboard/ai-tools/history" style={{ color: 'var(--wa-accent)', fontWeight: 600 }}>
              View all results
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
