import type { Program } from '@/lib/content/programs';
import { getProgramExtra } from '@/lib/content/programExtras';

/** Concatenate fields users might type when looking for a program. */
export function buildProgramSearchHaystack(p: Program): string {
  const extra = getProgramExtra(p.slug);
  const parts: string[] = [
    p.title,
    p.category,
    p.categoryLabel,
    p.slug.replace(/-/g, ' '),
    p.partner,
    p.duration,
    ...p.skills,
    ...p.courses.map((c) => c.name),
  ];
  if (extra) {
    parts.push(extra.bestFor, ...(extra.jobOutcomes ?? []));
    if (extra.rampNote) parts.push(extra.rampNote);
  }
  return parts.join(' ').toLowerCase();
}

/**
 * Multi-word query: every token must appear somewhere in the haystack (AND).
 * Empty query matches all.
 */
export function programMatchesSearchQuery(p: Program, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  const hay = buildProgramSearchHaystack(p);
  const tokens = q.split(/\s+/).filter(Boolean);
  return tokens.every((t) => hay.includes(t));
}
