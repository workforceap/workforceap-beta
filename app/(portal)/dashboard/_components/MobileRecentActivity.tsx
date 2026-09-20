import Link from 'next/link';
import { formatPortalDate } from '@/lib/formatDate';
import { stripMarkdownForPreview } from '@/lib/text/stripMarkdown';
import type { DashboardTranslator, RecentToolSummary } from './types';

/* Recent AI Activity (mobile) - extracted verbatim from page.tsx, including
   the AI_TOOL_LABELS map previously computed inline. */
export default function MobileRecentActivity({
  t,
  recentTools,
}: {
  t: DashboardTranslator;
  recentTools: RecentToolSummary[];
}) {
  const AI_TOOL_LABELS: Record<string, string> = {
    job_match_scorer: t('seeHowYouMatch'),
    resume_analysis: t('resumeAnalysis'),
    resume_rewriter: t('resumeRewriter'),
    cover_letter: t('coverLetter'),
    interview_practice: t('interviewPractice'),
    linkedin_headline: t('linkedinHeadline'),
    linkedin_about: t('linkedinAbout'),
    salary_negotiation: t('salaryNegotiation'),
    gap_analyzer: t('seeWhatIsMissing'),
    interview_coach: t('aiInterviewCoach'),
    career_counselor: t('careerCounselor'),
  };

  return (
        <section style={{ padding: '0 1.25rem', marginBottom: '1.5rem' }} aria-label={t('recentAIActivity')}>
          <div className="portal-dash-section-header">
            <h2 className="portal-dash-section-header__title">{t('recentAIActivity')}</h2>
            {recentTools.length > 0 && <Link href="/dashboard/ai-tools/history" className="portal-dash-section-header__action">{t('viewAllLower')}</Link>}
          </div>
          {recentTools.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {recentTools.map((r) => (
                <div key={r.id} className="portal-activity-item">
                  <div className="portal-activity-item__icon">
                    <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">smart_toy</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-on-surface)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {AI_TOOL_LABELS[r.toolType] ?? r.toolType}
                    </p>
                    {r.inputSummary && (
                      <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', margin: '0.1rem 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {stripMarkdownForPreview(r.inputSummary)}
                      </p>
                    )}
                  </div>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', flexShrink: 0, marginLeft: '0.5rem' }}>
                    {formatPortalDate(r.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="portal-card portal-card--flat" style={{ padding: '1rem', borderRadius: '0.875rem' }}>
              <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-on-surface)' }}>{t('notUsedCareerToolYet')}</p>
              <p style={{ margin: '0.35rem 0 0.75rem', fontSize: '0.8125rem', lineHeight: 1.5, color: 'var(--color-on-surface-variant)' }}>
                {t('tryOneShortTool')}
              </p>
              <Link href="/dashboard/ai-tools/resume-studio?view=rewrite" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                {t('tryResumeTool')}
              </Link>
            </div>
          )}
        </section>
  );
}
