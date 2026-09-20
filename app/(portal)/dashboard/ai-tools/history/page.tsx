import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { FolderOpen, History as HistoryIcon } from 'lucide-react';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import AIHistoryList from '@/components/portal/AIHistoryList';
import MobileBottomNav from '@/components/MobileBottomNav';
import PageHeader from '@/components/portal/PageHeader';
import { DesignSurface } from '@/components/portal/kit';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard');
  return buildPageMetadataAsync({
    title: t('historyMetaTitle'),
    description: t('historyMetaDesc'),
    path: '/dashboard/ai-tools/history',
  });
}

const TOOL_LABELS: Record<string, string> = {
  job_match_scorer: 'Job Match Scorer',
  resume_analysis: 'Resume Analysis',
  resume_rewriter: 'Resume Rewriter',
  cover_letter: 'Cover Letter',
  interview_practice: 'Interview Practice',
  linkedin_headline: 'LinkedIn Headline',
  linkedin_about: 'LinkedIn About',
  salary_negotiation: 'Salary Negotiation',
  gap_analyzer: 'Gap Analyzer',
  interview_coach: 'AI Interview Coach',
  voice_interview_video: 'Mock Interview Video',
  career_counselor: 'Lilley Career Coach',
  skill_assessment: 'Skill Mapper / Skill Assessment',
};

function getHistoryToolLabel(toolType: string, output: string): string {
  if (toolType === 'career_counselor') {
    try {
      const parsed = JSON.parse(output) as { type?: string };
      if (parsed?.type === 'elevator_pitch') return 'AI Elevator Introduction';
    } catch {
      // ignore
    }
  }
  return TOOL_LABELS[toolType] ?? toolType;
}

type Props = { searchParams: Promise<{ tool?: string }> };

export default async function AIHistoryPage({ searchParams }: Props) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/ai-tools/history');

  const { tool } = await searchParams;

  let results: Awaited<ReturnType<typeof prisma.aIToolResult.findMany>> = [];
  let historyLoadFailed = false;
  try {
    results = await prisma.aIToolResult.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  } catch (error) {
    historyLoadFailed = true;
    console.error('[ai-tools/history] saved results query failed', error);
  }

  const withLabels = results.map((r) => ({
    ...r,
    toolLabel: getHistoryToolLabel(r.toolType, r.output),
  }));

  return (
    <DesignSurface surface="warm">
      <div style={{ background: 'var(--wa-bg)', minHeight: '100vh' }}>
        {historyLoadFailed ? <span hidden data-portal-error-state="ai-tools-history-load" /> : null}
        <div
          style={{
            padding: '1.25rem 2rem 1.5rem',
            borderBottom: '1px solid var(--wa-border)',
            background: 'var(--wa-surface)',
          }}
        >
          <PageHeader
            title="My AI results"
            subtitle="Revisit your past resume rewrites, cover letters, interview questions, voice coach sessions, and headlines."
            breadcrumbs={[
              { label: 'AI Career Tools', href: '/dashboard/ai-tools' },
              { label: 'History' },
            ]}
          />
        </div>

        {/* Main content */}
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem 1.5rem 6rem' }}>
          {withLabels.length === 0 ? (
            <div className="wa-kit-card" style={{ padding: '3rem 2rem', textAlign: 'center' }}>
              <div
                aria-hidden="true"
                style={{
                  width: 56,
                  height: 56,
                  margin: '0 auto 0.9rem',
                  borderRadius: 'var(--wa-radius-sm)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'color-mix(in srgb, var(--wa-accent) 12%, transparent)',
                  color: 'var(--wa-accent)',
                }}
              >
                <FolderOpen size={26} />
              </div>
              <p style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--wa-text)', margin: '0 0 0.375rem', letterSpacing: '-0.01em' }}>
                No saved results yet
              </p>
              <p style={{ color: 'var(--wa-muted)', marginBottom: '1.25rem', fontSize: '0.875rem' }}>
                Start with the Resume Rewriter or Interview Practice — your outputs save here automatically.
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                <Link href="/dashboard/ai-tools/resume-studio?view=rewrite" className="btn btn-primary btn-sm">
                  Start with Resume Rewriter
                </Link>
                <Link href="/dashboard/ai-tools/interview-practice" className="btn btn-muted btn-sm">
                  Try Interview Practice
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="wa-flex wa-items-center wa-gap-2" style={{ marginBottom: '0.875rem' }}>
                <HistoryIcon size={16} color="var(--wa-accent)" aria-hidden="true" />
                <span className="wa-kit-stat-label" style={{ fontSize: 13 }}>
                  {withLabels.length} saved result{withLabels.length !== 1 ? 's' : ''}
                </span>
              </div>
              <AIHistoryList results={withLabels} initialFilter={tool ?? ''} />
            </>
          )}
        </div>
      </div>
      <MobileBottomNav variant="portal" />
    </DesignSurface>
  );
}
