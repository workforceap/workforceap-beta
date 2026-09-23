import { describe, expect, it } from 'vitest';

import en from '@/messages/en.json';
import es from '@/messages/es.json';
import fr from '@/messages/fr.json';
import pt from '@/messages/pt.json';

/**
 * The member rail's three disclosures read their headings from `group.*`
 * (WorkspaceShell's tGroup). Since WAP-189 moved My progress and Skill
 * missions under "Training & progress", a missing heading hides two daily
 * destinations behind an English fallback, so every locale carries all three.
 */
const MEMBER_GROUP_KEYS = ['memberTools', 'memberProgress', 'memberAccount'] as const;

describe('member rail group headings', () => {
  it.each([
    ['en', en],
    ['es', es],
    ['fr', fr],
    ['pt', pt],
  ])('%s names every member rail group', (_locale, catalog) => {
    const group = (catalog as { group?: Record<string, string> }).group ?? {};
    for (const key of MEMBER_GROUP_KEYS) {
      expect(group[key], key).toEqual(expect.any(String));
      expect(group[key]?.trim().length, key).toBeGreaterThan(0);
    }
  });

  it('translates the headings outside English', () => {
    for (const catalog of [es, fr, pt]) {
      const group = (catalog as { group: Record<string, string> }).group;
      for (const key of MEMBER_GROUP_KEYS) {
        expect(group[key]).not.toBe((en as { group: Record<string, string> }).group[key]);
      }
    }
  });
});
