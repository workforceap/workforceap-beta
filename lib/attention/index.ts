/**
 * Attention model — "who needs attention", once, for the admin and counselor
 * portals. Rules: `reasons.ts` (vocabulary + thresholds), `rules.ts`
 * (predicates), `evaluate.ts` (per-member + queue). IO: `loadFacts.ts`,
 * `counselor.ts`, `admin.ts` (server-only). Views: `counselorViews.ts`,
 * `adminViews.ts`.
 */

export * from './reasons';
export * from './rules';
export * from './evaluate';
export * from './counselorViews';
export * from './adminViews';
