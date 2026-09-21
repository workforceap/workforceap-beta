'use client';

import { Play, Check, Lock, CalendarDays, Target, ArrowRight, GraduationCap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { DesignSurface, ProgressRing, PageOpener } from '@/components/portal/kit';
import TrackedCourseraLaunchLink from '@/components/portal/TrackedCourseraLaunchLink';
import { MemberTrainingWorkspace, type MemberTrainingWorkspaceProps } from './MemberTrainingWorkspace';

/**
 * Member Portal — program / certification path (kit ProgressRing + modules +
 * live session + missions). Live at `/dashboard/program`; proof at
 * `/dev/member/program`. Surface: warm (member-facing).
 */

type ModuleState = 'done' | 'active' | 'locked';

interface ProgramModule {
  title: string;
  state: ModuleState;
  /**
   * Course slug, when known. Used for course-level launch analytics and as
   * the Learning Hub anchor fallback when no Coursera launch URL is supplied.
   */
  slug?: string;
  /** WorkforceAP launch endpoint that resolves and redirects to Coursera. */
  launchHref?: string;
  /**
   * In-platform module page for a WorkforceAP-authored course (a pathway that
   * links out to its provider rather than to Coursera). Without it such a
   * course has no Coursera launch either, and the Learning Hub anchor fallback
   * below lands on a page that has no module content — the member loops back to
   * the dashboard instead of reaching the lesson.
   */
  moduleHref?: string;
}

export interface MemberProgramKitProps {
  /** Durable, authenticated workspace when the member has a pinned enrollment. */
  trainingWorkspace?: MemberTrainingWorkspaceProps;
  programTitle?: string;
  /** 0–100. */
  progressPercent?: number;
  modulesComplete?: number;
  modulesTotal?: number;
  /** Plain line naming the WorkforceAP lab inside `modulesTotal` (null when the program has none). */
  modulesNote?: string | null;
  estRemaining?: string;
  /** Internal Learning Hub destination, kept separate from Coursera launch actions. */
  resumeHref?: string;
  /** WorkforceAP launch endpoint for the next incomplete Coursera course. */
  courseraLaunchHref?: string;
  modules?: ProgramModule[];
  /** Next live session title. Card is hidden unless this is provided. */
  liveSessionTitle?: string;
  /** Human-readable schedule, e.g. "Thu, Jun 26 · 6:00 PM CT". */
  liveSessionWhen?: string;
  /** Optional ISO/parseable start used to build the calendar (.ics) download. */
  liveSessionStart?: string | number | Date;
  /** Optional duration in minutes for the calendar event (default 60). */
  liveSessionDurationMinutes?: number;
  /** Summary line for the missions card. Honest empty-state copy if omitted. */
  missionsSummary?: string;
  missionsHref?: string;
}

const DEFAULT_MODULES: ProgramModule[] = [];

const MODULE_META: Record<ModuleState, { label: string; color: string; icon: LucideIcon; iconSize: number; bg: string; border?: string; iconBg: string; iconColor: string }> = {
  done: {
    label: 'Done',
    color: 'var(--wa-success-dark)',
    icon: Check,
    iconSize: 14,
    bg: 'var(--wa-surface-2)',
    iconBg: 'var(--wa-success)',
    iconColor: 'var(--wa-on-accent-control)',
  },
  active: {
    label: 'In progress',
    color: 'var(--wa-accent-text)',
    icon: Play,
    iconSize: 14,
    bg: 'var(--wa-accent-soft)',
    border: '1px solid var(--wa-accent-soft)',
    iconBg: 'var(--wa-accent)',
    iconColor: 'var(--wa-on-accent-control)',
  },
  locked: {
    label: 'Locked',
    color: 'var(--wa-muted)',
    icon: Lock,
    iconSize: 14,
    bg: 'var(--wa-surface)',
    border: '1px solid var(--wa-border)',
    iconBg: 'var(--wa-surface-2)',
    iconColor: 'var(--wa-muted)',
  },
};

export function MemberProgramKit({
  trainingWorkspace,
  programTitle = 'Your program',
  progressPercent = 0,
  modulesComplete = 0,
  modulesTotal = 0,
  modulesNote,
  estRemaining,
  resumeHref = '/dashboard/learning',
  courseraLaunchHref,
  modules = DEFAULT_MODULES,
  liveSessionTitle,
  liveSessionWhen,
  liveSessionStart,
  liveSessionDurationMinutes = 60,
  missionsSummary,
  missionsHref = '#',
}: MemberProgramKitProps) {
  // The page states the course denominator once; the workspace view must show it where it states the count too.
  if (trainingWorkspace) return <MemberTrainingWorkspace key={`${trainingWorkspace.workspace.programSlug}:${trainingWorkspace.workspace.curriculumVersion}`} modulesNote={modulesNote} {...trainingWorkspace} />;
  const pct = Math.max(0, Math.min(100, Math.round(progressPercent)));

  // Only show the Next Live Session card when we have a real session to show.
  const hasLiveSession = Boolean(liveSessionTitle);
  const sessionStart = liveSessionStart != null ? new Date(liveSessionStart) : null;
  const hasValidStart = sessionStart != null && !Number.isNaN(sessionStart.getTime());
  const activeCourseSlug = modules.find((module) => module.state === 'active')?.slug ?? null;

  const handleAddToCalendar = () => {
    if (!liveSessionTitle) return;
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const escape = (s: string) => s.replace(/([\\,;])/g, '\\$1').replace(/\n/g, '\\n');
    const now = new Date();
    const start = hasValidStart ? sessionStart : now;
    const end = new Date(start.getTime() + liveSessionDurationMinutes * 60_000);
    const uid = `${start.getTime()}-${Math.random().toString(36).slice(2)}@workforceap`;
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//WorkforceAP//Member Portal//EN',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${fmt(now)}`,
      `DTSTART:${fmt(start)}`,
      `DTEND:${fmt(end)}`,
      `SUMMARY:${escape(liveSessionTitle)}`,
      liveSessionWhen ? `DESCRIPTION:${escape(liveSessionWhen)}` : null,
      'END:VEVENT',
      'END:VCALENDAR',
    ].filter((l): l is string => l !== null);
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${liveSessionTitle.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <DesignSurface surface="warm">
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--wa-pad-sm)' }} className="wa-space-y-6">
        <PageOpener
          kicker="Program"
          title="Certification path"
          lede="Modules, live sessions, and missions."
          icon={<GraduationCap size={13} aria-hidden="true" />}
        />
        {/* Gradient hero */}
        <div
          className="wa-kit-card wa-kit-card--gradient-crimson wa-flex wa-flex-col md:wa-flex-row md:wa-items-center"
          style={{ gap: 24 }}
        >
          <div style={{ flexShrink: 0, margin: '0 auto' }}>
            <ProgressRing pct={pct} size={120} onDark label="Program progress" />
          </div>
          <div style={{ flex: 1 }}>
            <div className="wa-kit-meta" style={{ fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'inherit' }}>
              Current program
            </div>
            <h2 className="h-font" style={{ fontSize: 'clamp(21px, 5.5vw, 28px)', fontWeight: 800, letterSpacing: '-0.03em', marginTop: 4, textWrap: 'balance' }}>
              {programTitle}
            </h2>
            <p className="wa-kit-lede" style={{ marginTop: 4, fontVariantNumeric: 'tabular-nums', color: 'inherit' }}>
              {modulesComplete} of {modulesTotal} modules complete
              {estRemaining ? ` · ${estRemaining}` : ''}
            </p>
            {modulesNote ? (
              <p data-testid="program-courses-note" style={{ marginTop: 4, fontSize: 'var(--wa-type-meta)', opacity: 0.85 }}>
                {modulesNote}
              </p>
            ) : null}
          </div>
          {courseraLaunchHref ? (
            <TrackedCourseraLaunchLink
              href={courseraLaunchHref}
              courseSlug={activeCourseSlug}
              className="wa-kit-cta wa-kit-focus wa-kit-focus--on-dark hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none"
              style={{
                background: 'var(--wa-hero-action-bg)',
                color: 'var(--wa-hero-action-text)',
                fontWeight: 700,
                whiteSpace: 'normal',
                textAlign: 'center',
              }}
            >
              Resume in Coursera <Play size={14} aria-hidden="true" />
            </TrackedCourseraLaunchLink>
          ) : (
            <a
              href={resumeHref}
              className="wa-kit-cta wa-kit-focus wa-kit-focus--on-dark hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none"
              style={{
                background: 'var(--wa-hero-action-bg)',
                color: 'var(--wa-hero-action-text)',
                fontWeight: 700,
                whiteSpace: 'normal',
                textAlign: 'center',
              }}
            >
              Open Learning Hub <Play size={14} aria-hidden="true" />
            </a>
          )}
        </div>

        <div className="wa-grid wa-grid-cols-1 lg:wa-grid-cols-3 wa-gap-5">
          {/* Modules list (2-wide) */}
          <div className="wa-kit-card lg:wa-col-span-2">
            <div className="wa-flex wa-items-center wa-justify-between wa-gap-3" style={{ marginBottom: 16 }}>
              <h3 style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em', textWrap: 'balance' }}>Modules</h3>
              <a
                href={resumeHref}
                className="wa-page-action wa-kit-focus hover:wa-opacity-80 wa-transition-opacity wa-duration-150 motion-reduce:wa-transition-none"
              >
                Learning Hub <ArrowRight size={14} aria-hidden="true" />
              </a>
            </div>
            <div className="wa-space-y-2">
              {modules.length === 0 ? (
                <p className="wa-kit-lede" style={{ margin: 0 }}>No modules on this path yet.</p>
              ) : null}
              {modules.map((m) => {
                const meta = MODULE_META[m.state];
                const Icon = meta.icon;
                const dim = m.state === 'locked';
                const isActive = m.state === 'active';
                const moduleHref =
                  m.launchHref
                  ?? m.moduleHref
                  ?? (m.slug ? `${resumeHref}#course-${m.slug}` : resumeHref);
                return (
                  <div
                    key={m.title}
                    className="wa-flex wa-items-center wa-gap-3 wa-flex-wrap"
                    style={{
                      padding: 12,
                      borderRadius: 'var(--wa-radius-sm)',
                      background: meta.bg,
                      border: meta.border,
                      opacity: dim ? 0.7 : 1,
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 999,
                        background: meta.iconBg,
                        color: meta.iconColor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Icon size={meta.iconSize} aria-hidden="true" />
                    </div>
                    <span style={{ fontWeight: 600, fontSize: 'var(--wa-type-body)', flex: 1, color: dim ? 'var(--wa-muted)' : 'var(--wa-text)' }}>
                      {m.title}
                    </span>
                    {isActive && m.launchHref ? (
                      <TrackedCourseraLaunchLink
                        href={moduleHref}
                        courseSlug={m.slug}
                        className="wa-page-action wa-kit-focus hover:wa-opacity-90 wa-transition-opacity wa-duration-150 motion-reduce:wa-transition-none"
                        style={{ whiteSpace: 'nowrap' }}
                      >
                        Continue in Coursera <ArrowRight size={14} aria-hidden="true" />
                      </TrackedCourseraLaunchLink>
                    ) : isActive ? (
                      <a
                        href={moduleHref}
                        className="wa-kit-cta wa-kit-cta--xl wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none"
                      >
                        Continue <ArrowRight size={14} aria-hidden="true" />
                      </a>
                    ) : m.state === 'done' && m.moduleHref && !m.launchHref ? (
                      <a
                        href={moduleHref}
                        className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus hover:wa-opacity-90 wa-transition-opacity wa-duration-150 motion-reduce:wa-transition-none"
                      >
                        Open <ArrowRight size={14} aria-hidden="true" />
                      </a>
                    ) : (
                      <span className="wa-kit-meta" style={{ fontWeight: 700, color: meta.color }}>
                        {meta.label}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sidebar: live session + missions */}
          <div className="wa-space-y-5">
            {hasLiveSession && (
              <div className="wa-kit-card">
                <div className="wa-flex wa-items-center wa-gap-2" style={{ color: 'var(--wa-accent)', marginBottom: 8 }}>
                  <CalendarDays size={15} aria-hidden="true" />
                  <h3 style={{ fontWeight: 800, fontSize: 'var(--wa-type-body)', letterSpacing: '-0.02em' }}>Next live session</h3>
                </div>
                <p style={{ fontSize: 'var(--wa-type-body)', fontWeight: 700 }}>{liveSessionTitle}</p>
                {liveSessionWhen && (
                  <p className="wa-kit-meta" style={{ marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{liveSessionWhen}</p>
                )}
                <button
                  type="button"
                  onClick={handleAddToCalendar}
                  className="wa-kit-cta wa-kit-cta--block wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none"
                  style={{ marginTop: 12 }}
                >
                  Add to calendar
                </button>
              </div>
            )}

            {/* Quiet bordered surface with a small gold accent chip — the
                gradient hero above is the page's one filled color block, so
                this stays a calm card rather than a second full-tint tile. */}
            <div className="wa-kit-card">
              <div className="wa-flex wa-items-center wa-gap-2" style={{ marginBottom: 8 }}>
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 'var(--wa-radius-sm)',
                    background: 'var(--wa-gold-soft)',
                    color: 'var(--wa-gold-dark)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Target size={14} aria-hidden="true" />
                </div>
                <h3 style={{ fontWeight: 800, fontSize: 'var(--wa-type-body)', letterSpacing: '-0.02em' }}>Skill missions</h3>
              </div>
              <p className="wa-kit-lede">
                {missionsSummary ?? 'No missions assigned.'}
              </p>
              <a
                href={missionsHref}
                className="wa-page-action wa-kit-focus hover:wa-opacity-80 wa-transition-opacity wa-duration-150 motion-reduce:wa-transition-none"
                style={{ marginTop: 12, color: 'var(--wa-gold-dark)' }}
              >
                Open missions <ArrowRight size={14} aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </DesignSurface>
  );
}
