import 'server-only';

import { withAdminPageScope } from '@/lib/tenant/adminPageScope';
import type { AdminPageTenantOk } from '@/lib/tenant/adminPageScopeFilters';
import { parseWioaQualificationSnapshot } from '@/lib/wioa/wioaQualification';

export const PUBLIC_WIOA_SCREENING_LIMIT = 100;

type Answer = { label: string; value: string };
export type PublicScreeningRecord = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  createdAt: Date;
  snapshot: unknown;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function answer(value: unknown): string {
  if (value === true || value === 'yes') return 'Yes';
  if (value === false || value === 'no') return 'No';
  if (typeof value === 'string' && value.trim()) return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string').join(', ') || 'Not answered';
  return 'Not answered';
}

/** Display each stored source on its own terms; a quick-fit answer is not a WIOA determination. */
export function publicScreeningEvidence(raw: unknown): { source: string; answers: Answer[] } {
  const portal = parseWioaQualificationSnapshot(raw);
  if (portal) {
    const a = portal.answers;
    return { source: 'Public WIOA questionnaire', answers: [
      { label: 'Age bracket', value: answer(a.ageBracket) },
      { label: 'County or ZIP', value: answer(a.countyOrZip) },
      { label: 'Primary barrier', value: answer(a.primaryBarrier) },
      { label: 'Dislocated worker (self-reported)', value: answer(a.dislocatedWorker) },
      { label: 'Low income (self-reported)', value: answer(a.lowIncomeSelfReport) },
      { label: 'Interested in training', value: answer(a.trainingInterest) },
      { label: 'Completed intake (self-reported)', value: answer(a.completedIntakeSelfReport) },
      { label: 'Receiving public assistance', value: answer(a.publicAssistanceSelfReport) },
      { label: 'Programs named (unverified)', value: answer(a.publicAssistancePrograms) },
      { label: 'Wants help applying for benefits', value: answer(a.publicAssistanceHelpRequested) },
    ] };
  }
  const snapshot = record(raw);
  const fields = record(snapshot?.answers);
  if (snapshot?.version !== 'public_eligibility_lead_v1' || snapshot.source !== 'tokenized_questionnaire' || !fields) {
    return { source: 'Unrecognized saved screening', answers: [] };
  }
  const labels: Array<[string, string]> = [
    ['q1', 'Unemployed or underemployed'], ['q2', 'Household income below $60,000'],
    ['q3', 'Authorized to work'], ['receivingUnemployment', 'Receiving unemployment'],
    ['exhaustedUnemployment', 'Exhausted unemployment benefits'], ['layoffCompany', 'Layoff company'],
    ['snapWic', 'Receiving public assistance'], ['publicAssistancePrograms', 'Programs named (unverified)'],
    ['publicAssistanceHelpRequested', 'Wants help applying for benefits'],
  ];
  return { source: 'Public eligibility questionnaire', answers: [
    ...labels.map(([key, label]) => ({ label, value: answer(fields[key]) })),
    { label: 'Age group', value: answer(snapshot.ageGroup) },
    { label: 'County', value: answer(snapshot.county) },
    { label: 'Primary barriers', value: answer(snapshot.primaryBarriers) },
  ] };
}

export async function loadPublicWioaScreenings(scope: AdminPageTenantOk) {
  const where = scope.superAdmin ? {} : { organizationId: scope.orgId };
  const [rows, total] = await withAdminPageScope(scope, (db) => Promise.all([
    db.publicWioaScreening.findMany({
      where, take: PUBLIC_WIOA_SCREENING_LIMIT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, fullName: true, email: true, phone: true, createdAt: true, snapshot: true },
    }),
    db.publicWioaScreening.count({ where }),
  ]));
  return { rows, total };
}
