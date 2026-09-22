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
    expect(reference.length).toBeGreaterThanOrEqual(27);
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
      expect(leaf.action.length).toBeGreaterThan(0);
    }
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

  it('never stalls the member with "check back soon" / "coming soon"', () => {
    for (const [locale, ns] of Object.entries(LOCALES)) {
      const text = JSON.stringify(ns);
      expect(text, locale).not.toMatch(/check back soon|coming soon|próximamente|bientôt disponible|em breve/i);
    }
  });
});
