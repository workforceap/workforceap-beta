'use client';

import { useMemo, useState, useEffect } from 'react';

const FILLER_RE = /\b(um|uh|like|you know|sort of|kind of|basically|actually)\b/gi;

export type CoachingMetrics = {
  clarity: number;
  confidence: number;
  keywordCoverage: number;
  lastSnippet: string;
  fillerCount: number;
};

function scoreClarity(text: string): number {
  if (!text.trim()) return 0;
  const words = text.trim().split(/\s+/);
  const avgLen =
    words.reduce((a, w) => a + w.replace(/[^a-zA-Z]/g, '').length, 0) / Math.max(words.length, 1);
  const fillers = (text.match(FILLER_RE) ?? []).length;
  const fillerPenalty = Math.min(40, fillers * 12);
  const lengthScore = Math.min(100, words.length * 4);
  const avgScore = Math.min(100, avgLen * 8);
  return Math.max(0, Math.round((lengthScore * 0.35 + avgScore * 0.45 + (100 - fillerPenalty) * 0.2)));
}

function scoreConfidence(text: string): number {
  if (!text.trim()) return 0;
  const words = text.trim().split(/\s+/).length;
  const hedges = (text.match(/\b(maybe|perhaps|i think|might|probably|not sure)\b/gi) ?? []).length;
  const base = Math.min(100, 35 + words * 2);
  return Math.max(0, Math.round(base - hedges * 15));
}

function keywordHits(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.filter((k) => k && lower.includes(k.toLowerCase())).length;
}

type Props = {
  targetRole: string;
  /** Latest user transcript line */
  lastUserText: string;
  className?: string;
};

/**
 * Live coaching readout (heuristic scores from local text — no server round-trip).
 * Pairs with PortalVoiceSession onTranscriptChunk for user lines.
 */
export default function InterviewCoachingPanel({ targetRole, lastUserText, className }: Props) {
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    if (!lastUserText.trim()) return;
    setHistory((h) => [...h.slice(-12), lastUserText]);
  }, [lastUserText]);

  const roleKeywords = useMemo(() => {
    const stop = new Set(['the', 'and', 'for', 'with', 'junior', 'senior', 'lead', 'staff']);
    return targetRole
      .split(/[^a-zA-Z0-9+]+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 2 && !stop.has(w.toLowerCase()))
      .slice(0, 8);
  }, [targetRole]);

  const combined = history.join(' ');
  const metrics: CoachingMetrics = useMemo(() => {
    const clarity = scoreClarity(combined || lastUserText);
    const confidence = scoreConfidence(combined || lastUserText);
    const hits = keywordHits(combined || lastUserText, roleKeywords);
    const keywordCoverage =
      roleKeywords.length === 0 ? 50 : Math.min(100, Math.round((hits / roleKeywords.length) * 100));
    const fillerCount = (combined.match(FILLER_RE) ?? []).length;
    return {
      clarity,
      confidence,
      keywordCoverage,
      lastSnippet: lastUserText.slice(0, 160),
      fillerCount,
    };
  }, [combined, lastUserText, roleKeywords]);

  const bar = (label: string, value: number, color: string) => (
    <div style={{ marginBottom: '0.85rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-on-surface-variant)', marginBottom: '0.35rem' }}>
        <span>{label}</span>
        <span style={{ color: 'var(--color-on-surface)' }}>{value}%</span>
      </div>
      <div
        style={{
          height: 8,
          borderRadius: 999,
          background: 'var(--surface-container-highest)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${value}%`,
            height: '100%',
            borderRadius: 999,
            background: color,
            transition: 'width 0.35s ease',
          }}
        />
      </div>
    </div>
  );

  return (
    <aside
      className={className}
      aria-label="Live coaching feedback"
      style={{
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--outline-variant)',
        background: 'var(--surface-container-low)',
        padding: '1rem 1.1rem',
        minHeight: 280,
      }}
    >
      <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.8125rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-on-surface-variant)' }}>
        Real-time coaching
      </h3>
      <p style={{ margin: '0 0 1rem', fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.45 }}>
        Heuristic scores from your latest answers (clarity, hedging, role keywords). Not a grade — use it to notice patterns.
      </p>
      {bar('Speech clarity', metrics.clarity, '#2563eb')}
      {bar('Confidence', metrics.confidence, 'var(--wa-gold)')}
      {bar('Role keyword use', metrics.keywordCoverage, '#059669')}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.35rem',
          marginBottom: '0.75rem',
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-on-surface-variant)' }}>Watch fillers:</span>
        <span
          style={{
            fontSize: '0.8125rem',
            fontWeight: 700,
            padding: '0.15rem 0.5rem',
            borderRadius: 999,
            background: metrics.fillerCount > 3 ? 'rgba(211,47,47,0.12)' : 'rgba(46,125,50,0.12)',
            color: metrics.fillerCount > 3 ? '#c62828' : '#2e7d32',
          }}
        >
          {metrics.fillerCount} detected
        </span>
      </div>
      {metrics.lastSnippet ? (
        <div
          style={{
            fontSize: '0.8125rem',
            lineHeight: 1.45,
            color: 'var(--color-on-surface)',
            padding: '0.65rem 0.75rem',
            borderRadius: 8,
            background: 'var(--surface-container-highest)',
            border: '1px solid rgba(127,127,127,0.15)',
          }}
        >
          <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-on-surface-variant)' }}>Last answer</span>
          <p style={{ margin: '0.35rem 0 0' }}>{metrics.lastSnippet}{lastUserText.length > 160 ? '…' : ''}</p>
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', fontStyle: 'italic' }}>Speak to see live feedback.</p>
      )}
    </aside>
  );
}
