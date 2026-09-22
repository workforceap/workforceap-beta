'use client';

/**
 * AiResultRenderer — renders AI tool output in a visually polished,
 * type-specific format rather than raw JSON or plain pre-formatted text.
 *
 * Supported tool types:
 *   skill_assessment  → radar chart + skills bar list + skill gaps
 *   resume_rewriter   → formatted markdown-ish resume sections
 *   cover_letter      → formatted letter body
 *   linkedin_headline → headline pills
 *   linkedin_about    → formatted paragraphs
 *   interview_practice / interview_coach → numbered Q&A cards
 *   salary_negotiation / gap_analyzer / career_counselor → formatted prose
 *   job_match_scorer  → score + breakdown
 *   resume_analysis   → structured feedback list
 *   (fallback)        → formatted prose / pre text
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import ReactMarkdown from 'react-markdown';
import { requestFailureMessage } from '@/lib/http/requestFailureCopy';
import remarkGfm from 'remark-gfm';
import SkillMapperRadar from '@/components/portal/tools/SkillMapperRadar';

// ─── Type definitions ───────────────────────────────────────────────────────

type RadarAxis = { axis: string; value: number; maxValue: number };
type SkillRow = { id?: string; name: string; score: number; category?: string };
type GapRow = { skill: string; current?: number; target?: number; gap?: number };

type SkillAssessmentOutput = {
  occupationTitle?: string;
  occupationCode?: string;
  radarAxes?: RadarAxis[];
  skills?: SkillRow[];
  gaps?: GapRow[];
};

type InterviewQuestion = {
  question?: string;
  Question?: string;
  type?: string;
  tip?: string;
  sample_answer?: string;
  sampleAnswer?: string;
};

type JobMatchOutput = {
  overallScore?: number;
  score?: number;
  breakdown?: Record<string, { score?: number; notes?: string }>;
  summary?: string;
  strengths?: string[];
  gaps?: string[];
};

type ElevatorPitchOutput = {
  type?: string;
  name?: string;
  targetRole?: string;
  strengths?: string;
  certifications?: string;
  industry?: string;
  pitch?: string;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // Try to extract first JSON object or array from the string
    const objMatch = raw.match(/\{[\s\S]*\}/);
    const arrMatch = raw.match(/\[[\s\S]*\]/);
    const match = objMatch && arrMatch
      ? (raw.indexOf('{') < raw.indexOf('[') ? objMatch : arrMatch)
      : (objMatch ?? arrMatch);
    if (match) {
      try { return JSON.parse(match[0]); } catch { /* ignore */ }
    }
    return null;
  }
}

function formatMarkdownProse(text: string): string {
  return text
    .replace(/^#+\s+/gm, '') // strip heading markers — we'll handle them via styling
    .replace(/\*\*([^*]+)\*\*/g, '$1') // strip bold markers for clean text
    .trim();
}

// ─── Tool-specific renderers ─────────────────────────────────────────────────

function SkillAssessmentRenderer({ raw }: { raw: string }) {
  const parsed = tryParseJson(raw) as SkillAssessmentOutput | null;
  if (!parsed || typeof parsed !== 'object') return <FallbackRenderer raw={raw} />;

  const axes = (parsed.radarAxes ?? []).map((a) => ({
    axis: a.axis,
    value: a.value,
    maxValue: a.maxValue ?? 100,
    hasData: a.value > 0,
  }));
  const skills = parsed.skills ?? [];
  const gaps = parsed.gaps ?? [];

  const hasContent = axes.length >= 3 || skills.length > 0 || gaps.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {parsed.occupationTitle && (
        <div>
          <p style={{ fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-on-surface-variant)', margin: '0 0 0.25rem' }}>Occupation</p>
          <p style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: 0 }}>
            {parsed.occupationTitle}
            {parsed.occupationCode && <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-surface-variant)', marginLeft: '0.5rem' }}>({parsed.occupationCode})</span>}
          </p>
        </div>
      )}
      {!hasContent && (
        <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', margin: 0 }}>
          No skill data found in this result. Search an occupation in the Occupation Search tab to generate a new map.
        </p>
      )}

      {axes.length >= 3 && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <SkillMapperRadar axes={axes} size={240} />
        </div>
      )}

      {skills.length > 0 && (
        <div>
          <p style={{ fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-on-surface-variant)', margin: '0 0 0.625rem' }}>Top Skills</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            {skills.slice(0, 10).map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-surface)', minWidth: '140px' }}>{s.name}</span>
                <div style={{ flex: 1, height: '6px', background: 'var(--surface-container-highest)', borderRadius: '9999px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${s.score}%`, background: 'linear-gradient(to right, var(--color-accent-dark), var(--color-accent))', borderRadius: '9999px', transition: 'width 0.6s' }} />
                </div>
                <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--wa-accent-text)', minWidth: '32px', textAlign: 'right' }}>{s.score}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {gaps.length > 0 && (
        <div>
          <p style={{ fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-on-surface-variant)', margin: '0 0 0.625rem' }}>Skill Gaps to Close</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            {gaps.slice(0, 8).map((g, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-on-surface)', minWidth: '140px' }}>{g.skill}</span>
                <div style={{ flex: 1, height: '6px', background: 'var(--surface-container-highest)', borderRadius: '9999px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, g.current ?? 0)}%`, background: 'var(--surface-container-high)', borderRadius: '9999px' }} />
                </div>
                <span style={{ fontSize: '0.8125rem', color: 'var(--wa-accent-text)', minWidth: '80px', textAlign: 'right', fontWeight: 600 }}>
                  {g.current ?? 0}% → {g.target ?? 0}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ResumeRenderer({ raw }: { raw: string }) {
  return (
    <div className="ai-result-markdown" style={{ fontSize: '0.875rem', color: 'var(--color-on-surface)', lineHeight: 1.65, margin: 0 }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
        p: ({ children }) => <p style={{ margin: '0 0 0.75rem', lineHeight: 1.65 }}>{children}</p>,
        h1: ({ children }) => <p style={{ fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--wa-accent-text)', margin: '0 0 0.375rem', borderBottom: '1px solid color-mix(in srgb, var(--color-accent) 15%, transparent)', paddingBottom: '0.25rem' }}>{children}</p>,
        h2: ({ children }) => <p style={{ fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--wa-accent-text)', margin: '0 0 0.375rem', borderBottom: '1px solid color-mix(in srgb, var(--color-accent) 15%, transparent)', paddingBottom: '0.25rem' }}>{children}</p>,
        h3: ({ children }) => <p style={{ fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--wa-accent-text)', margin: '0 0 0.375rem', borderBottom: '1px solid color-mix(in srgb, var(--color-accent) 15%, transparent)', paddingBottom: '0.25rem' }}>{children}</p>,
        ul: ({ children }) => <ul style={{ margin: '0.5rem 0', paddingLeft: '1.25rem' }}>{children}</ul>,
        ol: ({ children }) => <ol style={{ margin: '0.5rem 0', paddingLeft: '1.25rem' }}>{children}</ol>,
        li: ({ children }) => <li style={{ margin: '0.25rem 0' }}>{children}</li>,
        strong: ({ children }) => <strong style={{ fontWeight: 700, color: 'var(--color-on-surface)' }}>{children}</strong>,
        em: ({ children }) => <em style={{ fontStyle: 'italic', color: 'var(--color-on-surface-variant)' }}>{children}</em>,
        code: ({ children }) => <code style={{ fontFamily: 'monospace', fontSize: '0.8125rem', background: 'var(--surface-container-high)', padding: '0.15rem 0.35rem', borderRadius: '0.25rem', color: 'var(--color-on-surface)' }}>{children}</code>,
        pre: ({ children }) => <pre style={{ fontFamily: 'monospace', fontSize: '0.8125rem', background: 'var(--surface-container-high)', padding: '0.75rem', borderRadius: '0.5rem', overflow: 'auto', margin: '0.75rem 0' }}>{children}</pre>,
        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--wa-accent-text)', textDecoration: 'underline' }}>{children}</a>,
        blockquote: ({ children }) => <blockquote style={{ borderLeft: '3px solid var(--color-accent)', paddingLeft: '0.75rem', margin: '0.75rem 0', color: 'var(--color-on-surface-variant)', fontStyle: 'italic' }}>{children}</blockquote>,
      }}>
        {raw}
      </ReactMarkdown>
    </div>
  );
}

function CoverLetterRenderer({ raw }: { raw: string }) {
  return (
    <div className="ai-result-markdown" style={{ fontSize: '0.9rem', color: 'var(--color-on-surface)', lineHeight: 1.7, margin: 0 }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
        p: ({ children }) => <p style={{ margin: '0 0 0.875rem', lineHeight: 1.7 }}>{children}</p>,
        h1: ({ children }) => <h1 style={{ fontSize: '1.125rem', fontWeight: 800, margin: '1rem 0 0.5rem', color: 'var(--wa-accent-text)' }}>{children}</h1>,
        h2: ({ children }) => <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: '0.875rem 0 0.5rem', color: 'var(--wa-accent-text)' }}>{children}</h2>,
        h3: ({ children }) => <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '0.75rem 0 0.5rem', color: 'var(--wa-accent-text)' }}>{children}</h3>,
        ul: ({ children }) => <ul style={{ margin: '0.5rem 0', paddingLeft: '1.25rem' }}>{children}</ul>,
        ol: ({ children }) => <ol style={{ margin: '0.5rem 0', paddingLeft: '1.25rem' }}>{children}</ol>,
        li: ({ children }) => <li style={{ margin: '0.25rem 0' }}>{children}</li>,
        strong: ({ children }) => <strong style={{ fontWeight: 700, color: 'var(--color-on-surface)' }}>{children}</strong>,
        em: ({ children }) => <em style={{ fontStyle: 'italic', color: 'var(--color-on-surface-variant)' }}>{children}</em>,
        code: ({ children }) => <code style={{ fontFamily: 'monospace', fontSize: '0.8125rem', background: 'var(--surface-container-high)', padding: '0.15rem 0.35rem', borderRadius: '0.25rem', color: 'var(--color-on-surface)' }}>{children}</code>,
        pre: ({ children }) => <pre style={{ fontFamily: 'monospace', fontSize: '0.8125rem', background: 'var(--surface-container-high)', padding: '0.75rem', borderRadius: '0.5rem', overflow: 'auto', margin: '0.75rem 0' }}>{children}</pre>,
        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--wa-accent-text)', textDecoration: 'underline' }}>{children}</a>,
        blockquote: ({ children }) => <blockquote style={{ borderLeft: '3px solid var(--color-accent)', paddingLeft: '0.75rem', margin: '0.75rem 0', color: 'var(--color-on-surface-variant)', fontStyle: 'italic' }}>{children}</blockquote>,
      }}>
        {raw}
      </ReactMarkdown>
    </div>
  );
}

function LinkedInHeadlineRenderer({ raw }: { raw: string }) {
  let headlines: string[] = [];
  try {
    const parsed = JSON.parse(raw);
    headlines = Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
  } catch {
    headlines = raw.split('\n').filter((l) => l.trim());
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
      {headlines.map((h, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.875rem', background: 'var(--surface-container-low)', borderRadius: '0.75rem', border: '1px solid var(--outline-variant)' }}>
          <span style={{ fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--wa-accent-text)', padding: '0.15rem 0.4rem', borderRadius: '9999px', background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)', flexShrink: 0, marginTop: '0.1rem' }}>#{i + 1}</span>
          <p style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--color-on-surface)', margin: 0, lineHeight: 1.45 }}>{h}</p>
        </div>
      ))}
    </div>
  );
}

function InterviewQARenderer({ raw }: { raw: string }) {
  let questions: InterviewQuestion[] = [];
  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    const arr = Array.isArray(parsed) ? parsed : (parsed?.questions ?? []);
    questions = arr;
  } catch {
    // Fallback: treat as numbered list
    const lines = raw.split('\n').filter((l) => l.trim());
    questions = lines.map((l) => ({ question: l.replace(/^\d+\.\s+/, '') }));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
      {questions.slice(0, 15).map((q, i) => {
        const questionText = q.question ?? q.Question ?? '';
        const tip = q.tip;
        const sample = q.sample_answer ?? q.sampleAnswer;
        const type = q.type;
        return (
          <div key={i} style={{ padding: '1rem', background: 'var(--surface-container-low)', borderRadius: '0.875rem', border: '1px solid var(--outline-variant)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: tip || sample ? '0.625rem' : 0 }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 800, color: '#fff', background: 'var(--color-accent)', borderRadius: '9999px', width: '1.5rem', height: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: 0, lineHeight: 1.4 }}>{questionText}</p>
                {type && <p style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-on-surface-variant)', margin: '0.25rem 0 0' }}>{type}</p>}
              </div>
            </div>
            {tip && (
              <div style={{ padding: '0.5rem 0.75rem', background: 'color-mix(in srgb, var(--color-accent) 7%, transparent)', borderRadius: '0.5rem', borderLeft: '2px solid var(--color-accent)', marginLeft: '2.25rem' }}>
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: 0, lineHeight: 1.5 }}>
                  <strong style={{ color: 'var(--wa-accent-text)' }}>Tip:</strong> {tip}
                </p>
              </div>
            )}
            {sample && (
              <div style={{ marginTop: '0.5rem', marginLeft: '2.25rem', padding: '0.5rem 0.75rem', background: 'var(--surface-container-high)', borderRadius: '0.5rem' }}>
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: 0, lineHeight: 1.5, fontStyle: 'italic' }}>{sample}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function JobMatchRenderer({ raw }: { raw: string }) {
  const parsed = tryParseJson(raw) as JobMatchOutput | null;
  const score = parsed?.overallScore ?? parsed?.score;
  const summary = parsed?.summary;
  const strengths = parsed?.strengths ?? [];
  const gaps = parsed?.gaps ?? [];

  if (!parsed) return <FallbackRenderer raw={raw} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {score !== undefined && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)', borderRadius: '0.875rem' }}>
          <div style={{ fontSize: '2.5rem', fontWeight: 800, letterSpacing: '-0.04em', color: score >= 70 ? 'var(--color-green, #4a9b4f)' : score >= 50 ? 'var(--color-gold)' : 'var(--color-accent)' }}>
            {score}<span style={{ fontSize: '1rem', color: 'var(--color-on-surface-variant)' }}>%</span>
          </div>
          <div>
            <p style={{ fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-on-surface-variant)', margin: 0 }}>Match Score</p>
            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-on-surface)', margin: '0.2rem 0 0' }}>
              {score >= 80 ? 'Strong fit' : score >= 60 ? 'Good fit' : score >= 40 ? 'Partial fit' : 'Low fit'}
            </p>
          </div>
        </div>
      )}
      {summary && <p style={{ fontSize: '0.9rem', color: 'var(--color-on-surface)', lineHeight: 1.65, margin: 0 }}>{summary}</p>}
      {strengths.length > 0 && (
        <div>
          <p style={{ fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-green, #4a9b4f)', margin: '0 0 0.5rem' }}>Strengths</p>
          {strengths.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.375rem' }}>
              <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '1rem', color: 'var(--color-green, #4a9b4f)', flexShrink: 0, fontVariationSettings: "'FILL' 1" }}>check_circle</span>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface)', margin: 0, lineHeight: 1.5 }}>{s}</p>
            </div>
          ))}
        </div>
      )}
      {gaps.length > 0 && (
        <div>
          <p style={{ fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--wa-accent-text)', margin: '0 0 0.5rem' }}>Gaps to Address</p>
          {gaps.map((g, i) => (
            <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.375rem' }}>
              <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '1rem', color: 'var(--color-gold)', flexShrink: 0, fontVariationSettings: "'FILL' 1" }}>warning</span>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface)', margin: 0, lineHeight: 1.5 }}>{g}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProseSectionRenderer({ raw, toolLabel }: { raw: string; toolLabel?: string }) {
  const parsed = tryParseJson(raw) as ElevatorPitchOutput | null;
  if (parsed && parsed.type === 'elevator_pitch' && parsed.pitch) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <p style={{ fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--wa-accent-text)', margin: '0 0 0.5rem' }}>
            AI Elevator Introduction
          </p>
          <p style={{ fontSize: '1rem', lineHeight: 1.7, color: 'var(--color-on-surface)', margin: 0 }}>
            {parsed.pitch}
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
          {parsed.targetRole ? (
            <div>
              <p style={{ fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-on-surface-variant)', margin: '0 0 0.25rem' }}>
                Target role
              </p>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-on-surface)' }}>{parsed.targetRole}</p>
            </div>
          ) : null}
          {parsed.industry ? (
            <div>
              <p style={{ fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-on-surface-variant)', margin: '0 0 0.25rem' }}>
                Industry
              </p>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-on-surface)' }}>{parsed.industry}</p>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="ai-result-markdown" style={{ fontSize: '0.875rem', color: 'var(--color-on-surface)', lineHeight: 1.65, margin: 0 }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
        p: ({ children }) => <p style={{ margin: '0 0 0.75rem', lineHeight: 1.65 }}>{children}</p>,
        h1: ({ children }) => <h1 style={{ fontSize: '1.125rem', fontWeight: 800, margin: '1rem 0 0.5rem', color: 'var(--wa-accent-text)' }}>{children}</h1>,
        h2: ({ children }) => <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: '0.875rem 0 0.5rem', color: 'var(--wa-accent-text)' }}>{children}</h2>,
        h3: ({ children }) => <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '0.75rem 0 0.5rem', color: 'var(--wa-accent-text)' }}>{children}</h3>,
        ul: ({ children }) => <ul style={{ margin: '0.5rem 0', paddingLeft: '1.25rem' }}>{children}</ul>,
        ol: ({ children }) => <ol style={{ margin: '0.5rem 0', paddingLeft: '1.25rem' }}>{children}</ol>,
        li: ({ children }) => <li style={{ margin: '0.25rem 0' }}>{children}</li>,
        strong: ({ children }) => <strong style={{ fontWeight: 700, color: 'var(--color-on-surface)' }}>{children}</strong>,
        em: ({ children }) => <em style={{ fontStyle: 'italic', color: 'var(--color-on-surface-variant)' }}>{children}</em>,
        code: ({ children }) => <code style={{ fontFamily: 'monospace', fontSize: '0.8125rem', background: 'var(--surface-container-high)', padding: '0.15rem 0.35rem', borderRadius: '0.25rem', color: 'var(--color-on-surface)' }}>{children}</code>,
        pre: ({ children }) => <pre style={{ fontFamily: 'monospace', fontSize: '0.8125rem', background: 'var(--surface-container-high)', padding: '0.75rem', borderRadius: '0.5rem', overflow: 'auto', margin: '0.75rem 0' }}>{children}</pre>,
        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--wa-accent-text)', textDecoration: 'underline' }}>{children}</a>,
        blockquote: ({ children }) => <blockquote style={{ borderLeft: '3px solid var(--color-accent)', paddingLeft: '0.75rem', margin: '0.75rem 0', color: 'var(--color-on-surface-variant)', fontStyle: 'italic' }}>{children}</blockquote>,
      }}>
        {raw}
      </ReactMarkdown>
    </div>
  );
}

function FallbackRenderer({ raw }: { raw: string }) {
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
  return (
    <div className="ai-result-markdown" style={{ fontSize: '0.875rem', color: 'var(--color-on-surface)', lineHeight: 1.65, margin: 0 }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
        p: ({ children }) => <p style={{ margin: '0 0 0.75rem', lineHeight: 1.65 }}>{children}</p>,
        h1: ({ children }) => <h1 style={{ fontSize: '1.125rem', fontWeight: 800, margin: '1rem 0 0.5rem', color: 'var(--wa-accent-text)' }}>{children}</h1>,
        h2: ({ children }) => <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: '0.875rem 0 0.5rem', color: 'var(--wa-accent-text)' }}>{children}</h2>,
        h3: ({ children }) => <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, margin: '0.75rem 0 0.5rem', color: 'var(--wa-accent-text)' }}>{children}</h3>,
        ul: ({ children }) => <ul style={{ margin: '0.5rem 0', paddingLeft: '1.25rem' }}>{children}</ul>,
        ol: ({ children }) => <ol style={{ margin: '0.5rem 0', paddingLeft: '1.25rem' }}>{children}</ol>,
        li: ({ children }) => <li style={{ margin: '0.25rem 0' }}>{children}</li>,
        strong: ({ children }) => <strong style={{ fontWeight: 700, color: 'var(--color-on-surface)' }}>{children}</strong>,
        em: ({ children }) => <em style={{ fontStyle: 'italic', color: 'var(--color-on-surface-variant)' }}>{children}</em>,
        code: ({ children }) => <code style={{ fontFamily: 'monospace', fontSize: '0.8125rem', background: 'var(--surface-container-high)', padding: '0.15rem 0.35rem', borderRadius: '0.25rem', color: 'var(--color-on-surface)' }}>{children}</code>,
        pre: ({ children }) => <pre style={{ fontFamily: 'monospace', fontSize: '0.8125rem', background: 'var(--surface-container-high)', padding: '0.75rem', borderRadius: '0.5rem', overflow: 'auto', margin: '0.75rem 0' }}>{children}</pre>,
        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--wa-accent-text)', textDecoration: 'underline' }}>{children}</a>,
        blockquote: ({ children }) => <blockquote style={{ borderLeft: '3px solid var(--color-accent)', paddingLeft: '0.75rem', margin: '0.75rem 0', color: 'var(--color-on-surface-variant)', fontStyle: 'italic' }}>{children}</blockquote>,
      }}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

// ─── Copy button ─────────────────────────────────────────────────────────────

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.5rem 0.875rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)', background: 'var(--surface-container)', color: copied ? 'var(--color-green, #4a9b4f)' : 'var(--color-accent)', fontWeight: 700, fontSize: '0.8125rem', cursor: 'pointer', transition: 'color 0.2s', minHeight: '44px' }}
    >
      <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '0.9rem', fontVariationSettings: "'FILL' 1" }}>
        {copied ? 'check' : 'content_copy'}
      </span>
      <span aria-live="polite">{copied ? 'Copied!' : label}</span>
    </button>
  );
}

const PDF_FAILED = 'Could not create the PDF. Please try again.';

function DownloadPdfButton({ text, title, toolName }: { text: string; title?: string; toolName?: string }) {
  const tCommon = useTranslations('common');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
    <button
      type="button"
      disabled={loading}
      aria-busy={loading}
      onClick={async () => {
        setLoading(true);
        setError(null);
        try {
          const res = await fetch('/api/ai/export-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, title, toolName }),
          });
          if (!res.ok) {
            const data = (await res.json().catch(() => ({}))) as { error?: unknown };
            setError(typeof data.error === 'string' && data.error.trim() ? data.error : PDF_FAILED);
            return;
          }
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${(title ?? toolName ?? 'workforceap-result').replace(/\s+/g, '-').toLowerCase()}.pdf`;
          a.click();
          URL.revokeObjectURL(url);
        } catch (err) {
          setError(requestFailureMessage(err, { connection: tCommon('connectionError'), fallback: PDF_FAILED }, 'ai-export-pdf'));
        } finally {
          setLoading(false);
        }
      }}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.5rem 0.875rem', borderRadius: '0.5rem', border: '1px solid var(--outline-variant)', background: 'var(--surface-container)', color: 'var(--color-on-surface-variant)', fontWeight: 700, fontSize: '0.8125rem', cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1, minHeight: '44px' }}
    >
      <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '0.9rem', fontVariationSettings: "'FILL' 1" }}>
        {loading ? 'hourglass_empty' : 'download'}
      </span>
      <span aria-live="polite">
        {loading ? 'Saving…' : 'Download PDF'}
      </span>
    </button>
    {error ? (
      <p role="alert" style={{ flexBasis: '100%', margin: 0, fontSize: '0.8125rem', fontWeight: 600, color: 'var(--wa-danger, #dc2626)' }}>
        {error}
      </p>
    ) : null}
    </>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  job_match_scorer: 'See how you match a job',
  resume_analysis: 'Resume Analysis',
  resume_rewriter: 'Resume Rewriter',
  cover_letter: 'Cover Letter',
  interview_practice: 'Interview Practice',
  interview_coach: 'AI Interview Coach',
  linkedin_headline: 'LinkedIn Headline',
  linkedin_about: 'LinkedIn About',
  salary_negotiation: 'Salary Negotiation',
  gap_analyzer: 'See what is missing for a job',
  career_counselor: 'Career Readiness Coach',
  skill_assessment: 'Find skills employers want',
};

export type AiResultRendererProps = {
  toolType: string;
  output: string;
  inputSummary?: string;
  showCopy?: boolean;
  showDownload?: boolean;
  compact?: boolean;
};

/** Strip markdown heading markers (####, ###, ##, #) for clean PDF/copy text */
function cleanForExport(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')  // strip heading markers at start of lines
    .replace(/\*\*([^*]+)\*\*/g, '$1')  // strip bold markers
    .trim();
}

/** Serialize interview Q&A JSON array into readable numbered text */
function serializeInterviewForExport(raw: string): string {
  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    const arr: Array<Record<string, unknown>> = Array.isArray(parsed) ? parsed : (parsed?.questions ?? []);
    if (!arr.length) return cleanForExport(raw);
    return arr.map((q, i) => {
      const question = String(q.question ?? q.Question ?? '');
      const type = String(q.type ?? q.Type ?? '');
      const tip = String(q.tip ?? q.Tip ?? '');
      const sample = String(q.sample_answer ?? q.sampleAnswer ?? '');
      const parts = [`${i + 1}. ${question}`];
      if (type) parts.push(`   Type: ${type}`);
      if (tip) parts.push(`   Tip: ${tip}`);
      if (sample) parts.push(`   Sample Answer: ${sample}`);
      return parts.join('\n');
    }).join('\n\n');
  } catch {
    return cleanForExport(raw);
  }
}

export default function AiResultRenderer({ toolType, output, inputSummary, showCopy = true, showDownload = true, compact = false }: AiResultRendererProps) {
  const raw = typeof output === 'string' ? output : JSON.stringify(output);
  const toolLabel = TOOL_LABELS[toolType] ?? toolType;
  const pdfTitle = inputSummary ? `${toolLabel} — ${inputSummary}` : toolLabel;
  // For copy/download: clean text of markdown markers / serialize structured data
  const exportText = (() => {
    if (['interview_practice', 'interview_coach'].includes(toolType)) return serializeInterviewForExport(raw);
    if (['resume_rewriter', 'resume_analysis', 'cover_letter', 'linkedin_about',
      'salary_negotiation', 'gap_analyzer', 'career_counselor'].includes(toolType)) return cleanForExport(raw);
    return raw;
  })();

  let body: React.ReactNode;

  switch (toolType) {
    case 'skill_assessment':
      body = <SkillAssessmentRenderer raw={raw} />;
      break;
    case 'resume_rewriter':
    case 'resume_analysis':
      body = <ResumeRenderer raw={raw} />;
      break;
    case 'cover_letter':
    case 'linkedin_about':
      body = <CoverLetterRenderer raw={raw} />;
      break;
    case 'linkedin_headline':
      body = <LinkedInHeadlineRenderer raw={raw} />;
      break;
    case 'interview_practice':
    case 'interview_coach':
      body = <InterviewQARenderer raw={raw} />;
      break;
    case 'job_match_scorer':
      body = <JobMatchRenderer raw={raw} />;
      break;
    case 'salary_negotiation':
    case 'gap_analyzer':
    case 'career_counselor':
      body = <ProseSectionRenderer raw={raw} />;
      break;
    default:
      body = <FallbackRenderer raw={raw} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? '0.75rem' : '1rem' }}>
      {body}
      {(showCopy || showDownload) && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', paddingTop: '0.5rem', borderTop: '1px solid var(--outline-variant)' }}>
          {showCopy && <CopyButton text={exportText} />}
          {showDownload && toolType !== 'skill_assessment' && (
            <DownloadPdfButton text={exportText} title={pdfTitle} toolName={toolLabel} />
          )}
          {showDownload && toolType === 'skill_assessment' && (() => {
            // Skill assessment: build a readable text summary for PDF
            try {
              const parsed = JSON.parse(raw) as {
                occupationTitle?: string; occupationCode?: string;
                radarAxes?: Array<{ axis: string; value: number; maxValue?: number }>;
                skills?: Array<{ name: string; score: number }>;
                gaps?: Array<{ skill: string; current?: number; target?: number }>;
              };
              const lines = [
                parsed.occupationTitle ? `Occupation: ${parsed.occupationTitle}` : '',
                parsed.occupationCode ? `O*NET Code: ${parsed.occupationCode}` : '',
                '',
                '## Skill Profile',
                ...(parsed.radarAxes ?? []).map(a => `${a.axis}: ${a.value}%`),
                '',
                '## Top Skills',
                ...(parsed.skills ?? []).slice(0, 15).map(s => `${s.name}: ${s.score}%`),
                ...(parsed.gaps?.length ? ['', '## Skill Gaps', ...(parsed.gaps ?? []).map(g => `${g.skill}: ${g.current ?? 0}% → ${g.target ?? 0}%`)] : []),
              ].filter(l => l !== null).join('\n');
              return <DownloadPdfButton text={lines} title={pdfTitle} toolName={toolLabel} />;
            } catch { return null; }
          })()}
        </div>
      )}
    </div>
  );
}
