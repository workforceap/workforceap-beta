import 'server-only';

import { getAdminAttention } from '@/lib/attention/admin';
import { buildAttentionDigest } from '@/lib/attention/adminViews';
import type { AdminPageTenantOk } from '@/lib/tenant/adminPageScope';
import type { TriageDigest } from '@/lib/admin/triageDigestTypes';

export type {
  TriageBucket,
  TriageBucketKey,
  TriageDigest,
  TriageMember,
} from '@/lib/admin/triageDigestTypes';

/**
 * "Who needs you today" digest for the admin home and Detailed overview.
 *
 * Rule-based and deterministic — no LLM call. Built from the shared attention
 * model (`lib/attention`), so its three buckets print the same numbers as the
 * Command Center tiles:
 *
 *   1. New applicants — joined in the last 7 days, no active counselor
 *   2. Risk alerts    — saved at-risk alert (open / acknowledged / escalated)
 *   3. Quiet 30+ days — enrolled, no learning activity in 30+ days
 *
 * Roster is member-role accounts only; staff never count.
 */
export async function getTriageDigest(scope: AdminPageTenantOk): Promise<TriageDigest> {
  return buildAttentionDigest(await getAdminAttention(scope));
}
