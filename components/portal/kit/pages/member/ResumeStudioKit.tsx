'use client';

import { Layers } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
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

export interface ResumeStudioRewritePreview {
  previous: string;
  suggested: string;
  points?: number;
  summary?: string;
  targetEmployer?: string;
  targetRole?: string;
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
  rewritePreview,
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
  rewritePreview?: ResumeStudioRewritePreview;
}) {
  const t = useTranslations('dashboard.resumeC');
  const [acceptedRewrite, setAcceptedRewrite] = useState(false);
  const [editingRewrite, setEditingRewrite] = useState(false);
  const [draftBullet, setDraftBullet] = useState(rewritePreview?.suggested ?? '');
  const health = score ?? previewScorePayload?.composite;
  const listedTarget = targetListing ?? initialJobTarget;
  const coach = coachName ?? advisor?.name;
  const hubHref = backHref ?? '/dashboard/ai-tools';
  const studioBase = basePath ?? '/dashboard/ai-tools/resume-studio';
  const rewriteHref = `${studioBase}?view=rewrite`;
  const coachHref = advisor?.messagingHref ?? `${studioBase}?view=coach`;
  const analyzeHref = `${studioBase}?view=score`;
  const hasAnalysis =
    typeof health === 'number' ||
    previewScorePayload != null ||
    typeof clarityPct === 'number' ||
    typeof metricsPct === 'number' ||
    typeof keywordsPct === 'number' ||
    typeof keywordPct === 'number' ||
    fixes.length > 0;
  const clarityValue = hasAnalysis ? (clarityPct ?? previewScorePayload?.pillars?.structural?.score) : undefined;
  const metricsValue = hasAnalysis ? (metricsPct ?? previewScorePayload?.structural?.breakdown.quantification.score) : undefined;
  const keywordsValue = hasAnalysis ? (keywordsPct ?? keywordPct ?? previewScorePayload?.pillars?.marketCoverage?.score) : undefined;

  return (
    <DesignSurface surface="warm">
      <div className="wa-dense-page wa-space-y-5">
        <PageOpener
          kicker={t('kicker')}
          title={hasAnalysis ? t('claim', { score: health ?? '—' }) : t('claimUnknown')}
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
            responsive="member"
            items={[
              {
                label: t('kpiHealth'),
                value: typeof health === 'number' ? health : '—',
                delta: typeof health === 'number' ? t('kpiBaseline', { score: health }) : undefined,
                deltaTone: 'muted',
              },
              {
                label: t('kpiScreening'),
                value: hasAnalysis ? t('kpiFixes', { count: fixes.length }) : t('kpiFixesUnknown'),
                tone: hasAnalysis && fixes.length > 0 ? 'warn' : undefined,
              },
              {
                label: t('kpiTarget'),
                value: listedTarget ?? '—',
              },
              {
                label: t('kpiKeywords'),
                value: typeof keywordPct === 'number' && hasAnalysis ? `${keywordPct}%` : '—',
              },
              {
                label: t('kpiCoach'),
                value: coach ?? '—',
              },
            ]}
          />
        </div>
        <section className="wa-kit-card" aria-labelledby="resume-diagnostics-heading">
          <div className="wa-flex wa-items-center wa-justify-between" style={{ marginBottom: 12 }}>
            <h2 id="resume-diagnostics-heading" style={{ margin: 0, fontWeight: 800, fontSize: 'var(--wa-type-body)' }}>{t('diagnostics')}</h2>
            <StatusTag tone={fixes.length > 0 ? 'warn' : 'muted'}>{t('kpiScreening')}</StatusTag>
          </div>
          {hasAnalysis ? (
          <div className="wa-dense-grid wa-dense-grid--3">
            <div>
              <p className="wa-kit-meta" style={{ margin: '0 0 6px', fontWeight: 700 }}>{t('clarity')}</p>
              {typeof clarityValue === 'number' ? <ProgressBar pct={clarityValue} aria-label={t('clarity')} /> : <p className="wa-kit-meta">{t('kpiFixesUnknown')}</p>}
            </div>
            <div>
              <p className="wa-kit-meta" style={{ margin: '0 0 6px', fontWeight: 700 }}>{t('metrics')}</p>
              {typeof metricsValue === 'number' ? <ProgressBar pct={metricsValue} aria-label={t('metrics')} /> : <p className="wa-kit-meta">{t('kpiFixesUnknown')}</p>}
            </div>
            <div>
              <p className="wa-kit-meta" style={{ margin: '0 0 6px', fontWeight: 700 }}>{t('keywords')}</p>
              {typeof keywordsValue === 'number' ? <ProgressBar pct={keywordsValue} aria-label={t('keywords')} /> : <p className="wa-kit-meta">{t('kpiFixesUnknown')}</p>}
            </div>
          </div>
          ) : (
            <div data-testid="resume-studio-analysis-unknown" style={{ marginTop: 4 }}>
              <p style={{ margin: 0, fontWeight: 800 }}>{t('analysisUnknownTitle')}</p>
              <p className="wa-kit-lede" style={{ margin: '6px 0 0' }}>{t('analysisUnknownBody')}</p>
            </div>
          )}
          {hasAnalysis && fixes.length > 0 ? (
            <ul className="wa-dense-grid wa-dense-grid--3" style={{ listStyle: 'none', margin: '12px 0 0', padding: 0 }}>
              {fixes.map((fix) => (
                <li key={fix.title} className="wa-kit-card wa-kit-card--sm">
                  <div className="wa-flex wa-items-center wa-justify-between wa-flex-wrap wa-gap-2">
                    <strong style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{fix.title}</strong>
                    <StatusTag tone={fix.tag === 'highImpact' ? 'warn' : fix.tag === 'keywordGap' ? 'info' : 'muted'}>
                      {t(fix.tag)}
                    </StatusTag>
                  </div>
                  <p className="wa-kit-lede" style={{ margin: '6px 0 0' }}>{fix.body}</p>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="wa-flex wa-items-center wa-gap-3 wa-flex-wrap" style={{ marginTop: 12 }}>
            {hasAnalysis ? (
              <Link href={rewriteHref} className="wa-kit-cta wa-kit-focus" style={{ textDecoration: 'none' }}>{t('rewriteFixes')}</Link>
            ) : (
              <Link href={analyzeHref} className="wa-kit-cta wa-kit-focus" style={{ textDecoration: 'none' }}>{t('runAnalysis')}</Link>
            )}
            <Link href={coachHref} className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus" style={{ textDecoration: 'none' }}>{t('reviewCoach')}</Link>
          </div>
        </section>
        <div className="wa-dense-grid wa-dense-grid--resume-stage">
          <section className="wa-kit-card" aria-labelledby="resume-draft-heading">
            <div className="wa-flex wa-items-center wa-justify-between" style={{ marginBottom: 10 }}>
              <h2 id="resume-draft-heading" style={{ margin: 0, fontWeight: 800, fontSize: 'var(--wa-type-body)' }}>{t('workingDraft')}</h2>
              <StatusTag tone={hasResume ? 'ok' : 'muted'}>{t('draftReady')}</StatusTag>
            </div>
            {rewritePreview ? (
              <div className="wa-space-y-3">
                {rewritePreview.targetEmployer || rewritePreview.targetRole ? (
                  <p className="wa-kit-meta" style={{ margin: 0 }}>
                    {t('targetEmployer')}{' '}
                    <strong>{[rewritePreview.targetEmployer, rewritePreview.targetRole].filter(Boolean).join(' · ')}</strong>
                  </p>
                ) : null}
                <div className="wa-dense-grid wa-dense-grid--2">
                  <div className="wa-kit-card wa-kit-card--sm">
                    <p className="wa-kit-meta" style={{ margin: '0 0 6px', fontWeight: 700 }}>{t('experienceBullet')}</p>
                    <p className="wa-kit-lede" style={{ margin: 0 }}>
                      {t('previousVersion')} {acceptedRewrite ? draftBullet : rewritePreview.previous}
                    </p>
                  </div>
                  {!acceptedRewrite ? (
                    <div className="wa-kit-card wa-kit-card--sm" style={{ background: 'var(--wa-success-soft)' }}>
                      <p className="wa-kit-meta" style={{ margin: '0 0 6px', fontWeight: 700, color: 'var(--wa-success-dark)' }}>
                        {typeof rewritePreview.points === 'number' ? t('suggestedRewritePts', { points: rewritePreview.points }) : t('suggestedRewrite')}
                      </p>
                      {editingRewrite ? (
                        <textarea
                          className="wa-kit-focus"
                          value={draftBullet}
                          onChange={(event) => setDraftBullet(event.target.value)}
                          rows={3}
                          style={{ width: '100%', minHeight: 72, resize: 'vertical', border: '1px solid var(--wa-control-border)', borderRadius: 'var(--wa-radius-sm)', padding: '0.6rem 0.75rem', background: 'var(--wa-surface)', color: 'var(--wa-text)', font: 'inherit' }}
                        />
                      ) : (
                        <p className="wa-kit-lede" style={{ margin: 0 }}>{draftBullet}</p>
                      )}
                      <div className="wa-flex wa-items-center wa-gap-3 wa-flex-wrap" style={{ marginTop: 10 }}>
                        <button type="button" className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus" onClick={() => setEditingRewrite((open) => !open)}>
                          {t('edit')}
                        </button>
                        <button type="button" className="wa-kit-cta wa-kit-focus" onClick={() => { setAcceptedRewrite(true); setEditingRewrite(false); }}>
                          {t('acceptChange')}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
                {rewritePreview.summary ? (
                  <div className="wa-kit-card wa-kit-card--sm">
                    <p className="wa-kit-meta" style={{ margin: '0 0 6px', fontWeight: 700 }}>{t('professionalSummary')}</p>
                    <p className="wa-kit-lede" style={{ margin: 0 }}>{rewritePreview.summary}</p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
          <div className="wa-space-y-5">
            <section className="wa-kit-card" aria-labelledby="resume-versions-heading">
              <div className="wa-flex wa-items-center wa-justify-between" style={{ marginBottom: 8 }}>
                <h2 id="resume-versions-heading" style={{ margin: 0, fontWeight: 800, fontSize: 'var(--wa-type-body)' }}>{t('recentVersions')}</h2>
                <span className="wa-kit-meta">{t('allVersions')}</span>
              </div>
              <p className="wa-kit-meta" style={{ margin: '0 0 8px' }}>{t('savedIterations')}</p>
              {versions.length > 0 ? (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                  {versions.map((version) => (
                    <li key={`${version.title}-${version.saved}`} className="wa-flex wa-items-center wa-justify-between wa-gap-3">
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ display: 'block' }}>{version.title}</strong>
                        <span className="wa-kit-meta">{version.saved}{typeof version.score === 'number' ? ` · ${version.score}` : ''}</span>
                      </div>
                      {version.href ? (
                        <Link href={version.href} className="wa-kit-focus" style={{ color: 'var(--wa-accent)', fontWeight: 700, minHeight: 44, display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
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
                <p className="wa-kit-lede" style={{ margin: '8px 0 0' }}>{t('advisorPrompt')}</p>
                <div style={{ marginTop: 10 }}>
                  <Link href={advisor.messagingHref} className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus" style={{ textDecoration: 'none' }}>
                    {t('messageAdvisor', { name: advisor.firstName })}
                  </Link>
                </div>
              </section>
            ) : null}
          </div>
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
        <p className="wa-kit-meta" style={{ textAlign: 'center', margin: 0 }}>{t('footerNote')}</p>
      </div>
    </DesignSurface>
  );
}
