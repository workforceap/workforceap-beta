/**
 * WAP-172: no-account leads from the tokenized eligibility questionnaire.
 *
 * Someone who screens without an account has no User row, so their answers
 * cannot hang off a member record. They are stored in `public_wioa_screenings`
 * (the same table the public WIOA self-screening page writes) with a
 * self-describing snapshot, and the retention cron purges the row after
 * {@link PUBLIC_LEAD_RETENTION_DAYS}. The audit trail keeps only ids and
 * counts, so the 3-year audit log never becomes a second copy of the answers.
 */

import type { Prisma } from '@prisma/client';
import {
  eligibilityScreeningAnswerCount,
  type EligibilityScreeningFields,
} from './eligibilityScreeningFields';
import { PUBLIC_LEAD_RETENTION_DAYS } from '@/lib/retention/config';

const PUBLIC_ELIGIBILITY_LEAD_SNAPSHOT_VERSION = 'public_eligibility_lead_v1';

export type PublicEligibilityLeadInput = {
  linkId: string;
  organizationId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  ageGroup: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  county: string | null;
  primaryBarriers: string[];
  answers: EligibilityScreeningFields;
};

/** Stored in `public_wioa_screenings.snapshot`; distinguishable from a WioaQualificationSnapshot by `version`. */
type PublicEligibilityLeadSnapshot = {
  version: typeof PUBLIC_ELIGIBILITY_LEAD_SNAPSHOT_VERSION;
  source: 'tokenized_questionnaire';
  linkId: string;
  submittedAt: string;
  ageGroup: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  county: string | null;
  primaryBarriers: string[];
  answers: EligibilityScreeningFields;
};

function buildPublicEligibilityLeadSnapshot(
  input: PublicEligibilityLeadInput,
  now: Date = new Date(),
): PublicEligibilityLeadSnapshot {
  return {
    version: PUBLIC_ELIGIBILITY_LEAD_SNAPSHOT_VERSION,
    source: 'tokenized_questionnaire',
    linkId: input.linkId,
    submittedAt: now.toISOString(),
    ageGroup: input.ageGroup,
    city: input.city,
    state: input.state,
    zip: input.zip,
    county: input.county,
    primaryBarriers: input.primaryBarriers,
    answers: input.answers,
  };
}

/** Writes the lead inside the caller's transaction and returns the new row id. */
export async function savePublicEligibilityLead(
  tx: Prisma.TransactionClient,
  input: PublicEligibilityLeadInput,
): Promise<{ id: string }> {
  const fullName =
    [input.firstName, input.lastName].filter(Boolean).join(' ').trim() || input.email || 'Lead';
  const snapshot = buildPublicEligibilityLeadSnapshot(input);
  return tx.publicWioaScreening.create({
    data: {
      organizationId: input.organizationId,
      fullName,
      email: input.email ?? '',
      phone: input.phone,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
      emailSent: false,
    },
    select: { id: true },
  });
}

/**
 * Audit metadata for `public_eligibility_lead_submitted`: identifiers and
 * counts only. No contact details, no location, no answers.
 */
export function publicEligibilityLeadAuditMetadata(params: {
  orgId: string | null;
  leadRecordId: string;
  input: PublicEligibilityLeadInput;
}): Record<string, unknown> {
  const { orgId, leadRecordId, input } = params;
  return {
    orgId,
    leadRecordId,
    store: 'public_wioa_screenings',
    retentionDays: PUBLIC_LEAD_RETENTION_DAYS,
    answerCount: eligibilityScreeningAnswerCount(input.answers),
    primaryBarrierCount: input.primaryBarriers.length,
    hasEmail: Boolean(input.email),
    hasPhone: Boolean(input.phone),
  };
}
