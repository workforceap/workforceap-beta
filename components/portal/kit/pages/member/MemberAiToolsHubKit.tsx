'use client';

import type { CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import {
  AudioLines,
  FileText,
  Flame,
  MailOpen,
  Mic,
  Route,
  Search,
  Sparkles,
  Target,
} from 'lucide-react';
import { DesignSurface, KpiStrip, PageOpener, StatusTag, type KitTone } from '@/components/portal/kit';
import { Avatar } from '@/components/portal/kit/Avatar';
import type { AssignedCounselor } from '@/lib/member/counselorContext';

const DEV_PREFIX = '/dev/member';

const TEXT_LINK: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 44,
  fontWeight: 700,
  color: 'var(--wa-accent)',
  textDecoration: 'none',
};

type TileState = 'done' | 'needsWork' | 'inProgress' | 'ready';

type HubDraft = {
  id: string;
  title: string;
  meta: string;
  saved: string;
  href: string;
};

type HubTile = {
  title: string;
  body: string;
  href: string;
  cta: string;
  Icon: typeof FileText;
  state: TileState;
  usedFor: string;
  usedForHref?: string;
};

function toolHref(hubHref: string, live: string, dev: string): string {
  return hubHref.startsWith(DEV_PREFIX) ? dev : live;
}

function tileStateTag(
  state: TileState,
  t: ReturnType<typeof useTranslations>,
): { tone: KitTone; label: string } {
  switch (state) {
    case 'done':
      return { tone: 'ok', label: t('stateDone') };
    case 'needsWork':
      return { tone: 'warn', label: t('stateNeedsWork') };
    case 'inProgress':
      return { tone: 'info', label: t('stateInProgress') };
    case 'ready':
      return { tone: 'muted', label: t('stateReady') };
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

function advisorInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('') || '?';
}

export function MemberAiToolsHubKit({
  hubHref = '/dashboard/ai-tools',
  advisor = null,
  firstName = '',
  currentStreak = 0,
  longestStreak = 0,
  targetRole,
  targetEmployer,
  currentModuleNumber,
  currentModuleTitle,
  resumeScore = 72,
  mockQuestion = 2,
  mockTotal = 5,
  interviewWhen,
  nextCheckIn,
  jobsHref,
  drafts = [],
}: {
  hubHref?: string;
  advisor?: AssignedCounselor | null;
  firstName?: string;
  currentStreak?: number;
  longestStreak?: number;
  targetRole?: string;
  targetEmployer?: string;
  currentModuleNumber?: number;
  currentModuleTitle?: string;
  resumeScore?: number;
  mockQuestion?: number;
  mockTotal?: number;
  interviewWhen?: string;
  nextCheckIn?: string;
  jobsHref?: string;
  drafts?: HubDraft[];
}) {
  const t = useTranslations('dashboard.aiHub');
  const th = useTranslations('dashboard.home');
  const advisorName = advisor?.firstName ?? advisor?.name;
  const employerLabel = targetEmployer ?? '';
  const roleLabel = targetRole ?? '';
  const jobsLink = jobsHref ?? toolHref(hubHref, '/dashboard/jobs', '/dev/member/jobs');
  const resumeHref = toolHref(hubHref, '/dashboard/ai-tools/resume-studio', '/dev/member/resume-studio');
  const matchHref = toolHref(hubHref, '/dashboard/ai-tools/job-match-scorer', '/dev/member/jobs');
  const interviewHref = toolHref(hubHref, '/dashboard/ai-tools/interview-practice', '/dev/member/interview-practice');
  const openerKicker = firstName ? th('workspaceKicker', { name: firstName }) : th('workspaceKickerGuest');
  const claim = roleLabel && currentModuleNumber
    ? t('claim', { role: roleLabel, employer: employerLabel, n: currentModuleNumber })
    : t('claimNoTarget');
  const feedsApplication = employerLabel ? t('feedsApplication', { employer: employerLabel }) : t('feedsApplicationGeneric');
  const usedForInterview = interviewWhen ? t('usedForInterview', { when: interviewWhen }) : t('usedForInterviewGeneric');
  const usedForModule = currentModuleNumber && currentModuleTitle
    ? t('usedForModule', { n: currentModuleNumber, module: currentModuleTitle })
    : t('usedForModuleGeneric');

  const groups: Array<{ title: string; tiles: HubTile[] }> = [
    {
      title: t('groupResume'),
      tiles: [
        {
          title: t('tileResumeStudio'),
          body: t('tileResumeStudioBody', { score: resumeScore, role: roleLabel || t('targetRoleFallback') }),
          href: resumeHref,
          cta: t('openStudio'),
          state: 'needsWork',
          usedFor: feedsApplication,
          usedForHref: jobsLink,
          Icon: FileText,
        },
        {
          title: t('tileRewriter'),
          body: t('tileRewriterBody'),
          href: toolHref(hubHref, '/dashboard/ai-tools/resume-rewriter', '/dev/member/resume-rewriter'),
          cta: t('continueDraft'),
          state: 'inProgress',
          usedFor: feedsApplication,
          usedForHref: jobsLink,
          Icon: FileText,
        },
      ],
    },
    {
      title: t('groupInterview'),
      tiles: [
        {
          title: t('tileInterview'),
          body: interviewWhen ? t('tileInterviewBodyWhen', { when: interviewWhen }) : t('tileInterviewBody'),
          href: interviewHref,
          cta: t('recordAnswer'),
          state: 'inProgress',
          usedFor: usedForInterview,
          usedForHref: interviewHref,
          Icon: Mic,
        },
        {
          title: t('tileVoice'),
          body: t('tileVoiceBody'),
          href: toolHref(hubHref, '/dashboard/ai-tools?tab=session', '/dev/member/toolkit?tab=session'),
          cta: t('startSession'),
          state: 'ready',
          usedFor: usedForInterview,
          usedForHref: interviewHref,
          Icon: AudioLines,
        },
        {
          title: t('tilePitch'),
          body: t('tilePitchBody'),
          href: toolHref(hubHref, '/dashboard/ai-tools/elevator-pitch', '/dev/member/elevator-pitch'),
          cta: t('reviewPitch'),
          state: 'done',
          usedFor: feedsApplication,
          usedForHref: jobsLink,
          Icon: Sparkles,
        },
      ],
    },
    {
      title: t('groupApps'),
      tiles: [
        {
          title: t('tileMatch'),
          body: roleLabel && employerLabel
            ? t('tileMatchBodyTarget', { role: roleLabel, employer: employerLabel })
            : t('tileMatchBody'),
          href: matchHref,
          cta: t('runScorer'),
          state: 'needsWork',
          usedFor: feedsApplication,
          usedForHref: jobsLink,
          Icon: Search,
        },
        {
          title: t('tileCover'),
          body: t('tileCoverBody'),
          href: toolHref(hubHref, '/dashboard/ai-tools/cover-letter', '/dev/member/cover-letter'),
          cta: t('viewDrafts'),
          state: 'inProgress',
          usedFor: feedsApplication,
          usedForHref: jobsLink,
          Icon: MailOpen,
        },
        {
          title: t('tileGap'),
          body: t('tileGapBody'),
          href: toolHref(hubHref, '/dashboard/ai-tools/gap-analyzer', '/dev/member/gap-analyzer'),
          cta: t('reviewGap'),
          state: 'ready',
          usedFor: usedForModule,
          usedForHref: toolHref(hubHref, '/dashboard/program', '/dev/member/program'),
          Icon: Route,
        },
      ],
    },
  ];

  const planSteps = [
    {
      n: 1,
      title: roleLabel ? t('planStep1Title', { role: roleLabel }) : t('planStep1TitleGeneric'),
      body: employerLabel
        ? t('planStep1Body', { score: resumeScore, employer: employerLabel })
        : t('planStep1BodyGeneric', { score: resumeScore }),
      href: resumeHref,
      state: 'needsWork' as const,
    },
    {
      n: 2,
      title: employerLabel ? t('planStep2Title', { employer: employerLabel }) : t('planStep2TitleGeneric'),
      body: roleLabel && employerLabel
        ? t('planStep2Body', { role: roleLabel, employer: employerLabel })
        : t('planStep2BodyGeneric'),
      href: matchHref,
      state: 'ready' as const,
    },
    {
      n: 3,
      title: interviewWhen ? t('planStep3Title', { when: interviewWhen }) : t('planStep3TitleGeneric'),
      body: t('planStep3Body'),
      href: interviewHref,
      state: 'ready' as const,
    },
  ];

  return (
    <DesignSurface surface="warm">
      <div className="wa-dense-page wa-space-y-5">
        <PageOpener
          kicker={openerKicker}
          title={claim}
          lede={advisorName
            ? t('lede', { advisor: advisorName, role: roleLabel || t('targetRoleFallback') })
            : t('ledeNoAdvisor')}
          icon={<Target size={14} aria-hidden />}
          action={
            <div className="wa-flex wa-items-center wa-gap-2 wa-flex-wrap">
              {currentStreak > 0 ? (
                <span className="wa-kit-streak-chip">
                  <Flame size={15} aria-hidden />
                  <span>
                    {longestStreak > currentStreak
                      ? th('streakBest', { count: currentStreak, best: longestStreak })
                      : th('streak', { count: currentStreak })}
                  </span>
                </span>
              ) : null}
              {advisor ? <StatusTag tone="muted">{th('advisorChip', { name: advisor.name })}</StatusTag> : null}
            </div>
          }
        />
        <div className="wa-kit-card">
          <KpiStrip
            items={[
              { label: t('kpiResumeScore'), value: `${resumeScore} / 100`, tone: 'warn' },
              { label: t('kpiTargetRole'), value: roleLabel || t('targetRoleFallback') },
              { label: t('kpiMock'), value: t('kpiMockValue', { current: mockQuestion, total: mockTotal }), tone: 'info' },
              {
                label: th('kpiInterviewPrep'),
                value: interviewWhen ?? nextCheckIn ?? '—',
                tone: interviewWhen ? 'info' : undefined,
              },
            ]}
          />
        </div>
        <section className="wa-kit-card" aria-labelledby="ai-hub-plan-heading">
          <div className="wa-flex wa-items-center wa-justify-between" style={{ marginBottom: 12 }}>
            <h2 id="ai-hub-plan-heading" style={{ margin: 0, fontWeight: 800, fontSize: 'var(--wa-type-body)' }}>
              {t('planTitle')}
            </h2>
            <span className="wa-kit-meta">{t('planCount', { count: planSteps.length })}</span>
          </div>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
            {planSteps.map((step) => {
              const tag = tileStateTag(step.state, t);
              return (
                <li key={step.n}>
                  <Link
                    href={step.href}
                    className="wa-kit-card wa-kit-card--sm wa-kit-focus"
                    style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', textDecoration: 'none', color: 'inherit' }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ display: 'block' }}>{t('planStepLabel', { n: step.n, title: step.title })}</strong>
                      <span className="wa-kit-meta">{step.body}</span>
                    </div>
                    <StatusTag tone={tag.tone}>{tag.label}</StatusTag>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
        <div className="wa-ai-hub-catalog">
          {groups.map((group) => (
            <section key={group.title} className="wa-ai-hub-group">
              <div className="wa-flex wa-items-center wa-justify-between">
                <h2 style={{ margin: 0, fontWeight: 800, fontSize: 'var(--wa-type-body)' }}>{group.title}</h2>
                <span className="wa-kit-meta">{t('toolsCount', { count: group.tiles.length })}</span>
              </div>
              <div className="wa-ai-hub-group-tiles">
                {group.tiles.map((tile) => {
                  const Icon = tile.Icon;
                  const tag = tileStateTag(tile.state, t);
                  return (
                    <article key={tile.title} className="wa-kit-card wa-ai-hub-tile">
                      <div className="wa-flex wa-items-start wa-justify-between wa-gap-2">
                        <Icon size={18} aria-hidden />
                        <StatusTag tone={tag.tone}>{tag.label}</StatusTag>
                      </div>
                      <h3 style={{ margin: '8px 0 0', fontWeight: 800, fontSize: 'var(--wa-type-body)' }}>{tile.title}</h3>
                      <p className="wa-kit-lede wa-ai-hub-tile-body" style={{ margin: '6px 0 0' }}>{tile.body}</p>
                      {tile.usedForHref ? (
                        <Link href={tile.usedForHref} className="wa-kit-meta wa-kit-focus" style={{ ...TEXT_LINK, minHeight: 36, fontSize: 'var(--wa-type-meta)' }}>
                          {tile.usedFor}
                        </Link>
                      ) : (
                        <p className="wa-kit-meta" style={{ margin: '8px 0 0' }}>{tile.usedFor}</p>
                      )}
                      <Link href={tile.href} className="wa-kit-focus" style={TEXT_LINK}>
                        {tile.cta}
                      </Link>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        <div className="wa-dense-grid wa-dense-grid--2">
          <section className="wa-kit-card" aria-labelledby="ai-hub-drafts-heading">
            <div className="wa-flex wa-items-center wa-justify-between" style={{ marginBottom: 8 }}>
              <h2 id="ai-hub-drafts-heading" style={{ margin: 0, fontWeight: 800, fontSize: 'var(--wa-type-body)' }}>
                {t('recentActivity')}
              </h2>
              <span className="wa-kit-meta">{t('savedDrafts')}</span>
            </div>
            {drafts.length > 0 ? (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
                {drafts.map((draft) => (
                  <li key={draft.id} className="wa-flex wa-items-center wa-justify-between wa-gap-3">
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ display: 'block' }}>{draft.title}</strong>
                      <span className="wa-kit-meta">{draft.saved} · {draft.meta}</span>
                    </div>
                    <Link href={draft.href} className="wa-kit-focus" style={{ ...TEXT_LINK, flexShrink: 0 }}>
                      {t('openDraft')}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="wa-kit-lede" style={{ margin: 0 }}>{t('recentEmpty')}</p>
            )}
          </section>
          <section className="wa-kit-card" aria-labelledby="ai-hub-support-heading">
            <h2 id="ai-hub-support-heading" style={{ margin: 0, fontWeight: 800, fontSize: 'var(--wa-type-body)' }}>
              {th('dedicatedSupport')}
            </h2>
            {advisor ? (
              <div className="wa-flex wa-items-center wa-gap-3" style={{ marginTop: 12 }} data-testid="member-advisor-card">
                <Avatar initials={advisorInitials(advisor.name)} size={44} src={advisor.avatar ?? undefined} />
                <p style={{ margin: 0, fontWeight: 800 }}>{advisor.name}</p>
              </div>
            ) : null}
            {nextCheckIn ? <p className="wa-kit-lede" style={{ marginTop: 8 }}>{th('nextCheckIn', { when: nextCheckIn })}</p> : null}
            {advisor ? <p className="wa-kit-meta">{th('replyTime')}</p> : null}
            <div className="wa-flex wa-items-center wa-gap-3 wa-flex-wrap" style={{ marginTop: 12 }}>
              {advisor ? (
                <Link href={advisor.messagingHref} className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus">
                  {th('messageAdvisor', { name: advisor.firstName })}
                </Link>
              ) : null}
              <a href={advisor?.messagingHref ?? '/dashboard/messages'} className="wa-kit-cta wa-kit-focus" style={{ textDecoration: 'none' }}>
                {th('bookCheckIn')}
              </a>
            </div>
          </section>
        </div>
      </div>
    </DesignSurface>
  );
}
