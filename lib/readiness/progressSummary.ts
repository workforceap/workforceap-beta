import { sanitizeAIOutput } from '@/lib/ai/postProcess';
import type {
  ReadinessCategoryKey,
  ReadinessProgressView,
} from '@/lib/readiness/progressView';

export type ReadinessSummarySource = 'factual' | 'ai' | 'error';

export const READINESS_SCORE_LOAD_ERROR =
  "We couldn't load your readiness score just now. Refresh the page. If this keeps happening, message your counselor.";

export const READINESS_EMPTY_RECAP =
  'No scored activity yet. Your readiness score starts at 0 until profile, resume, training, applications, or recent activity show up in your account.';

/**
 * The numbers the coach-note card prints itself, straight from the score
 * model. Serializable so the server page can hand it to the client card;
 * the AI text is never allowed to restate them.
 */
export type ReadinessRecapBreakdown = {
  overallScore: number;
  overallMax: number;
  weakestKey: ReadinessCategoryKey | null;
  categories: {
    key: ReadinessCategoryKey;
    label: string;
    earned: number;
    max: number;
    pct: number;
  }[];
};

export function buildReadinessRecapBreakdown(view: ReadinessProgressView): ReadinessRecapBreakdown {
  return {
    overallScore: view.overallScore,
    overallMax: view.overallMax,
    weakestKey: view.weakestCategory,
    categories: view.categories.map((cat) => ({
      key: cat.key,
      label: cat.label,
      earned: cat.earned,
      max: cat.max,
      pct: cat.pct,
    })),
  };
}

function joinList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function openItems(view: ReadinessProgressView, key: ReadinessCategoryKey): string[] {
  const cat = view.categories.find((c) => c.key === key);
  if (!cat) return [];
  return cat.items
    .filter((item) => item.earned < item.max)
    .map((item) => `${item.label} (${item.earned}/${item.max})`);
}

/**
 * Deterministic "why and what next" prose from the same numbers the card
 * prints above it. Paragraphs are newline-separated. Used when AI is off,
 * rate-limited, or the model output fails the grounding check.
 */
export function buildFactualReadinessRecap(view: ReadinessProgressView): string {
  const next = view.priorityAction
    ? `Next: ${view.priorityAction.label}`
    : 'Every scored area is complete.';

  if (view.overallEarned === 0) {
    return [READINESS_EMPTY_RECAP, view.priorityAction ? next : ''].filter(Boolean).join('\n');
  }

  const weakest = view.categories.find((cat) => cat.key === view.weakestCategory) ?? null;
  const parts: string[] = [];

  if (weakest) {
    const open = openItems(view, weakest.key);
    parts.push(
      open.length > 0
        ? `${weakest.label} is your lowest area because ${joinList(open)} ${open.length === 1 ? 'is' : 'are'} still open.`
        : `${weakest.label} is your lowest area.`,
    );
    const others = view.categories.filter((cat) => cat.pct < 100 && cat.key !== weakest.key);
    if (others.length > 0) {
      parts.push(
        others
          .map((cat) => {
            const open = openItems(view, cat.key);
            return open.length > 0
              ? `${cat.label} also has ${joinList(open)} open.`
              : `${cat.label} is also under 100%.`;
          })
          .join(' '),
      );
    }
  }

  parts.push(next);
  return parts.map((part) => part.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

export function buildReadinessSummaryPrompt(view: ReadinessProgressView): {
  system: string;
  user: string;
} {
  const weakest = view.categories.find((cat) => cat.key === view.weakestCategory) ?? null;
  const facts = {
    overallScore: view.overallScore,
    scoreMax: view.overallMax,
    areas: view.categories.map((cat) => ({
      label: cat.label,
      pct: cat.pct,
      earned: cat.earned,
      max: cat.max,
      openItems: cat.items
        .filter((item) => item.earned < item.max)
        .map((item) => ({ label: item.label, earned: item.earned, max: item.max })),
      doneItems: cat.items.filter((item) => item.earned >= item.max).map((item) => item.label),
    })),
    lowestArea: weakest?.label ?? null,
    nextAction: view.priorityAction?.label ?? 'Every scored area is complete.',
  };

  return {
    system: `You write the short coach note under a WorkforceAP member's readiness score card.
The card already prints the score out of 100 and every area's points and percent. Do NOT repeat any score, percentage, or point total, and do not list the areas.
Use ONLY the supplied JSON facts. Do not invent applications, certificates, interviews, employers, dates, or scores.
Explain in plain words why the lowest area (lowestArea) is where it is, using only its openItems. Never suggest an item listed in doneItems.
End with the fixed next step in nextAction. Do not propose a different first step.
Neutral, encouraging tone. No praise words, no exclamation marks, no greeting, no sign-off, no markdown, no bullets, no numbered lists.
Write 2-3 short sentences in second person as one paragraph. If you need a second paragraph, separate paragraphs with a blank line.`,
    user: JSON.stringify(facts),
  };
}

const RESTATED_TOTAL = /\d+\s*(?:out\s+)?of\s*\d+/i;
const LIST_MARKER = /(?:^|\s)(?:\d+\.|[-•*])\s+\S/g;

/** Digits the note may contain: only those in the fixed next-step sentence (e.g. "3 jobs"). */
function allowedDigitRuns(view: ReadinessProgressView): Set<string> {
  return new Set([...(view.priorityAction?.label ?? '').matchAll(/\d+/g)].map((m) => m[0]));
}

/**
 * Grounding gate for the model text. The card prints every number, so the
 * prose may not contain any digits except those in the next-step sentence
 * it is told to end with. Also rejects "%", "N of M", exclamation marks
 * (praise) and list-shaped output (two or more "1. " / "- " markers).
 */
export function readinessSummaryLooksGrounded(text: string, view: ReadinessProgressView): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 40 || trimmed.length > 900) return false;
  if (trimmed.includes('%') || trimmed.includes('!') || RESTATED_TOTAL.test(trimmed)) return false;
  if ([...trimmed.matchAll(LIST_MARKER)].length >= 2) return false;
  const allowed = allowedDigitRuns(view);
  return [...trimmed.matchAll(/\d+/g)].every((m) => allowed.has(m[0]));
}

/** Strip markdown, collapse horizontal whitespace, keep single newlines as paragraph breaks. */
export function cleanReadinessSummary(text: string): string {
  return sanitizeAIOutput(text)
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

/** Newline-separated paragraphs for the renderer. */
export function splitReadinessSummary(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
