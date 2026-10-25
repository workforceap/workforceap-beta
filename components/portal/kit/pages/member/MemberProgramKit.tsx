'use client';

import { Play, Check, CalendarDays, Target, ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { DesignSurface, PageOpener, KitEmptyState } from '@/components/portal/kit';
import TrackedCourseraLaunchLink from '@/components/portal/TrackedCourseraLaunchLink';
import CourseraLaunchErrorNotice from '@/components/portal/CourseraLaunchErrorNotice';
import { MemberTrainingNav, type MemberTrainingNavHrefs } from '@/components/portal/MemberCareerSteps';
import { MemberContextNote } from './MemberDisclosure';
import { MemberTrainingWorkspace, type MemberTrainingWorkspaceProps } from './MemberTrainingWorkspace';
import { MemberPathSegments, type PathSegment } from './MemberPathSegments';
import styles from './memberPages.module.css';

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
  /** Optional route overrides for credential-free fixture owners. */
  trainingNavHrefs?: MemberTrainingNavHrefs;
  programSlug?: string | null;
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
  /**
   * Summary line for the missions card. The live route does not load missions
   * (see app/(portal)/dashboard/program/page.tsx), so when omitted the card
   * says where missions are listed — never "No missions", which the kit
   * cannot know.
   */
  missionsSummary?: string;
  missionsHref?: string;
}

const DEFAULT_MODULES: ProgramModule[] = [];

const MODULE_STATE_LABEL: Record<ModuleState, string> = { done: 'Done', active: 'In progress', locked: 'Locked' };

export function MemberProgramKit({
  trainingWorkspace,
  programTitle = 'Your program',
  programSlug,
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
  missionsHref = '/dashboard/missions',
  trainingNavHrefs,
}: MemberProgramKitProps) {
  // The page states the course denominator once; the workspace view must show it where it states the count too.
  // A failed Coursera launch lands here with ?error=; say what happened on both views.
  if (trainingWorkspace) return <><CourseraLaunchErrorNotice /><MemberTrainingWorkspace key={`${trainingWorkspace.workspace.programSlug}:${trainingWorkspace.workspace.curriculumVersion}`} modulesNote={modulesNote} {...trainingWorkspace} trainingNavHrefs={trainingNavHrefs ?? trainingWorkspace.trainingNavHrefs} /></>;
  return <><CourseraLaunchErrorNotice /><MemberProgramOverview programSlug={programSlug} programTitle={programTitle} progressPercent={progressPercent} modulesComplete={modulesComplete} modulesTotal={modulesTotal} modulesNote={modulesNote} estRemaining={estRemaining} resumeHref={resumeHref} courseraLaunchHref={courseraLaunchHref} modules={modules} liveSessionTitle={liveSessionTitle} liveSessionWhen={liveSessionWhen} liveSessionStart={liveSessionStart} liveSessionDurationMinutes={liveSessionDurationMinutes} missionsSummary={missionsSummary} missionsHref={missionsHref} trainingNavHrefs={trainingNavHrefs} /></>;
}

/** Program overview (no pinned workspace): hooks live here so the early workspace return above stays hook-free. */
function MemberProgramOverview({
  programTitle,
  programSlug,
  progressPercent,
  modulesComplete,
  modulesTotal,
  modulesNote,
  estRemaining,
  resumeHref,
  courseraLaunchHref,
  modules,
  liveSessionTitle,
  liveSessionWhen,
  liveSessionStart,
  liveSessionDurationMinutes,
  missionsSummary,
  missionsHref,
  trainingNavHrefs,
}: Required<Pick<MemberProgramKitProps, 'programTitle' | 'progressPercent' | 'modulesComplete' | 'modulesTotal' | 'resumeHref' | 'modules' | 'liveSessionDurationMinutes' | 'missionsHref'>> &
  Pick<MemberProgramKitProps, 'programSlug' | 'modulesNote' | 'estRemaining' | 'courseraLaunchHref' | 'liveSessionTitle' | 'liveSessionWhen' | 'liveSessionStart' | 'missionsSummary' | 'trainingNavHrefs'>) {
  const te = useTranslations('empty');
  const tw = useTranslations('memberWorkspace.training');
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

  const activeIndex = modules.findIndex((module) => module.state === 'active');
  const segments: PathSegment[] = modules.map((module, index) => ({
    key: `${index}-${module.slug ?? module.title}`,
    name: module.title,
    state: module.state === 'done' ? 'done' : module.state === 'active' ? 'current' : 'todo',
  }));
  const allDone = modulesTotal > 0 && modulesComplete >= modulesTotal;
  const progressLine = `${modulesComplete} of ${modulesTotal} modules complete${estRemaining ? `, ${estRemaining}` : ''}`;
  // One contextual sentence from the data the route already passes; with no
  // modules yet the page keeps its plain description rather than "0 of 0".
  const openerMeta = modulesTotal > 0 ? `${programTitle}. ${progressLine}.` : 'Modules, live sessions, and missions.';
  const cta = courseraLaunchHref ? (
    <TrackedCourseraLaunchLink
      href={courseraLaunchHref}
      courseSlug={activeCourseSlug}
      className="wa-kit-cta wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none"
      style={{ whiteSpace: 'normal', textAlign: 'center' }}
    >
      Resume in Coursera <Play size={14} aria-hidden="true" />
    </TrackedCourseraLaunchLink>
  ) : (
    <a
      href={resumeHref}
      className="wa-kit-cta wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none"
      style={{ whiteSpace: 'normal', textAlign: 'center' }}
    >
      Open Learning Hub <Play size={14} aria-hidden="true" />
    </a>
  );

  return (
    <DesignSurface surface="warm">
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: 'var(--wa-pad-sm)' }} className="wa-space-y-6">
        <PageOpener
          title="Certification path"
          meta={openerMeta}
          aside={
            activeIndex >= 0 ? (
              <span className="wa-kit-chip wa-kit-chip--blue">Module {activeIndex + 1} of {modules.length}</span>
            ) : allDone ? (
              <span className="wa-kit-chip wa-kit-chip--green">All modules complete</span>
            ) : undefined
          }
        />
        <MemberTrainingNav current="program" programSlug={programSlug} hrefs={trainingNavHrefs} />
        <MemberContextNote line={tw('learningContextShort')} moreLabel={tw('learningContextMoreLabel')} more={tw('learningContextMore')} />

        <div className="wa-kit-home-grid">
          <div className="wa-kit-home-grid__main wa-kit-stack">
            <section className={`wa-kit-card wa-kit-card--accent-edge ${styles.pathCard}`} aria-labelledby="program-path-title">
              <div className="wa-kit-card__head">
                <div style={{ minWidth: 0 }}>
                  <h2 id="program-path-title" className="wa-kit-card-title">{programTitle}</h2>
                  <p className="wa-kit-card-sub">Current program</p>
                </div>
                <span className="wa-kit-card-count"><b>{pct}%</b> complete</span>
              </div>
              <MemberPathSegments segments={segments} label="Modules in this program" />
              {modulesNote ? (
                <p data-testid="program-courses-note" className={styles.pathNote}>
                  {modulesNote}
                </p>
              ) : null}
              <div className={styles.pathFoot}>
                {cta}
              </div>
            </section>

            <section className="wa-kit-card wa-kit-card--flush" aria-labelledby="program-modules-title">
              <div className="wa-kit-card__head wa-kit-card__head--ruled">
                <h2 id="program-modules-title" className="wa-kit-card-title">Modules</h2>
                <a href={resumeHref} className="wa-kit-card-link wa-kit-focus">
                  Learning Hub <ArrowRight size={14} aria-hidden="true" />
                </a>
              </div>
              {modules.length === 0 ? (
                // `empty.modules`: the route only reaches this card with a pinned
                // enrollment, so an empty list is a curriculum not published yet —
                // not a first step the member can take.
                <div style={{ padding: 'var(--wa-pad)' }}>
                  <KitEmptyState
                    kind="unavailable"
                    tone="info"
                    headingAs="h3"
                    title={te('modules.title')}
                    description={te('modules.body')}
                    primaryAction={{ href: '/dashboard/messages', label: te('modules.action') }}
                  />
                </div>
              ) : (
                <ul className="wa-kit-task-list">
                  {modules.map((m) => {
                    const isActive = m.state === 'active';
                    const moduleHref =
                      m.launchHref
                      ?? m.moduleHref
                      ?? (m.slug ? `${resumeHref}#course-${m.slug}` : resumeHref);
                    return (
                      <li
                        key={m.title}
                        className="wa-kit-task-row"
                        data-state={m.state === 'done' ? 'done' : isActive ? 'current' : 'todo'}
                      >
                        <span className="wa-kit-task-row__check" aria-hidden="true">
                          {m.state === 'done' ? <Check /> : null}
                        </span>
                        <div className="wa-kit-task-row__body">
                          <p className="wa-kit-task-row__title">{m.title}</p>
                        </div>
                        {isActive && m.launchHref ? (
                          <TrackedCourseraLaunchLink
                            href={moduleHref}
                            courseSlug={m.slug}
                            className="wa-page-action wa-kit-focus"
                          >
                            Continue in Coursera <ArrowRight size={14} aria-hidden="true" />
                          </TrackedCourseraLaunchLink>
                        ) : isActive ? (
                          <a href={moduleHref} className="wa-kit-cta wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none">
                            Continue <ArrowRight size={14} aria-hidden="true" />
                          </a>
                        ) : m.state === 'done' && m.moduleHref && !m.launchHref ? (
                          <a href={moduleHref} className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus">
                            Open <ArrowRight size={14} aria-hidden="true" />
                          </a>
                        ) : (
                          <span className={`wa-kit-chip ${m.state === 'done' ? 'wa-kit-chip--green' : 'wa-kit-chip--neutral'}`}>
                            {MODULE_STATE_LABEL[m.state]}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>

          <div className="wa-kit-home-grid__rail wa-kit-stack">
            {hasLiveSession && (
              <section className={`wa-kit-card ${styles.railCard}`} aria-labelledby="program-live-title">
                <div className={styles.headRow}>
                  <CalendarDays size={16} aria-hidden="true" style={{ color: 'var(--wa-accent-text)' }} />
                  <h2 id="program-live-title" className="wa-kit-card-title">Next live session</h2>
                </div>
                <div>
                  <p style={{ fontSize: 'var(--wa-type-body)', fontWeight: 600 }}>{liveSessionTitle}</p>
                  {liveSessionWhen && (
                    <p className="wa-kit-meta" style={{ marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{liveSessionWhen}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleAddToCalendar}
                  className="wa-kit-cta wa-kit-cta--ghost wa-kit-cta--block wa-kit-focus hover:wa-opacity-90 active:wa-scale-[0.98] motion-reduce:active:wa-scale-100 wa-transition-[opacity,transform] wa-duration-150 motion-reduce:wa-transition-none"
                >
                  Add to calendar
                </button>
              </section>
            )}

            {/* Gold marks achievement: a small chip is the only gold on the page. */}
            <section className={`wa-kit-card ${styles.railCard}`} aria-labelledby="program-missions-title">
              <div className={styles.headRow}>
                <span className={`${styles.tile} ${styles.tileGold}`}>
                  <Target size={15} aria-hidden="true" />
                </span>
                <h2 id="program-missions-title" className="wa-kit-card-title">Skill missions</h2>
              </div>
              <p className="wa-kit-lede">
                {missionsSummary ?? 'Missions unlock as you finish courses. Open missions to see what is ready.'}
              </p>
              <a
                href={missionsHref}
                className="wa-kit-card-link wa-kit-focus hover:wa-opacity-80 wa-transition-opacity wa-duration-150 motion-reduce:wa-transition-none"
                style={{ color: 'var(--wa-gold-dark)' }}
              >
                Open missions <ArrowRight size={14} aria-hidden="true" />
              </a>
            </section>
          </div>
        </div>
      </div>
    </DesignSurface>
  );
}
