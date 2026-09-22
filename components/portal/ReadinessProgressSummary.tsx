'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { SectionHeader, StatusTag, useAnnounce } from '@/components/portal/kit';
import type { ReadinessPriorityAction } from '@/lib/readiness/progressView';
import {
  splitReadinessSummary,
  type ReadinessRecapBreakdown,
  type ReadinessSummarySource,
} from '@/lib/readiness/progressSummary';

type SummaryResponse = {
  source?: ReadinessSummarySource;
  summary?: string;
  error?: string;
};

function sourceTone(source: ReadinessSummarySource): 'ok' | 'info' | 'warn' | 'danger' {
  switch (source) {
    case 'ai':
      return 'ok';
    case 'factual':
      return 'info';
    case 'error':
      return 'danger';
    default: {
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}

function sourceLabel(source: ReadinessSummarySource, generating: boolean): string {
  if (generating) return 'Writing recap';
  switch (source) {
    case 'ai':
      return 'AI recap';
    case 'factual':
      return 'From your numbers';
    case 'error':
      return 'Couldn’t load';
    default: {
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}

/**
 * The numbers, printed by the card itself so no model can garble them:
 * points earned of max, the capped score, and one row per scored area with
 * the lowest area tagged. The AI text below only explains and points forward.
 */
function RecapBreakdown({ breakdown }: { breakdown: ReadinessRecapBreakdown }) {
  const capped = breakdown.overallEarned > breakdown.overallScore;
  return (
    <div data-testid="readiness-recap-breakdown" className="wa-mb-3">
      <p className="wa-kit-lede" style={{ color: 'var(--wa-text)' }}>
        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>
          {breakdown.overallEarned} of {breakdown.overallMax} points
        </strong>
        {' '}
        <span style={{ color: 'var(--wa-muted)' }}>
          {capped
            ? `shows as a score of ${breakdown.overallScore} (capped at 100).`
            : `is a score of ${breakdown.overallScore} out of 100.`}
        </span>
      </p>
      <ul
        aria-label="Points by area"
        style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'grid', gap: 6 }}
      >
        {breakdown.categories.map((cat) => {
          const lowest = cat.key === breakdown.weakestKey;
          return (
            <li
              key={cat.key}
              data-area={cat.key}
              data-lowest={lowest ? 'true' : undefined}
              className="wa-flex wa-items-center wa-justify-between wa-gap-3"
              style={{
                fontSize: 'var(--wa-type-body)',
                lineHeight: 1.4,
                padding: '6px 0',
                borderTop: '1px solid var(--wa-border)',
              }}
            >
              <span className="wa-flex wa-items-center wa-gap-2" style={{ minWidth: 0 }}>
                <span style={{ color: 'var(--wa-text)', fontWeight: lowest ? 700 : 500 }}>{cat.label}</span>
                {lowest ? (
                  <>
                    {' '}
                    <StatusTag tone="warn">Lowest</StatusTag>
                  </>
                ) : null}
              </span>
              {' '}
              <span
                style={{ flexShrink: 0, color: 'var(--wa-muted)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
              >
                {cat.earned}/{cat.max}
                <span aria-hidden="true"> · </span>
                <span style={{ color: cat.pct >= 100 ? 'var(--wa-success)' : 'var(--wa-text)', fontWeight: 600 }}>
                  {cat.pct}%
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Kit-token progress recap for `/dashboard/readiness`.
 * Prints the breakdown from the score model, then the server-built factual
 * note; may replace the note with an AI rewrite that passed the grounding
 * check. The primary CTA is the same `priorityAction` the whole page uses
 * (weakest area first), so text and button never disagree.
 * Never paints Astryx inside the kit page.
 */
export function ReadinessProgressSummary({
  factualSummary,
  nextAction,
  breakdown = null,
  coachHref = '/dashboard/ai-tools/studio?tab=session&agent=readiness',
  enableGeneration = true,
  loadFailed = false,
}: {
  factualSummary: string;
  nextAction: ReadinessPriorityAction | null;
  breakdown?: ReadinessRecapBreakdown | null;
  coachHref?: string;
  enableGeneration?: boolean;
  loadFailed?: boolean;
}) {
  const announce = useAnnounce();
  const [summary, setSummary] = useState(factualSummary);
  const [source, setSource] = useState<ReadinessSummarySource>(loadFailed ? 'error' : 'factual');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    setSummary(factualSummary);
    setSource(loadFailed ? 'error' : 'factual');
  }, [factualSummary, loadFailed]);

  useEffect(() => {
    if (!enableGeneration || loadFailed) return;
    const ac = new AbortController();
    setGenerating(true);
    void (async () => {
      try {
        const res = await fetch('/api/member/readiness/summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: ac.signal,
        });
        const data = (await res.json().catch(() => ({}))) as SummaryResponse;
        if (ac.signal.aborted) return;
        if (!res.ok || !data.summary) return;
        if (data.source === 'ai' || data.source === 'factual' || data.source === 'error') {
          setSource(data.source);
        }
        setSummary(data.summary);
        if (data.source === 'ai') {
          announce('Updated progress recap');
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      } finally {
        if (!ac.signal.aborted) setGenerating(false);
      }
    })();
    return () => ac.abort();
  }, [announce, enableGeneration, loadFailed]);

  return (
    <section
      className="wa-kit-card"
      aria-label="What this score means"
      data-testid="readiness-progress-summary"
    >
      <SectionHeader
        kicker="Coach note"
        title="What this score means"
        goal="Why the numbers look this way, and what to do next."
        className="wa-mb-3"
        action={
          <StatusTag tone={generating ? 'muted' : sourceTone(source)}>
            <span className="wa-inline-flex wa-items-center wa-gap-1">
              <Sparkles size={14} aria-hidden="true" />
              {sourceLabel(source, generating)}
            </span>
          </StatusTag>
        }
      />
      {breakdown && !loadFailed ? <RecapBreakdown breakdown={breakdown} /> : null}
      <div data-testid="readiness-progress-summary-text" style={{ display: 'grid', gap: 8 }}>
        {splitReadinessSummary(summary).map((paragraph, i) => (
          <p key={i} className="wa-kit-lede">
            {paragraph}
          </p>
        ))}
      </div>
      <div className="wa-flex wa-flex-wrap wa-gap-3" style={{ marginTop: 16 }}>
        {nextAction ? (
          <a
            href={nextAction.href}
            className="wa-kit-cta wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none"
          >
            <ArrowRight size={14} aria-hidden="true" />
            {nextAction.ctaLabel}
          </a>
        ) : null}
        <a
          href={coachHref}
          className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus hover:wa-opacity-90"
        >
          Open readiness coach
        </a>
      </div>
    </section>
  );
}
