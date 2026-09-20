/**
 * Groq model ids the provider has decommissioned. Requests for them fail with
 * a model-decommissioned error, which is how the hourly Coursera auto-heal
 * career-os step died in production (WAP-74). This module is the only place
 * these ids may appear outside tests: `orderGroqModels` and the `GROQ_MODEL`
 * override drop them at runtime, and `scripts/lint/verify-no-retired-groq-models.mjs`
 * (run by `npm run lint`) fails CI when one appears in lib/, app/ or scripts/.
 */
export const RETIRED_GROQ_MODEL_IDS: ReadonlySet<string> = new Set([
  'llama3-8b-8192',
  'llama3-70b-8192',
  'mixtral-8x7b-32768',
]);

export function isRetiredGroqModel(id: string | undefined | null): boolean {
  return typeof id === 'string' && RETIRED_GROQ_MODEL_IDS.has(id.trim());
}
