'use client';

import { Layers } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import ResumeStudioClient from '@/components/portal/ResumeStudioClient';
import type { ResumeScorePayload } from '@/components/portal/tools/ResumeScoreBreakdown';
import { DesignSurface, KpiStrip, PageOpener, ProgressBar, StatusTag } from '@/components/portal/kit';
import { Avatar } from '@/components/portal/kit/Avatar';
import type { AssignedCounselor } from '@/lib/member/counselorContext';
import type { ReactNode } from 'react';

/**
 * Member Portal — resume studio (score / rewrite / coach).
 * Direction C chrome around ResumeStudioClient. History is omitted in preview.
 *
 * Target route: app/(portal)/dashboard/ai-tools/resume-studio
 * Proof: /dev/member/resume-studio
 * Surface: warm (member-facing).
 */

export interface ResumeStudioVersion {
  title: string;
  saved: string;
  score?: number;
  href?: string;
}

export interface ResumeStudioFix {
  title: string;
  body: string;
  tag: 'highImpact' | 'keywordGap' | 'formatting';
}

export function ResumeStudioKit({
  hasResume = false,
  scoreHistorySlot,
  rewriteHistorySlot,
  preview = false,
  backHref,
  basePath,
  initialResume,
  initialJobTarget,
  previewScoreOutput,
  previewScorePayload,
  previewRewriteOutput,
  advisor = null,
  score,
  targetListing,
  keywordPct,
  coachName,
  fixes = [],
  versions = [],
  clarityPct,
  metricsPct,
  keywordsPct,
}: {
  hasResume?: boolean;
  scoreHistorySlot?: ReactNode;
  rewriteHistorySlot?: ReactNode;
  preview?: boolean;
  backHref?: string;
  basePath?: string;
  initialResume?: string;
  initialJobTarget?: string;
  previewScoreOutput?: string;
  previewScorePayload?: ResumeScorePayload | null;
  previewRewriteOutput?: string;
  advisor?: AssignedCounselor | null;
  score?: number;
  targetListing?: string;
  keywordPct?: number;
  coachName?: string;
  fixes?: ResumeStudioFix[];
  versions?: ResumeStudioVersion[];
  clarityPct?: number;
  metricsPct?: number;
  keywordsPct?: number;
}) {
  const t = useTranslations('dashboard.resumeC');
  const health = score ?? previewScorePayload?.composite;
  const listedTarget = targetListing ?? initialJobTarget;
  const coach = coachName ?? advisor?.name;
  const hubHref = backHref ?? '/dashboard/ai-tools';
  const rewriteHref = `${basePath ?? '/dashboard/ai-tools/resume-studio'}?view=rewrite`;
  const coachHref = advisor?.messagingHref ?? `${basePath ?? '/dashboard/ai-tools/resume-studio'}?view=coach`;

  return (
    <DesignSurface surface="warm">
      <div style={{ maxWidth: 1180, margin: '0 auto', padding: 'var(--wa-pad-sm)' }} className="wa-space-y-5">
        <PageOpener
          kicker={t('kicker')}
          title={t('claim', { score: health ?? '—' })}
          lede={t('lede')}
          icon={<Layers size={13} aria-hidden="true" />}
          action={
            <Link href={hubHref} className="wa-page-action wa-kit-focus">
              {t('score')} / {t('rewrite')} / {t('coach')}
            </Link>
          }
        />
        <div className="wa-kit-card">
          <KpiStrip
            items={[
              {
                label: t('kpiHealth'),
                value: typeof health === 'number' ? health : '—',
                delta: typeof health === 'number' ? t('kpiBaseline', { score: health }) : undefined,
                deltaTone: 'muted',
              },
              {
                label: t('kpiScreening'),
                value: t('kpiFixes', { count: fixes.length || (hasResume ? 0 : 0) }),
                tone: fixes.length > 0 ? 'warn' : undefined,
              },
              {
                label: t('kpiTarget'),
                value: listedTarget ?? '—',
              },
              {
                label: t('kpiKeywords'),
                value: typeof keywordPct === 'number' ? `${keywordPct}%` : '—',
              },
              {
                label: t('kpiCoach'),
                value: coach ?? '—',
              },
            ]}
          />
        </div>
        <div className="wa-dense-grid wa-dense-grid--3">
          <section className="wa-kit-card" aria-labelledby="resume-diagnostics-heading">
            <div className="wa-flex wa-items-center wa-justify-between" style={{ marginBottom: 12 }}>
              <h2 id="resume-diagnostics-heading" style={{ margin: 0, fontWeight: 800, fontSize: 'var(--wa-type-body)' }}>{t('diagnostics')}</h2>
              <StatusTag tone={fixes.length > 0 ? 'warn' : 'muted'}>{t('kpiScreening')}</StatusTag>
            </div>
            <div className="wa-space-y-3">
              <div>
                <p className="wa-kit-meta" style={{ margin: '0 0 6px', fontWeight: 700 }}>{t('clarity')}</p>
                <ProgressBar pct={clarityPct ?? previewScorePayload?.pillars?.structural?.score ?? 0} aria-label={t('clarity')} />
              </div>
              <div>
                <p className="wa-kit-meta" style={{ margin: '0 0 6px', fontWeight: 700 }}>{t('metrics')}</p>
                <ProgressBar pct={metricsPct ?? previewScorePayload?.structural?.breakdown.quantification.score ?? 0} aria-label={t('metrics')} />
              </div>
              <div>
                <p className="wa-kit-meta" style={{ margin: '0 0 6px', fontWeight: 700 }}>{t('keywords')}</p>
                <ProgressBar pct={keywordsPct ?? keywordPct ?? previewScorePayload?.pillars?.marketCoverage?.score ?? 0} aria-label={t('keywords')} />
              </div>
            </div>
            {fixes.length > 0 ? (
              <ul style={{ listStyle: 'none', margin: '16px 0 0', padding: 0, display: 'grid', gap: 10 }}>
                {fixes.map((fix) => (
                  <li key={fix.title}>
                    <div className="wa-flex wa-items-center wa-justify-between wa-gap-2">
                      <strong>{fix.title}</strong>
                      <StatusTag tone={fix.tag === 'highImpact' ? 'warn' : fix.tag === 'keywordGap' ? 'info' : 'muted'}>
                        {t(fix.tag)}
                      </StatusTag>
                    </div>
                    <p className="wa-kit-lede" style={{ margin: '4px 0 0' }}>{fix.body}</p>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="wa-flex wa-items-center wa-gap-3 wa-flex-wrap" style={{ marginTop: 16 }}>
              <Link href={rewriteHref} className="wa-kit-cta wa-kit-focus" style={{ textDecoration: 'none' }}>{t('rewriteFixes')}</Link>
              <Link href={coachHref} className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus" style={{ textDecoration: 'none' }}>{t('reviewCoach')}</Link>
            </div>
          </section>
          <section className="wa-kit-card" aria-labelledby="resume-draft-heading">
            <div className="wa-flex wa-items-center wa-justify-between" style={{ marginBottom: 12 }}>
              <h2 id="resume-draft-heading" style={{ margin: 0, fontWeight: 800, fontSize: 'var(--wa-type-body)' }}>{t('workingDraft')}</h2>
              <StatusTag tone={hasResume ? 'ok' : 'muted'}>{t('draftReady')}</StatusTag>
            </div>
            <ResumeStudioClient
              hasResume={hasResume}
              scoreHistorySlot={scoreHistorySlot}
              rewriteHistorySlot={rewriteHistorySlot}
              preview={preview}
              basePath={basePath}
              initialResume={initialResume}
              initialJobTarget={initialJobTarget}
              previewScoreOutput={previewScoreOutput}
              previewScorePayload={previewScorePayload}
              previewRewriteOutput={previewRewriteOutput}
            />
          </section>
          <div className="wa-space-y-5">
            <section className="wa-kit-card" aria-labelledby="resume-versions-heading">
              <div className="wa-flex wa-items-center wa-justify-between" style={{ marginBottom: 12 }}>
                <h2 id="resume-versions-heading" style={{ margin: 0, fontWeight: 800, fontSize: 'var(--wa-type-body)' }}>{t('recentVersions')}</h2>
                <span className="wa-kit-meta">{t('allVersions')}</span>
              </div>
              <p className="wa-kit-meta" style={{ margin: '0 0 10px' }}>{t('savedIterations')}</p>
              {versions.length > 0 ? (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
                  {versions.map((version) => (
                    <li key={`${version.title}-${version.saved}`} className="wa-flex wa-items-center wa-justify-between wa-gap-3">
                      <div>
                        <strong style={{ display: 'block' }}>{version.title}</strong>
                        <span className="wa-kit-meta">{version.saved}{typeof version.score === 'number' ? ` · ${version.score}` : ''}</span>
                      </div>
                      {version.href ? (
                        <Link href={version.href} className="wa-kit-focus" style={{ color: 'var(--wa-accent)', fontWeight: 700, minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
                          {t('viewVersion')}
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
            {advisor ? (
              <section className="wa-kit-card" aria-labelledby="resume-advisor-heading">
                <div className="wa-flex wa-items-center wa-gap-3">
                  <Avatar initials={advisor.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('') || '?'} size={44} src={advisor.avatar ?? undefined} />
                  <div>
                    <h2 id="resume-advisor-heading" style={{ margin: 0, fontWeight: 800, fontSize: 'var(--wa-type-body)' }}>{advisor.name}</h2>
                    <p className="wa-kit-meta" style={{ margin: 0 }}>{t('assignedAdvisor')}</p>
                  </div>
                </div>
                <p className="wa-kit-lede" style={{ margin: '10px 0 0' }}>{t('advisorPrompt')}</p>
                <div style={{ marginTop: 12 }}>
                  <Link href={advisor.messagingHref} className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus" style={{ textDecoration: 'none' }}>
                    {t('messageAdvisor', { name: advisor.firstName })}
                  </Link>
                </div>
              </section>
            ) : null}
          </div>
        </div>
        <p className="wa-kit-meta" style={{ textAlign: 'center' }}>{t('footerNote')}</p>
      </div>
    </DesignSurface>
  );
}
