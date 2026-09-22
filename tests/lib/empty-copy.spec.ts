import { describe, expect, it } from 'vitest';

import en from '@/messages/en.json';
import es from '@/messages/es.json';
import fr from '@/messages/fr.json';
import pt from '@/messages/pt.json';

/**
 * The `empty.*` namespace (KIT_GUIDE §6) is the one place the member empty
 * states get their words. One sentence pattern per situation:
 *  - first:       "No X yet" + what appears here and the first action
 *  - filtered:    "No X match these filters" + Clear filters
 *  - unavailable: what could not load + Try again (or, when nothing failed,
 *                 the honest reason and the real next steps)
 *  - messages:    a thread with nothing sent is "No messages yet" and its action is
 *                 writing; the inbox guards (provisioning, no thread in an audit)
 *                 say what is not ready, never "No messages yet"
 * Copy rules moved here from lib/member/jobApplicationsEmptyState.test.ts
 * when that module's hardcoded sentences moved into messages.
 */

type Leaf = Record<string, string>;
type Namespace = Record<string, Leaf>;
const LOCALES: Record<string, Namespace> = { en: en.empty, es: es.empty, fr: fr.empty, pt: pt.empty };

function shape(ns: Namespace): string[] {
  return Object.entries(ns).flatMap(([group, leaf]) => Object.keys(leaf).map((k) => `${group}.${k}`)).sort();
}

describe('empty.* copy', () => {
  it('has the same keys, all filled, in en/es/fr/pt', () => {
    const reference = shape(LOCALES.en);
    expect(reference.length).toBeGreaterThanOrEqual(104);
    for (const [locale, ns] of Object.entries(LOCALES)) {
      expect(shape(ns), locale).toEqual(reference);
      for (const [group, leaf] of Object.entries(ns)) {
        for (const [k, v] of Object.entries(leaf)) expect(v.trim(), `${locale} empty.${group}.${k}`).not.toBe('');
      }
    }
  });

  it('first states name the thing, say what appears here, and end on the first action', () => {
    for (const group of ['activeApplications', 'applications', 'matches'] as const) {
      const leaf = en.empty[group];
      expect(leaf.title).toMatch(/^No .+/);
      expect(leaf.body).toMatch(/appear here/);
      expect(leaf.body.length).toBeLessThanOrEqual(140);
    }
    expect(en.empty.activeApplications.action.length).toBeGreaterThan(0);
    expect(en.empty.applications.action.length).toBeGreaterThan(0);
    expect(en.empty.matches.browse.length).toBeGreaterThan(0);
    // The home pipeline lists saved rows too and only the member closes a row —
    // no employer action exists, so the sentence must not claim one.
    expect(en.empty.activeApplications.body).toMatch(/save or apply/);
    expect(en.empty.activeApplications.body).toMatch(/you mark them/);
    expect(en.empty.activeApplications.body).not.toMatch(/employer/i);
    expect(en.empty.applications.title).toBe('No applications yet');
    expect(en.empty.applications.body).toMatch(/openings/i);
    expect(en.empty.stage.title).toBe('Nothing in this stage');
  });

  it('the filtered state is "No X match these filters" with a clear-filters action', () => {
    expect(en.empty.jobsFiltered.title).toBe('No jobs match these filters');
    expect(en.empty.jobsFiltered.action).toBe('Clear filters');
    expect(en.empty.jobsFiltered.body).toMatch(/clear/i);
  });

  it('unavailable states say what could not load and offer a retry, or the honest reason and a real route', () => {
    expect(en.empty.matchesUnavailable.title).toMatch(/could not load$/);
    expect(en.empty.matchesUnavailable.action).toBe('Try again');
    for (const group of ['openings', 'openingsPublic'] as const) {
      expect(en.empty[group].title).toBe('No live openings right now');
      expect(en.empty[group].body).toMatch(/have not posted live roles yet/);
      expect(en.empty[group].body).not.toMatch(/\[Demo\]|seed|Capital Area/i);
    }
  });

  it('messages: threads with nothing sent are "No messages yet" + Write a message; guards and failures say what is not ready', () => {
    for (const group of ['thread', 'counselorThread', 'teamThreadEmployer', 'teamThreadPartner', 'applicationThread'] as const) {
      expect(en.empty[group].title).toBe('No messages yet');
      expect(en.empty[group].action).toBe('Write a message');
      expect(en.empty[group].body.length).toBeLessThanOrEqual(140);
    }
    // #2492's employer / partner sentences survive verbatim (as the body).
    expect(en.empty.teamThreadEmployer.body).toBe('Ask a question about job postings, applications, or candidate matches.');
    expect(en.empty.teamThreadPartner.body).toBe('Reach out about referrals, milestones, or program questions.');
    // Unassigned is honest: no counselor yet, writing still works, staff read it.
    expect(en.empty.counselorUnassigned.title).toBe('No counselor assigned yet');
    expect(en.empty.counselorUnassigned.body).toMatch(/still write/);
    expect(en.empty.counselorUnassigned.body).toMatch(/staff read/);
    for (const group of ['inboxProvisioning', 'inboxUnavailable'] as const) {
      expect(en.empty[group].title).not.toMatch(/^No messages/);
      expect(en.empty[group].action.length).toBeGreaterThan(0);
    }
    expect(en.empty.conversationsFiltered.title).toMatch(/^No .+ match this search$/);
    expect(en.empty.conversationsFiltered.action).toBe('Clear search');
    expect(en.empty.applicationThreadUnavailable.title).toMatch(/could not load$/);
    expect(en.empty.applicationThreadUnavailable.action).toBe('Try again');
  });

  it('training surfaces: certificates keep the #2471 sentence; unpublished curricula are unavailable with a counselor route', () => {
    // #2471 / item 4 words survive verbatim as the legacy body; the kit body
    // drops only the self-add clause (the kit view has no add form).
    expect(en.empty.certificates.title).toBe('No certificates yet');
    expect(en.empty.certificates.body).toBe(
      'No certificates are recorded yet. When Coursera reports a completed course we add it here as a pending certificate; our team verifies it before it counts as earned. Completed Coursera courses show in My program, and you can also add a certificate you earned elsewhere below.',
    );
    expect(en.empty.certificates.bodyKit).toMatch(/^When Coursera reports a completed course it appears here as a pending certificate; our team verifies it before it counts as earned\./);
    expect(en.empty.certificates.bodyKit).not.toMatch(/add a certificate/i);
    expect(en.empty.certificates.action).toBe('Add a certificate');
    expect(en.empty.certificates.secondary).toBe('My program');
    // First states: the thing, what appears here, the first action.
    expect(en.empty.learningPathway.title).toBe('No active learning pathway');
    expect(en.empty.learningPathway.action).toBe('Start digital basics, no application needed');
    expect(en.empty.enrolledCourses.title).toBe('No enrolled classes yet');
    expect(en.empty.enrolledCourses.body).toMatch(/appears here/);
    for (const group of ['categoryScores', 'milestones'] as const) {
      expect(en.empty[group].title).toMatch(/^No .+ yet$/);
      expect(en.empty[group]).not.toHaveProperty('action');
    }
    // Unavailable states never say "will appear here once …": a missing
    // curriculum, resource list or score is not something the member unlocks.
    for (const group of ['learningPathwayUnavailable', 'enrolledCoursesUnavailable', 'modules', 'assignedCourses', 'programResources'] as const) {
      expect(en.empty[group].body).toMatch(/counselor/);
      expect(en.empty[group].body).not.toMatch(/once you|when your enrollment|will appear/i);
      expect(en.empty[group].action).toBe('Message counselor');
    }
    expect(en.empty.resourcesFiltered.title).toBe('No resources match these filters');
    expect(en.empty.resourcesFiltered.action).toBe('Clear filters');
    expect(en.empty.resourcesUnavailable.action.length).toBeGreaterThan(0);
    expect(en.empty.readinessUnavailable.title).toBe("Couldn't load your readiness score");
  });

  it('never promises a reply time', () => {
    for (const [locale, ns] of Object.entries(LOCALES)) {
      expect(JSON.stringify(ns), locale).not.toMatch(/business day|día(s)? hábil|jour(s)? ouvr|dia(s)? útei|dia útil|within \d|\d+ ?(hours|horas|heures)/i);
    }
  });

  it('never stalls the member with "check back soon" / "coming soon"', () => {
    for (const [locale, ns] of Object.entries(LOCALES)) {
      const text = JSON.stringify(ns);
      expect(text, locale).not.toMatch(/check back soon|coming soon|próximamente|bientôt disponible|em breve/i);
    }
  });
});
