'use client';

import { useState } from 'react';
import {
  ChevronDown,
  Sparkles,
  Target,
  BarChart3,
  FileText,
  Mail,
  Mic,
  MessagesSquare,
  Video,
  IdCard,
  UserRound,
  Wallet,
  Compass,
  Brain,
  Radar,
  type LucideIcon,
} from 'lucide-react';
import { formatPortalDate } from '@/lib/formatDate';
import AiResultRenderer from '@/components/portal/AiResultRenderer';
import { colorVar, type KitColor } from '@/components/portal/kit';

const TOOL_ICONS: Record<string, LucideIcon> = {
  job_match_scorer: Target,
  resume_analysis: BarChart3,
  resume_rewriter: FileText,
  cover_letter: Mail,
  interview_practice: Mic,
  interview_coach: MessagesSquare,
  voice_interview_video: Video,
  linkedin_headline: IdCard,
  linkedin_about: UserRound,
  salary_negotiation: Wallet,
  gap_analyzer: Compass,
  career_counselor: Brain,
  skill_assessment: Radar,
};

const TOOL_ACCENT: Record<string, KitColor> = {
  resume_rewriter: 'accent',
  cover_letter: 'info',
  interview_practice: 'success',
  interview_coach: 'success',
  linkedin_headline: 'info',
  linkedin_about: 'info',
  salary_negotiation: 'gold',
  skill_assessment: 'accent',
  job_match_scorer: 'accent',
};

type Result = {
  id: string;
  toolType: string;
  toolLabel: string;
  inputSummary: string;
  output: string;
  createdAt: Date;
};

const FILTER_OPTIONS = [
  { value: '', label: 'All tools' },
  { value: 'resume_rewriter', label: 'Resume Rewriter' },
  { value: 'cover_letter', label: 'Cover Letter' },
  { value: 'interview_practice', label: 'Interview Practice' },
  { value: 'interview_coach', label: 'AI Interview Coach' },
  { value: 'linkedin_headline', label: 'LinkedIn Headline' },
  { value: 'linkedin_about', label: 'LinkedIn About' },
  { value: 'skill_assessment', label: 'Find skills employers want' },
  { value: 'job_match_scorer', label: 'See how you match a job' },
  { value: 'resume_analysis', label: 'Resume Analysis' },
  { value: 'salary_negotiation', label: 'Salary Negotiation' },
  { value: 'gap_analyzer', label: 'See what is missing for a job' },
  { value: 'career_counselor', label: 'AI Readiness Coach / AI Elevator Introduction' },
  { value: 'voice_interview_video', label: 'Voice Interview Recording' },
];

export default function AIHistoryList({ results, initialFilter = '' }: { results: Result[]; initialFilter?: string }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>(initialFilter);

  const filtered = filter
    ? results.filter((r) => r.toolType === filter)
    : results;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Filter row */}
      <div className="wa-kit-card wa-kit-card--sm" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <label htmlFor="ai-history-filter" className="wa-kit-field-label" style={{ fontSize: '0.8125rem' }}>
          Filter
        </label>
        <select
          id="ai-history-filter"
          value={filter}
          onChange={(e) => { setFilter(e.target.value); setExpandedId(null); }}
          className="wa-kit-focus"
          style={{
            padding: '0.4rem 0.75rem',
            borderRadius: 'var(--wa-radius-sm)',
            border: '1px solid var(--wa-border)',
            background: 'var(--wa-surface)',
            color: 'var(--wa-text)',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {filter && (
          <button
            type="button"
            onClick={() => { setFilter(''); setExpandedId(null); }}
            className="wa-kit-focus"
            style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--wa-accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            Clear
          </button>
        )}
        <span style={{ fontSize: '0.8125rem', color: 'var(--wa-muted)', marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>
          {filtered.length} result{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Result cards */}
      {filtered.length === 0 ? (
        <div className="wa-kit-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--wa-muted)', margin: 0 }}>No results for this filter.</p>
        </div>
      ) : (
        filtered.map((r) => {
          const isExpanded = expandedId === r.id;
          const Icon = TOOL_ICONS[r.toolType] ?? Sparkles;
          const accent = colorVar(TOOL_ACCENT[r.toolType] ?? 'accent');

          return (
            <div key={r.id} className="wa-kit-card wa-kit-card--hover" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Card header */}
              <button
                type="button"
                aria-expanded={isExpanded}
                aria-controls={`ai-history-panel-${r.id}`}
                aria-label={isExpanded ? 'Collapse details for ' + r.toolLabel : 'Expand details for ' + r.toolLabel}
                onClick={() => setExpandedId(isExpanded ? null : r.id)}
                className="wa-kit-focus"
                style={{ width: '100%', textAlign: 'left', padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.875rem', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                {/* Tool icon */}
                <div
                  aria-hidden="true"
                  style={{
                    width: '2.5rem',
                    height: '2.5rem',
                    borderRadius: 'var(--wa-radius-sm)',
                    background: `color-mix(in srgb, ${accent} 12%, transparent)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    color: accent,
                  }}
                >
                  <Icon size={19} />
                </div>
                {/* Label + summary */}
                <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--wa-text)' }}>{r.toolLabel}</span>
                    <span
                      style={{
                        fontSize: '0.8125rem',
                        fontWeight: 700,
                        padding: '0.1rem 0.4rem',
                        borderRadius: '9999px',
                        background: `color-mix(in srgb, ${accent} 10%, transparent)`,
                        color: accent,
                        textTransform: 'uppercase',
                        letterSpacing: '0.07em',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {formatPortalDate(r.createdAt)}
                    </span>
                  </div>
                  {r.inputSummary && (
                    <p style={{ fontSize: '0.8125rem', color: 'var(--wa-muted)', margin: '0.2rem 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.inputSummary}
                    </p>
                  )}
                </div>
                {/* Expand chevron */}
                <ChevronDown
                  size={17}
                  aria-hidden="true"
                  style={{
                    color: 'var(--wa-muted)',
                    flexShrink: 0,
                    transition: 'transform 0.2s',
                    transform: isExpanded ? 'rotate(180deg)' : 'none',
                  }}
                />
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div id={`ai-history-panel-${r.id}`} style={{ padding: '0 1rem 1rem', borderTop: '1px solid var(--wa-border)' }}>
                  <div style={{ paddingTop: '0.875rem' }}>
                    <AiResultRenderer
                      toolType={r.toolType}
                      output={r.output}
                      showCopy
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
