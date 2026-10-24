'use client';

import Link from 'next/link';
import { CheckCircle2, ChevronDown, ClipboardCheck, Wand2 } from 'lucide-react';
import styles from './MemberStartHereCard.module.css';

/**
 * Pinned "Start here" shortcuts under the home greeting.
 *
 * Ops (10/8/26): members were not finding the WIOA Preassessment or the AI
 * Career Tools because both sat below several other cards (4 of 141 members
 * had completed the preassessment). These two links are always shown, at the
 * top, as plain large buttons; the preassessment one turns into a quiet
 * "done" link once taken so it never nags.
 *
 * Tool list + "See all" use `.wa-kit-start-here-*` (portal-kit.css) so titles,
 * descriptions, and the footer link share hierarchy with other member home
 * kit cards — not bare magenta link blocks.
 */
export default function MemberStartHereCard({
  preassessmentHref = '/dashboard/assessment',
  toolkitHref = '/dashboard/ai-tools',
  preassessmentCompleted,
}: {
  preassessmentHref?: string;
  toolkitHref?: string;
  preassessmentCompleted: boolean;
}) {
  return (
    <section
      aria-labelledby="member-start-here-heading"
      className="wa-kit-card wa-kit-start-here"
      data-testid="member-start-here"
    >
      <h2 id="member-start-here-heading" className={`wa-kit-start-here__heading ${styles.heading}`}>
        Start here
      </h2>
      <div className="wa-kit-start-here__actions">
        <Link
          href={preassessmentHref}
          className={
            preassessmentCompleted
              ? 'wa-kit-cta wa-kit-cta--ghost wa-kit-start-here__cta wa-min-h-11'
              : 'wa-kit-cta wa-kit-start-here__cta wa-min-h-11'
          }
          data-done={preassessmentCompleted ? 'true' : 'false'}
        >
          {preassessmentCompleted ? (
            <CheckCircle2 size={22} aria-hidden="true" />
          ) : (
            <ClipboardCheck size={22} aria-hidden="true" />
          )}
          <span className="wa-kit-start-here__cta-copy">
            <strong>WIOA Preassessment</strong>
            <span className="wa-kit-meta">
              {preassessmentCompleted ? 'Done. View your results' : '35 questions for your counselor'}
            </span>
          </span>
        </Link>
        <Link
          href={toolkitHref}
          className="wa-kit-cta wa-kit-cta--ghost wa-kit-start-here__cta wa-min-h-11"
        >
          <Wand2 size={22} aria-hidden="true" />
          <span className="wa-kit-start-here__cta-copy">
            <strong>AI Career Tools</strong>
            <span className="wa-kit-meta">Resume, interview practice, cover letters</span>
          </span>
        </Link>
      </div>
      {/* One tap away instead of a 300px list under the two shortcuts. */}
      <details className={styles.tools}>
        <summary className={`wa-kit-focus ${styles.toolsSummary}`}>
          <h3 className={styles.toolsHeading}>What the AI Career Tools do</h3>
          <ChevronDown className={styles.chevron} size={16} aria-hidden="true" />
        </summary>
        <ul className="wa-kit-start-here__tools" data-testid="member-start-here-tools">
          {START_HERE_TOOLS.map((tool) => (
            <li key={tool.href}>
              <Link href={tool.href} className="wa-kit-start-here__tool wa-kit-focus">
                <strong>{tool.title}</strong>
                <span className="wa-kit-meta">{tool.body}</span>
              </Link>
            </li>
          ))}
        </ul>
      </details>
      <Link
        href={`${toolkitHref}?tab=toolkit`}
        className="wa-kit-start-here__see-all wa-kit-focus hover:wa-opacity-80 wa-transition-opacity wa-duration-150 motion-reduce:wa-transition-none"
      >
        See all the AI Career Tools →
      </Link>
    </section>
  );
}

/**
 * The four tools members reach for first, in plain words. Copy mirrors the
 * full list in VoiceStudioKit's "All Tools" tab (TOOLKIT_STEPS).
 */
export const START_HERE_TOOLS = [
  { title: 'Resume Studio', body: 'score your resume and get it rewritten', href: '/dashboard/ai-tools/resume-studio' },
  { title: 'Interview Practice', body: 'live mock interviews with voice coaching', href: '/dashboard/ai-tools/interview-practice' },
  { title: 'Cover Letter', body: 'a letter tailored to any job you saved', href: '/dashboard/ai-tools/cover-letter' },
  { title: 'Job Match Scorer', body: 'see how well you fit a specific job', href: '/dashboard/ai-tools/job-match-scorer' },
] as const;
