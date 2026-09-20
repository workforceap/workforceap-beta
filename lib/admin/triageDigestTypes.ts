/**
 * Shapes for the admin "Who needs you today" digest. Pure (no Prisma), so the
 * attention model's admin view adapter and its tests can import them.
 */

import type { HealthStatus } from '@/lib/admin/healthScore';

export type TriageMember = {
  id: string;
  fullName: string;
  /** Program name or null. */
  program: string | null;
  /** Days since last activity (null = never). */
  daysSinceActivity: number | null;
  /** Health badge color + label. */
  health: { status: HealthStatus; label: string; color: string } | null;
  /** Plain-language action label. */
  action: string;
  /** Where the "open" link for this person should point. */
  href: string;
};

export type TriageBucketKey = 'new-applicants' | 'at-risk' | 'stalled';

export type TriageBucket = {
  key: TriageBucketKey;
  /** Total members matching this bucket (may exceed `members.length`). */
  count: number;
  /** Plain-language headline shown on the card. */
  label: string;
  /** The rule behind the number, printed under the headline. */
  definition: string;
  /** Material symbol icon name. */
  icon: string;
  /** Accent color for the card. */
  accent: string;
  /** Up to ~5 representative members. */
  members: TriageMember[];
  /** Where the card's primary button points (the relevant list/queue). */
  href: string;
  /** Button label. */
  cta: string;
};

export type TriageDigest = {
  /** Non-empty buckets in priority order. */
  buckets: TriageBucket[];
  /** True when every bucket is empty (nobody is waiting). */
  allClear: boolean;
};
