/**
 * Contract hours for a two-stage J5/J6 document: 160, except the AI &
 * Software program at 200.
 *
 * Rule (Mike Brown, 2026-09-27 review): canonicalize the enrolled program
 * slug with `canonicalizeProgramSlug`, then take `totalHours` from the
 * approved TWC syllabus (`shared/programSyllabi.ts`). The only 200-hour
 * program is the IBM AI and Software Developer certificate,
 * `software-developer-professional-certificate-ibm` (legacy alias
 * `ai-and-software-development-professional-certificate-ibm`). The catalog
 * category `ai-software` is NOT used: the AWS AI Practitioner shares it and
 * is 160 hours. Display names are never matched.
 *
 * Fails closed: an unknown slug, a program without an approved syllabus, or a
 * syllabus whose hours disagree with the 160/200 contract returns an error
 * rather than defaulting to 160.
 */
import { canonicalizeProgramSlug } from '@/lib/content/programSlug';
import { getProgramSyllabus, type ProgramSyllabus } from '@/shared/programSyllabi';
import { AI_SOFTWARE_CONTACT_HOURS, STANDARD_CONTACT_HOURS } from './constants';

/** The one program billed at 200 hours. */
export const AI_SOFTWARE_CANONICAL_SLUG = 'software-developer-professional-certificate-ibm';

export type ContractHours = typeof STANDARD_CONTACT_HOURS | typeof AI_SOFTWARE_CONTACT_HOURS;

export type ProgramTerms =
  | { ok: true; canonicalSlug: string; hours: ContractHours; className: string; source: 'approved_syllabus' }
  | { ok: false; canonicalSlug: string; reason: 'missing_program' | 'no_approved_syllabus' | 'hours_outside_contract'; message: string };

type SyllabusLookup = (slug: string) => Pick<ProgramSyllabus, 'slug' | 'title' | 'totalHours'> | undefined;

export function expectedContractHours(canonicalSlug: string): ContractHours {
  return canonicalSlug === AI_SOFTWARE_CANONICAL_SLUG ? AI_SOFTWARE_CONTACT_HOURS : STANDARD_CONTACT_HOURS;
}

/** Class name and contract hours for an enrolled program slug (canonical or legacy alias). */
export function resolveProgramTerms(rawSlug: string | null | undefined, lookup: SyllabusLookup = getProgramSyllabus): ProgramTerms {
  const canonicalSlug = canonicalizeProgramSlug(rawSlug ?? '');
  if (!canonicalSlug) {
    return { ok: false, canonicalSlug, reason: 'missing_program', message: 'The student has no enrolled program to bill.' };
  }
  const syllabus = lookup(canonicalSlug);
  if (!syllabus || syllabus.slug !== canonicalSlug) {
    return {
      ok: false,
      canonicalSlug,
      reason: 'no_approved_syllabus',
      message: `No approved syllabus for "${canonicalSlug}", so its contract hours are unknown. J5/J6 documents cannot be issued for it.`,
    };
  }
  const expected = expectedContractHours(canonicalSlug);
  if (syllabus.totalHours !== expected) {
    return {
      ok: false,
      canonicalSlug,
      reason: 'hours_outside_contract',
      message: `The approved syllabus lists ${syllabus.totalHours} hours for "${canonicalSlug}", but the billing contract expects ${expected}. Resolve with the program owner before issuing.`,
    };
  }
  return { ok: true, canonicalSlug, hours: expected, className: syllabus.title, source: 'approved_syllabus' };
}
