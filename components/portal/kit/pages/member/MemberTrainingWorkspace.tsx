'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowRight, BookOpen, CalendarDays, Check, ChevronRight, Clock3, FileCheck2, GraduationCap, MessageCircle, Save } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { TextArea } from '@astryxdesign/core/TextArea';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { DesignSurface, PageOpener, KitEmptyState, useAnnounce } from '@/components/portal/kit';
import TrackedCourseraLaunchLink from '@/components/portal/TrackedCourseraLaunchLink';
import SkillMissionChallenge from '@/components/portal/SkillMissionChallenge';
import { logCourseraLaunchFromPortal } from '@/app/(portal)/dashboard/_actions/analyticsActions';
import { trackLearningMilestone } from '@/lib/analytics/events';
import type { TrainingCoursePractice } from '@/lib/member/trainingCoursePractice';
import { buildTrainingSchedule, isValidPlanDate, type TrainingWorkspace } from '@/lib/member/trainingWorkspace';
import { IT_SUPPORT_LAB_SCOPE, listPracticeLabsForAssignment } from '@/lib/content/itSupportLabs';

export type TrainingCourseDestination = { slug: string; launchHref?: string; moduleHref?: string };

/** Prefer the Coursera launch or in-platform module over a same-page no-op. */
export function nextCourseContinueTarget(
  slug: string | undefined,
  destinations: TrainingCourseDestination[],
): { href: string; kind: 'coursera' | 'module' } | null {
  if (!slug) return null;
  const destination = destinations.find((row) => row.slug === slug);
  if (!destination) return null;
  if (destination.launchHref) return { href: destination.launchHref, kind: 'coursera' };
  if (destination.moduleHref) return { href: destination.moduleHref, kind: 'module' };
  return null;
}

function ContinueThisCourseButton({
  courseSlug,
  destinations,
  onSelectCourse,
}: {
  courseSlug: string;
  destinations: TrainingCourseDestination[];
  onSelectCourse: (slug: string) => void;
}) {
  const target = nextCourseContinueTarget(courseSlug, destinations);
  if (!target) {
    return (
      <Button
        label="Continue this course"
        variant="primary"
        size="lg"
        onClick={() => onSelectCourse(courseSlug)}
      />
    );
  }
  // The link form is the kit CTA, not `<Button href>`: Astryx paints its
  // variant colours inside `@layer astryx-base`, and the unlayered
  // `a { color: inherit }` in css/main.css beats any layered rule on an
  // anchor, so the Astryx `<a>` label inherited body text (2.69:1 on crimson).
  // `.wa-kit-cta` pairs --wa-accent with --wa-on-accent-control in both modes.
  return (
    <Link
      href={target.href}
      className="wa-kit-cta wa-kit-focus"
      target={target.kind === 'coursera' ? '_blank' : undefined}
      rel={target.kind === 'coursera' ? 'noopener noreferrer' : undefined}
      onClick={
        target.kind === 'coursera'
          ? () => {
              void logCourseraLaunchFromPortal(courseSlug);
              trackLearningMilestone('course_launched', courseSlug);
            }
          : undefined
      }
    >
      Continue this course
    </Link>
  );
}
export interface MemberTrainingWorkspaceProps {
  workspace: TrainingWorkspace;
  programTitle: string;
  completedSlugs: string[];
  destinations: TrainingCourseDestination[];
  initialCourseSlug?: string;
  syllabusHours?: number;
  syllabusBreakdown?: string;
  /** How the course count is made up (e.g. "17 courses: 16 on Coursera's learning path plus the WorkforceAP Lab…"). */
  modulesNote?: string | null;
  trainingEmail?: string | null;
  practiceMissions?: TrainingCoursePractice[];
  practiceUnavailable?: boolean;
}

type Draft = { notes: string; artifactUrl: string };
const dateLabel = (date: string) => isValidPlanDate(date) ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)) : '';
function addDays(date: string, days: number) {
  if (!isValidPlanDate(date)) return null;
  const value = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(value.getTime())) return null;
  value.setUTCDate(value.getUTCDate() + days);
  const result = value.toISOString().split('T')[0];
  return isValidPlanDate(result) ? result : null;
}

/** The member's assigned curriculum, study schedule, and durable work in one place. */
export function MemberTrainingWorkspace({ workspace: initialWorkspace, programTitle, completedSlugs, destinations, initialCourseSlug, syllabusHours, syllabusBreakdown, modulesNote, trainingEmail, practiceMissions = [], practiceUnavailable = false }: MemberTrainingWorkspaceProps) {
  const router = useRouter();
  const te = useTranslations('empty');
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const completed = new Set(completedSlugs);
  const nextCourse = workspace.courses.find((course) => !completed.has(course.slug));
  const [selectedSlug, setSelectedSlug] = useState(() => workspace.courses.find((course) => course.slug === initialCourseSlug)?.slug ?? nextCourse?.slug ?? workspace.courses[0]?.slug ?? '');
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [weeklyHours, setWeeklyHours] = useState(String(workspace.weeklyHours ?? 10));
  const [startDate, setStartDate] = useState(workspace.planStartDate ?? new Date().toISOString().slice(0, 10));
  const [filter, setFilter] = useState<'all' | 'remaining' | 'saved'>('all');
  const [tab, setTab] = useState<'courses' | 'schedule'>('courses');
  const [saving, setSaving] = useState<'plan' | string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [activeMission, setActiveMission] = useState<TrainingCoursePractice['mission'] | null>(null);
  const closeMission = () => { setActiveMission(null); router.refresh(); };
  const editorRef = useRef<HTMLElement>(null);
  const outlineRef = useRef<HTMLElement>(null);
  const announce = useAnnounce();
  const selected = workspace.courses.find((course) => course.slug === selectedSlug);
  const draft = drafts[selectedSlug] ?? { notes: selected?.notes ?? '', artifactUrl: selected?.artifactUrl ?? '' };
  const dirtySlugs = Object.keys(drafts).filter((slug) => {
    const saved = workspace.courses.find((course) => course.slug === slug);
    return drafts[slug].notes !== (saved?.notes ?? '') || drafts[slug].artifactUrl !== (saved?.artifactUrl ?? '');
  });
  const planDirty = Number(weeklyHours) !== (workspace.weeklyHours ?? 10) || startDate !== (workspace.planStartDate ?? new Date().toISOString().slice(0, 10));
  const hasUnsaved = dirtySlugs.length > 0 || planDirty;
  useEffect(() => {
    if (!hasUnsaved) return;
    const protectDraft = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    const protectNavigation = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest('a') : null;
      if (!target || target.target === '_blank' || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      if (!window.confirm('You have unsaved training work. Leave this page without saving?')) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', protectDraft);
    document.addEventListener('click', protectNavigation, true);
    return () => { window.removeEventListener('beforeunload', protectDraft); document.removeEventListener('click', protectNavigation, true); };
  }, [hasUnsaved]);

  const remaining = workspace.courses.filter((course) => !completed.has(course.slug));
  const hoursRemaining = remaining.reduce((sum, course) => sum + course.estimatedHours, 0);
  const totalHours = workspace.courses.reduce((sum, course) => sum + course.estimatedHours, 0);
  const savedCount = workspace.courses.filter((course) => course.notes || course.artifactUrl).length;
  const completedCount = workspace.courses.filter((course) => completed.has(course.slug)).length;
  const pace = Number(weeklyHours);
  const validPace = Number.isInteger(pace) && pace >= 1 && pace <= 40;
  const weeks = validPace ? Math.ceil(hoursRemaining / pace) : 0;
  const finishDate = validPace && startDate && weeks ? addDays(startDate, weeks * 7 - 1) : null;
  const selectedDestination = destinations.find((course) => course.slug === selectedSlug);
  const selectedPractice = practiceMissions.find((row) => row.assignedCourseSlug === selectedSlug)?.mission;
  const selectedLabs = listPracticeLabsForAssignment({ programSlug: workspace.programSlug, curriculumVersion: workspace.curriculumVersion, courseSlug: selectedSlug });
  const filteredCourses = workspace.courses.filter((course) => filter === 'remaining' ? !completed.has(course.slug) : filter === 'saved' ? Boolean(course.notes || course.artifactUrl) : true);

  // Split real assigned course hours into study weeks. These are planning
  // estimates, never clocked attendance or a replacement completion signal.
  const schedule = buildTrainingSchedule(remaining, pace, startDate).map((row) => ({
    course: remaining.find((course) => course.slug === row.courseSlug)!, firstWeek: row.startWeek, lastWeek: row.endWeek,
  }));

  function selectCourse(slug: string) {
    setSelectedSlug(slug);
    setTab('courses');
    setMessage('');
    setError('');
    const url = new URL(window.location.href);
    url.searchParams.set('course', slug);
    window.history.replaceState(null, '', url);
    requestAnimationFrame(() => {
      editorRef.current?.focus({ preventScroll: true });
      editorRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    });
  }

  async function save(kind: 'plan' | 'coursework') {
    if (saving) return;
    const courseSlug = selectedSlug;
    const submittedDraft = { ...draft };
    setSaving(kind === 'plan' ? 'plan' : courseSlug);
    setMessage(''); setError('');
    try {
      const payload = kind === 'plan'
        ? { kind, weeklyHours: pace, planStartDate: startDate }
        : { kind, courseSlug, notes: submittedDraft.notes, artifactUrl: submittedDraft.artifactUrl.trim() || null };
      const response = await fetch('/api/member/training-workspace', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, programSlug: workspace.programSlug, curriculumVersion: workspace.curriculumVersion }),
      });
      const result = await response.json();
      if (!response.ok || !result.workspace) throw new Error(response.status === 401 ? 'Your session expired. Sign in again to save your work.' : result.error ?? 'Your work could not be saved. Please try again.');
      setWorkspace(result.workspace);
      if (kind === 'coursework') setDrafts((current) => {
        const latest = current[courseSlug];
        if (latest && (latest.notes !== submittedDraft.notes || latest.artifactUrl !== submittedDraft.artifactUrl)) return current;
        const next = { ...current }; delete next[courseSlug]; return next;
      });
      const confirmation = kind === 'plan' ? 'Study schedule saved to your account.' : 'Course work saved to your account.';
      setMessage(confirmation); announce(confirmation);
    } catch (failure) {
      const detail = failure instanceof Error ? failure.message : 'Your work could not be saved. Please try again.';
      setError(detail); announce(detail, 'assertive');
    } finally { setSaving(null); }
  }

  return (
    <DesignSurface surface="warm">
      <main className="wa-kit-training">
        <PageOpener kicker="My program" title="Your training workspace" lede="Learn the skills. Build the work. Keep moving toward your next role." icon={<GraduationCap size={14} aria-hidden="true" />} />
        <section className="wa-kit-training-overview" aria-label="Your assigned training">
          <VStack gap={3}>
            <p className="wa-kit-training-eyebrow">{totalHours} hours of assigned training</p>
            <h2>{programTitle}</h2>
            <p className="wa-kit-training-muted">{syllabusHours === totalHours && syllabusBreakdown ? syllabusBreakdown : `${workspace.courses.length} courses and applied modules in your assigned learning path.`}</p>
            {modulesNote ? <p className="wa-kit-training-muted" data-testid="program-courses-note">{modulesNote}</p> : null}
            <ProgressBar label="Assigned courses completed" value={workspace.courses.length ? Math.round(completedCount / workspace.courses.length * 100) : 0} hasValueLabel />
            <p className="wa-kit-training-muted">{completedCount} of {workspace.courses.length} complete · {hoursRemaining} planned hours in unfinished courses</p>
          </VStack>
          <aside className="wa-kit-training-next">
            <p className="wa-kit-training-eyebrow">{nextCourse ? 'Your next step' : 'Training milestone reached'}</p>
            <h3>{nextCourse?.name ?? 'Bring your work to your next opportunity'}</h3>
            <p>{nextCourse ? `${nextCourse.estimatedHours} planned hours · Pick up here whenever you are ready.` : 'Review your portfolio and plan your next move with your counselor.'}</p>
            {nextCourse ? <ContinueThisCourseButton courseSlug={nextCourse.slug} destinations={destinations} onSelectCourse={selectCourse} /> : <Link href="/dashboard/messages" className="wa-kit-cta wa-kit-focus">Plan with your counselor <ArrowRight size={16} aria-hidden="true" /></Link>}
          </aside>
        </section>
        {syllabusHours && syllabusHours !== totalHours ? <p className="wa-kit-training-notice">The current published syllabus is {syllabusHours} hours. Your existing assignment contains {totalHours} estimated hours; your counselor can explain the difference.</p> : null}

        <nav className="wa-kit-training-tabs" aria-label="Training workspace sections">
          <button type="button" className="wa-kit-focus" aria-pressed={tab === 'courses'} onClick={() => setTab('courses')}><BookOpen size={18} aria-hidden="true" /> Courses &amp; your work</button>
          <button type="button" className="wa-kit-focus" aria-pressed={tab === 'schedule'} onClick={() => setTab('schedule')}><CalendarDays size={18} aria-hidden="true" /> Study schedule</button>
          <span className="wa-kit-training-muted">{savedCount} course{savedCount === 1 ? '' : 's'} with saved work</span>
        </nav>
        {message ? <p className="wa-kit-training-success"><Check size={16} aria-hidden="true" />{message}</p> : null}
        {error ? <p className="wa-kit-training-error">{error}</p> : null}

        {tab === 'schedule' ? (
          <section className="wa-kit-training-schedule" aria-label="Study schedule">
            <form className="wa-kit-training-plan" onSubmit={(event) => { event.preventDefault(); void save('plan'); }}>
              <VStack gap={4}>
                <h2>Make room for your next chapter</h2>
                <p className="wa-kit-training-muted">Choose a pace you can sustain. We will map your unfinished courses into study weeks.</p>
                <label className="wa-kit-training-field">Hours per week<input type="number" min="1" max="40" step="1" required value={weeklyHours} onChange={(event) => setWeeklyHours(event.target.value)} /></label>
                <label className="wa-kit-training-field">Start this schedule on<input type="date" min="0001-01-01" max="9999-12-31" required value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
                <p className="wa-kit-training-estimate">{weeks ? <><strong>{weeks} weeks</strong><span>at {pace} hours per week{finishDate ? ` · through ${dateLabel(finishDate)}` : ''}</span></> : hoursRemaining === 0 ? 'All assigned courses are complete.' : 'Choose between 1 and 40 hours per week.'}</p>
                <Button label={workspace.weeklyHours === null ? 'Save my study schedule' : 'Update study schedule'} type="submit" variant="primary" size="lg" isLoading={saving === 'plan'} isDisabled={!validPace || !isValidPlanDate(startDate) || Boolean(saving)} />
                <p className="wa-kit-training-muted">Planning estimates include the full hours of unfinished courses. Your progress changes only when training completion is recorded.</p>
              </VStack>
            </form>
            <section aria-label="Course study weeks" className="wa-kit-training-weeklist">
              <h2>Your course-by-course schedule</h2>
              {!workspace.weeklyHours ? <p className="wa-kit-training-muted">Preview · save your pace to keep it in your account.</p> : planDirty ? <p className="wa-kit-training-muted">Preview · your changes have not been saved.</p> : <p className="wa-kit-training-muted">Saved pace · adjust it whenever your week changes.</p>}
              <ol>{schedule.map(({ course, firstWeek, lastWeek }) => <li key={course.slug}>
                <span className="wa-kit-training-week">{validPace ? `Week ${firstWeek}${lastWeek > firstWeek ? `–${lastWeek}` : ''}` : 'Choose a pace'}</span>
                <button type="button" className="wa-kit-focus" onClick={() => selectCourse(course.slug)}><strong>{course.name}</strong><span>{course.estimatedHours} planned hours <ArrowRight size={14} aria-hidden="true" /></span></button>
              </li>)}</ol>
              {!remaining.length ? <p>Your assigned courses are complete. Your work is still available in the course workspace.</p> : null}
            </section>
          </section>
        ) : (
          <section className="wa-kit-training-workbench">
            <aside className="wa-kit-training-outline wa-kit-focus" aria-label="Assigned curriculum" ref={outlineRef} tabIndex={-1}>
              <HStack gap={2} hAlign="between" vAlign="center"><h2>Your curriculum</h2><span className="wa-kit-training-muted">{workspace.courses.length} courses</span></HStack>
              <label className="wa-kit-training-field wa-kit-training-filter">Show courses<select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}><option value="all">All courses</option><option value="remaining">Still to complete</option><option value="saved">With saved work</option></select></label>
              <ol className="wa-kit-training-course-list">{filteredCourses.map((course) => {
                const index = workspace.courses.findIndex((row) => row.slug === course.slug);
                const done = completed.has(course.slug);
                return <li key={course.slug}><button type="button" className="wa-kit-focus" aria-current={selectedSlug === course.slug ? 'step' : undefined} onClick={() => selectCourse(course.slug)}>
                  <span className={`wa-kit-training-number${done ? ' is-complete' : ''}`}>{done ? <Check size={16} aria-label="Complete" /> : String(index + 1).padStart(2, '0')}</span>
                  <span className="wa-kit-training-course-name"><strong>{course.name}</strong><span>{course.estimatedHours} hours · {done ? 'Complete' : course.slug === nextCourse?.slug ? 'Next up' : 'To do'}{course.notes || course.artifactUrl ? ' · Work saved' : ''}{dirtySlugs.includes(course.slug) ? ' · Unsaved' : ''}</span></span>
                  <ChevronRight size={16} aria-hidden="true" />
                </button></li>;
              })}</ol>
              {!filteredCourses.length ? <p className="wa-kit-training-muted">{filter === 'saved' ? 'Save notes or a project link in any course to find them here.' : 'No courses left to complete.'}</p> : null}
            </aside>
            <section className="wa-kit-training-editor wa-kit-focus" aria-label="Selected course workspace" ref={editorRef} tabIndex={-1}>
              {selected ? <VStack gap={5}>
                <button type="button" className="wa-kit-training-back wa-kit-focus" onClick={() => { outlineRef.current?.focus({ preventScroll: true }); outlineRef.current?.scrollIntoView({ behavior: 'instant', block: 'start' }); }}>Back to all courses</button>
                <VStack gap={2}>
                  <p className="wa-kit-training-eyebrow">Course {workspace.courses.findIndex((course) => course.slug === selected.slug) + 1} of {workspace.courses.length} · {selected.estimatedHours} hours</p>
                  <h2>{selected.name}</h2>
                  <p className="wa-kit-training-muted">{selected.description ?? 'Follow the assigned course activities and keep your notes and project evidence here.'}</p>
                  {completed.has(selected.slug) ? <p className="wa-kit-training-success"><Check size={16} aria-hidden="true" />Completion recorded</p> : null}
                </VStack>
                {selectedLabs.length ? <section aria-label="Applied support labs"><VStack gap={4}>
                  <VStack gap={2}><h3>{IT_SUPPORT_LAB_SCOPE.title}</h3><p className="wa-kit-training-muted">Practice with supplied support tickets and device logs. Save your evidence, submit it for human feedback, and revise your work.</p></VStack>
                  <ol className="wa-kit-training-labs">{selectedLabs.map((lab) => <li key={lab.id}><Link href={`/dashboard/learning/labs/${lab.id}`} className="wa-kit-focus"><VStack gap={1}><strong>{lab.title}</strong><span>{lab.summary}</span><span className="wa-kit-training-muted">About {lab.estimatedMinutes} minutes · Written evidence and counselor review</span></VStack><ArrowRight size={18} aria-hidden="true" /></Link></li>)}</ol>
                  <p className="wa-kit-training-notice">These four starter labs have about 5 planned hours of activity. Instructional review and time validation are pending; the full 58-hour lab sequence is still being developed.</p>
                </VStack></section> : selectedDestination?.launchHref ? <VStack gap={2}>
                  <TrackedCourseraLaunchLink href={selectedDestination.launchHref} courseSlug={selected.slug} className="wa-kit-cta wa-kit-focus">{completed.has(selected.slug) ? 'Review course in Coursera' : 'Open course in Coursera'} <ArrowRight size={16} aria-hidden="true" /></TrackedCourseraLaunchLink>
                  <p className="wa-kit-training-muted">Opens in a new tab.{trainingEmail ? ` Use your training email: ${trainingEmail}.` : ' Use the training account assigned by your counselor.'}</p>
                </VStack> : selectedDestination?.moduleHref ? <Link href={selectedDestination.moduleHref} className="wa-kit-cta wa-kit-focus">Open lessons and lab <ArrowRight size={16} aria-hidden="true" /></Link> : <p className="wa-kit-training-notice">Use this workspace for your assigned activities. Your counselor can provide the lesson or lab instructions. <Link href="/dashboard/messages">Ask your counselor</Link></p>}

                {selectedPractice ? <section aria-label="Course skill practice">
                  <VStack gap={3}>
                    <h3>Practice this skill</h3>
                    <p><strong>{selectedPractice.missionName}</strong> · About {selectedPractice.estimatedMinutes} minutes</p>
                    <p className="wa-kit-training-muted">{selectedPractice.missionTagline}</p>
                    {selectedPractice.status === 'locked' ? <p className="wa-kit-training-notice">This practice opens when this course&apos;s completion is recorded. You can keep working on your course notes below.</p> : <Button label={selectedPractice.status === 'passed' ? 'Practice this skill again' : selectedPractice.status === 'needs_retry' ? 'Try this skill practice again' : 'Start this skill practice'} variant="secondary" size="lg" onClick={() => setActiveMission(selectedPractice)} />}
                    {selectedPractice.latestResult ? <VStack gap={2}>
                      <p className="wa-kit-training-eyebrow">{selectedPractice.status === 'passed' ? 'Practice passed' : 'Practice feedback · try again'}</p>
                      <p>{selectedPractice.latestResult.coachingNote}</p>
                      {selectedPractice.status === 'passed' && selectedPractice.latestResult.resumeBullet ? <><h4>Your resume draft</h4><p>{selectedPractice.latestResult.resumeBullet}</p><p className="wa-kit-training-muted">Review this wording for accuracy before adding it to your resume.</p></> : null}
                    </VStack> : null}
                    <p className="wa-kit-training-muted">A short quiz and written scenario with feedback. This practice does not award a credential or replace your course assessment.</p>
                  </VStack>
                </section> : practiceUnavailable ? <p className="wa-kit-training-notice">Course practice could not load. <Link href="/dashboard/missions">Try the Skill Missions page</Link>.</p> : null}

                <form onSubmit={(event) => { event.preventDefault(); void save('coursework'); }}>
                  <VStack gap={4}>
                    <HStack gap={2} vAlign="center"><FileCheck2 size={20} aria-hidden="true" /><h3>Your work, kept here</h3></HStack>
                    <p className="wa-kit-training-muted">Capture what you tried, what worked, and the evidence you could explain in an interview.</p>
                    <TextArea label="Course notes and project reflection" value={draft.notes} onChange={(notes) => setDrafts((current) => ({ ...current, [selectedSlug]: { ...draft, notes } }))} rows={8} maxLength={10000} placeholder="What problem did you work on? What steps did you take? What did you learn or improve?" />
                    <TextInput label="Project or evidence link" value={draft.artifactUrl} onChange={(artifactUrl) => setDrafts((current) => ({ ...current, [selectedSlug]: { ...draft, artifactUrl } }))} placeholder="https://…" description="A repository, document, slide deck, or other work sample. Optional." />
                    <HStack gap={3} wrap="wrap" vAlign="center"><Button label="Save course work" type="submit" variant="secondary" size="lg" isLoading={saving === selectedSlug} isDisabled={Boolean(saving) || draft.notes.length > 10000 || draft.artifactUrl.length > 2000} /><span className="wa-kit-training-muted">{dirtySlugs.includes(selectedSlug) ? 'Unsaved changes' : selected.updatedAt ? 'Saved in your account' : 'Your notes stay with this course'}</span></HStack>
                    <p className="wa-kit-training-muted">Saving work keeps your draft. It does not submit an assessment or mark the course complete.</p>
                  </VStack>
                </form>
                <footer className="wa-kit-training-tools">
                  <h3>Put this learning to work</h3>
                  <Link href="/dashboard/missions"><FileCheck2 size={18} aria-hidden="true" /><span><strong>Practice with Skill Missions</strong><small>Apply your skills and get feedback.</small></span><ArrowRight size={16} aria-hidden="true" /></Link>
                  <Link href="/dashboard/resume"><Save size={18} aria-hidden="true" /><span><strong>Build your resume</strong><small>Turn the work into a career story.</small></span><ArrowRight size={16} aria-hidden="true" /></Link>
                  <Link href={`/dashboard/messages?${new URLSearchParams({ program: workspace.programSlug, course: selected.slug, curriculum: workspace.curriculumVersion }).toString()}`}><MessageCircle size={18} aria-hidden="true" /><span><strong>Ask for feedback on this course</strong><small>Review a message with this course and your saved project link.</small></span><ArrowRight size={16} aria-hidden="true" /></Link>
                </footer>
              </VStack> : (
                // `empty.assignedCourses`: a workspace exists only for a pinned
                // enrollment, so no selectable course means the curriculum has no
                // published courses — unavailable, not "not ready yet".
                <KitEmptyState
                  kind="unavailable"
                  tone="info"
                  headingAs="h2"
                  title={te('assignedCourses.title')}
                  description={te('assignedCourses.body')}
                  primaryAction={{ href: '/dashboard/messages', label: te('assignedCourses.action') }}
                />
              )}
            </section>
          </section>
        )}
        <p className="wa-kit-training-footnote"><Clock3 size={16} aria-hidden="true" /> Course hours are curriculum estimates. Completion shown here uses your existing training records.</p>
        {activeMission ? <section>
          <SkillMissionChallenge mission={activeMission} onClose={closeMission} onComplete={closeMission} />
        </section> : null}
      </main>
    </DesignSurface>
  );
}
