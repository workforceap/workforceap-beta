'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import AiResultRenderer from './AiResultRenderer';
import { formatPortalDate } from '@/lib/formatDate';
import { getAIToolFollowThrough } from '@/lib/member/aiToolFollowThrough';

type Row = { id: string; toolType: string; inputSummary: string; output: string; createdAt: string };

// Sprint R2 — map a saved tool type to the dashboard page that owns it.
// "Regenerate with a different angle" sends the member back to that tool's
// page with `?regenerateFrom=<id>` so the form can repopulate from the
// prior run and POST with `parentToolResultId` set.
const TOOL_TYPE_TO_TOOL_PAGE: Record<string, string> = {
  resume_rewriter: '/dashboard/ai-tools/resume-studio?view=rewrite',
  resume_analysis: '/dashboard/ai-tools/resume-studio?view=rewrite',
  cover_letter: '/dashboard/ai-tools/cover-letter',
  interview_practice: '/dashboard/ai-tools/interview-practice',
  linkedin_about: '/dashboard/ai-tools/linkedin-about',
  linkedin_headline: '/dashboard/ai-tools/linkedin-headline',
  job_match_scorer: '/dashboard/ai-tools/job-match-scorer',
  salary_negotiation: '/dashboard/ai-tools/salary-negotiation',
  gap_analyzer: '/dashboard/ai-tools/gap-analyzer',
  skill_mapper: '/dashboard/ai-tools/skill-mapper',
  elevator_pitch: '/dashboard/ai-tools/elevator-pitch',
};

function getRegenerateHref(toolType: string, priorResultId: string): string | null {
  const page = TOOL_TYPE_TO_TOOL_PAGE[toolType];
  if (!page) return null;
  return `${page}?regenerateFrom=${encodeURIComponent(priorResultId)}`;
}

export default function ToolHistoryPanelClient({ rows }: { rows: Row[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const t = useTranslations('dashboard');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {rows.map((row) => {
        const isExpanded = expandedId === row.id;
        return (
          <div key={row.id} style={{ border: '1px solid var(--outline-variant)', borderRadius: '0.75rem', background: 'var(--surface-container-low)', overflow: 'hidden' }}>
            <button
              type="button"
              aria-expanded={isExpanded}
              aria-controls={`tool-history-panel-${row.id}`}
              aria-label={isExpanded ? "Collapse details" : "Expand details"} onClick={() => setExpandedId(isExpanded ? null : row.id)}
              style={{ width: '100%', textAlign: 'left', padding: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.inputSummary || 'Result'}
                </p>
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0.1rem 0 0' }}>
                  {formatPortalDate(new Date(row.createdAt))}
                </p>
              </div>
              <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: '1rem', color: 'var(--color-on-surface-variant)', flexShrink: 0, transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>
                expand_more
              </span>
            </button>
            {isExpanded && (
              <div id={`tool-history-panel-${row.id}`} style={{ padding: '0 0.875rem 0.875rem', borderTop: '1px solid var(--outline-variant)' }}>
                <div style={{ paddingTop: '0.75rem' }}>
                  <AiResultRenderer
                    toolType={row.toolType}
                    output={row.output}
                    showCopy
                    compact
                  />
                </div>
                {(() => {
                  const next = getAIToolFollowThrough({
                    toolType: row.toolType,
                    inputSummary: row.inputSummary,
                    output: row.output,
                  });
                  const regenerateHref = getRegenerateHref(row.toolType, row.id);
                  return (
                    <div style={{ marginTop: '0.875rem', borderLeft: '4px solid var(--color-accent)', background: 'var(--surface-container)', borderRadius: '0.75rem', padding: '0.875rem' }}>
                      <p style={{ margin: '0 0 0.25rem', fontSize: '0.8125rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-accent)' }}>
                        Do this next
                      </p>
                      <p style={{ margin: '0 0 0.25rem', fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-on-surface)' }}>
                        {next.title}
                      </p>
                      <p style={{ margin: '0 0 0.75rem', fontSize: '0.8125rem', lineHeight: 1.55, color: 'var(--color-on-surface-variant)' }}>
                        {next.body}
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <Link href={next.href} className="btn btn-outline">
                          {next.cta}
                        </Link>
                        {regenerateHref && (
                          <Link
                            href={regenerateHref}
                            className="btn btn-outline"
                            aria-label={t('regenerateDifferentAngle')}
                          >
                            {t('regenerateDifferentAngle')}
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
