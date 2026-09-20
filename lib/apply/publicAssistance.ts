/**
 * TANF / WIC / SNAP follow-up questions (WAP-53).
 *
 * The apply flow, member eligibility form, public questionnaire and WIOA
 * self-screening all ask one yes/no: "Are you receiving TANF, WIC, and/or
 * food stamps (SNAP)?" (`snapWic` / `publicAssistanceSelfReport`). After a
 * Yes they now also capture WHICH programs and whether the person wants help
 * applying. Both answers are stored separately from the yes/no so:
 *
 *  - old payloads and snapshots that only carry the yes/no still parse
 *    (programs default to [] and help to null);
 *  - a request for help applying is a staff action signal, never evidence of
 *    enrollment;
 *  - WIC on its own is not treated as a definitive WIOA low-income indicator.
 */
import { z } from 'zod';
import { isYesNo, type YesNo } from './eligibilityExtendedFields';

export const PUBLIC_ASSISTANCE_PROGRAM_VALUES = ['tanf', 'wic', 'snap', 'other_unsure'] as const;
export type PublicAssistanceProgram = (typeof PUBLIC_ASSISTANCE_PROGRAM_VALUES)[number];

/** Staff-facing English labels; member UIs translate their own. */
export const PUBLIC_ASSISTANCE_PROGRAM_LABELS: Record<PublicAssistanceProgram, string> = {
  tanf: 'TANF',
  wic: 'WIC',
  snap: 'SNAP / food stamps',
  other_unsure: 'Other / unsure',
};

export type PublicAssistanceFollowUp = {
  /** Selected programs; empty unless the parent answer is yes. */
  publicAssistancePrograms: PublicAssistanceProgram[];
  /** Separate from receipt: does the person want help applying? */
  publicAssistanceHelpRequested: YesNo | null;
};

export const EMPTY_PUBLIC_ASSISTANCE_FOLLOW_UP: PublicAssistanceFollowUp = {
  publicAssistancePrograms: [],
  publicAssistanceHelpRequested: null,
};

/** Optional/nullable so pre-existing clients that never send the keys still validate. */
export const publicAssistanceFollowUpSchema = {
  publicAssistancePrograms: z
    .array(z.enum(PUBLIC_ASSISTANCE_PROGRAM_VALUES))
    .max(PUBLIC_ASSISTANCE_PROGRAM_VALUES.length)
    .optional()
    .nullable(),
  publicAssistanceHelpRequested: z.enum(['yes', 'no']).optional().nullable(),
};

export function isPublicAssistanceProgram(value: unknown): value is PublicAssistanceProgram {
  return typeof value === 'string' && (PUBLIC_ASSISTANCE_PROGRAM_VALUES as readonly string[]).includes(value);
}

/** Dedupe, drop unknown values, keep canonical order. Tolerates legacy junk. */
export function normalizePublicAssistancePrograms(value: unknown): PublicAssistanceProgram[] {
  if (!Array.isArray(value)) return [];
  const selected = new Set(value.filter(isPublicAssistanceProgram));
  return PUBLIC_ASSISTANCE_PROGRAM_VALUES.filter((program) => selected.has(program));
}

/**
 * Resolve the follow-up from any payload. When the parent answer is not yes
 * the follow-ups are cleared, so a member who flips Yes -> No never leaves a
 * stale program list or help request behind.
 */
export function normalizePublicAssistanceFollowUp(input: {
  snapWic: unknown;
  publicAssistancePrograms?: unknown;
  publicAssistanceHelpRequested?: unknown;
}): PublicAssistanceFollowUp {
  if (input.snapWic !== 'yes') return { ...EMPTY_PUBLIC_ASSISTANCE_FOLLOW_UP };
  return {
    publicAssistancePrograms: normalizePublicAssistancePrograms(input.publicAssistancePrograms),
    publicAssistanceHelpRequested: isYesNo(input.publicAssistanceHelpRequested)
      ? input.publicAssistanceHelpRequested
      : null,
  };
}

/**
 * Validation for the API layer. At least one program is required after Yes
 * (acceptance 2), but only when the client sent the field at all: a payload
 * from an older client that never knew about programs still parses
 * (acceptance 4). New clients always send the array, so their users cannot
 * skip it.
 */
export function publicAssistanceFollowUpIssue(input: {
  snapWic: unknown;
  publicAssistancePrograms: unknown;
}): string | null {
  if (input.snapWic !== 'yes') return null;
  if (input.publicAssistancePrograms === undefined || input.publicAssistancePrograms === null) return null;
  if (normalizePublicAssistancePrograms(input.publicAssistancePrograms).length === 0) {
    return 'Select at least one benefit you receive (TANF, WIC, SNAP, or Other/unsure).';
  }
  return null;
}

/** UI gate: after Yes the follow-ups must be answered before continuing. */
export function publicAssistanceFollowUpComplete(input: {
  snapWic: YesNo | null;
  publicAssistancePrograms: readonly string[];
  publicAssistanceHelpRequested: YesNo | null;
}): boolean {
  if (input.snapWic !== 'yes') return true;
  return input.publicAssistancePrograms.length > 0 && input.publicAssistanceHelpRequested !== null;
}

/**
 * WIC alone is a nutrition benefit with its own income test; it is not a
 * WIOA categorical low-income qualifier the way TANF and SNAP are, so it must
 * not be presented as definitive eligibility (acceptance 6).
 */
export function wicOnlyPublicAssistance(programs: readonly string[] | null | undefined): boolean {
  if (!programs || programs.length === 0) return false;
  return programs.every((program) => program === 'wic');
}

export function formatPublicAssistancePrograms(programs: readonly string[] | null | undefined): string {
  return normalizePublicAssistancePrograms(programs ?? [])
    .map((program) => PUBLIC_ASSISTANCE_PROGRAM_LABELS[program])
    .join(', ');
}
