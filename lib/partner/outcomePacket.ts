/**
 * Partner outcome packet (Vision V12): one reproducible reconciliation of a
 * partner's referrals to outcomes, with definitions, denominators, the
 * generation time, exclusions, unknowns and the load cap disclosed.
 *
 * Pure: no database, no clock. The caller passes the partner bundle rows
 * (`loadPartnerReferralBundle`), the uncapped referral count
 * (`countPartnerReferrals`) and `generatedAt`. The /partner/exports page and
 * the `?preset=packet` CSV both render this one output, so their numbers
 * cannot drift.
 *
 * Every line reuses an existing definition in docs/OUTCOMES-METHODOLOGY.md
 * (§2, §4, §7; see "Partner outcome packet" there). No new rate is defined:
 * every line is shown as "X of N", never as a percentage. Placement records
 * are reported both in full (§2 "Placed", which includes rows a counselor has
 * not verified) and split by `startDateVerified` (§7 "Partner placements"),
 * so the packet does not pick one placement definition over the other.
 */
import { SMALL_SAMPLE_THRESHOLD } from '@/lib/admin/boardOutcomes';
import { csvEscape } from '@/lib/csv';
import { memberProgramCompleted } from '@/lib/partner/memberProgress';
import { resolveTrainingProgressAssignment } from '@/lib/member/trainingProgress';
import { PIPELINE_STAGE_LABELS } from '@/lib/pipeline/stage';
import type { PipelineRow } from '@/lib/partner/referralBundle';

export const PARTNER_PACKET_DEFINITIONS_VERSION = 'partner-packet-v1';
export const PARTNER_PACKET_PERIOD = 'All referrals to date (by referral date)';
export const PARTNER_PACKET_SOURCE = 'docs/OUTCOMES-METHODOLOGY.md §2/§4/§7';

export type PartnerPacketLineKey =
  | 'referred'
  | 'enrolled'
  | 'trainingCompleted'
  | 'credentialRecordsMemberReported'
  | 'placementRecords'
  | 'placementStartDateVerified'
  | 'placementStartDateNotVerified';

export type PartnerPacketLine = {
  key: PartnerPacketLineKey;
  label: string;
  /** One-line definition, printed in the CSV header and on the exports page. */
  definition: string;
  count: number;
  denominator: number;
  /** Always "X of N". The packet shows no percentages. */
  display: string;
  /** Where the definition lives in docs/OUTCOMES-METHODOLOGY.md. */
  definitionRef: string;
};

export type PartnerPacketPlacementStatus = 'start_date_verified' | 'recorded_start_not_verified' | 'none';

export type PartnerPacketRow = {
  memberName: string;
  referredAt: string;
  stageLabel: string;
  programTitle: string;
  enrolled: boolean;
  trainingCompleted: boolean;
  /** At least one `user_certifications` row. Member-reported, not verified. */
  credentialRecordMemberReported: boolean;
  placementStatus: PartnerPacketPlacementStatus;
  /** Only when the placement start date is verified; otherwise null. */
  employerName: string | null;
  /** Only when the placement start date is verified; otherwise null. */
  jobTitle: string | null;
};

export type PartnerPacketUnknown = {
  key: 'enrolledWithoutEnrolledAt' | 'placementStartDateNotVerified';
  label: string;
  count: number;
};

export type PartnerOutcomePacket = {
  definitionsVersion: typeof PARTNER_PACKET_DEFINITIONS_VERSION;
  generatedAt: string;
  period: typeof PARTNER_PACKET_PERIOD;
  source: typeof PARTNER_PACKET_SOURCE;
  partnerName: string;
  /** Referral rows in this packet (the bundle loads at most 500, newest first). */
  loadedReferrals: number;
  /** Every in-scope referral, uncapped. */
  totalReferrals: number;
  /** True when some referrals are not in this packet's rows. */
  truncated: boolean;
  /** Loaded referrals below SMALL_SAMPLE_THRESHOLD: read the counts, not a rate. */
  smallSample: boolean;
  lines: PartnerPacketLine[];
  rows: PartnerPacketRow[];
  unknowns: PartnerPacketUnknown[];
  exclusions: string[];
};

export type BuildPartnerOutcomePacketInput = {
  pipelineMembers: readonly PipelineRow[];
  totalReferrals: number;
  partnerName: string;
  generatedAt: Date;
};

export const PARTNER_PACKET_EXCLUSIONS = [
  'Deleted accounts and non-member (staff/test) accounts are excluded.',
  'Only this partner’s referrals in its own organization are included.',
  'Member-submitted placement confirmations awaiting staff review are not placement records and are not counted.',
] as const;

function xOfN(count: number, denominator: number): string {
  return `${count} of ${denominator}`;
}

function toRow(p: PipelineRow): PartnerPacketRow {
  const m = p.member;
  const assignment = resolveTrainingProgressAssignment(m.enrolledProgram, m.courseEnrollments);
  const trainingCompleted = memberProgramCompleted({
    enrolledProgram: assignment.programSlug,
    curriculumVersion: assignment.curriculumVersion,
    coursesCompleted: null,
    liveProgress: m.memberProgramProgress,
  });
  const pr = m.placementRecord;
  const placementStatus: PartnerPacketPlacementStatus = !pr
    ? 'none'
    : pr.startDateVerified
      ? 'start_date_verified'
      : 'recorded_start_not_verified';
  const verified = placementStatus === 'start_date_verified' ? pr : null;
  return {
    memberName: m.fullName,
    referredAt: p.referredAt.toISOString(),
    stageLabel: PIPELINE_STAGE_LABELS[p.stage as keyof typeof PIPELINE_STAGE_LABELS] ?? p.stage,
    programTitle: p.programTitle,
    enrolled: Boolean(m.enrolledProgram),
    trainingCompleted,
    credentialRecordMemberReported: m.userCertifications.length > 0,
    placementStatus,
    employerName: verified ? verified.employerName : null,
    jobTitle: verified ? verified.jobTitle : null,
  };
}

export function buildPartnerOutcomePacket({
  pipelineMembers,
  totalReferrals,
  partnerName,
  generatedAt,
}: BuildPartnerOutcomePacketInput): PartnerOutcomePacket {
  const rows = pipelineMembers.map(toRow);
  const loaded = rows.length;
  // The count query and the capped load run separately; never report fewer
  // referrals than the rows actually in the packet.
  const total = Math.max(totalReferrals, loaded);

  const count = (pred: (r: PartnerPacketRow) => boolean) => rows.filter(pred).length;
  const placementRecords = count((r) => r.placementStatus !== 'none');
  const verified = count((r) => r.placementStatus === 'start_date_verified');
  const notVerified = count((r) => r.placementStatus === 'recorded_start_not_verified');

  const line = (
    key: PartnerPacketLineKey,
    label: string,
    definition: string,
    definitionRef: string,
    n: number,
    denominator = loaded,
  ): PartnerPacketLine => ({ key, label, definition, count: n, denominator, display: xOfN(n, denominator), definitionRef });

  const lines: PartnerPacketLine[] = [
    line(
      'referred',
      'Referred members',
      'Distinct non-deleted members with a referral from this partner',
      '§7 Partner referrals',
      total,
      total,
    ),
    line(
      'enrolled',
      'Enrolled',
      'Referred members with an enrolled program set',
      '§2 Members served / enrolled',
      count((r) => r.enrolled),
    ),
    line(
      'trainingCompleted',
      'Training completed',
      'Completed-course rollup equals the required course count for the assigned curriculum; not a credential verification',
      '§2 Training completed',
      count((r) => r.trainingCompleted),
    ),
    line(
      'credentialRecordsMemberReported',
      'Credential records (member-reported)',
      'Referred members with at least one credential record; member-reported, not verified',
      '§4 Credential records',
      count((r) => r.credentialRecordMemberReported),
    ),
    line(
      'placementRecords',
      'Placement records',
      'Referred members with a placement record, verified or not',
      '§2 Placed',
      placementRecords,
    ),
    line(
      'placementStartDateVerified',
      'Placement start date verified',
      'Placement records whose start date staff verified; a subset of placement records',
      '§7 Partner placements',
      verified,
    ),
    line(
      'placementStartDateNotVerified',
      'Placement start date not yet verified',
      'Placement records whose start date staff have not verified yet',
      'Partner outcome packet (placement records minus start date verified)',
      notVerified,
    ),
  ];

  const enrolledWithoutDate = pipelineMembers.filter(
    (p) => Boolean(p.member.enrolledProgram) && !p.member.enrolledAt,
  ).length;

  const unknowns: PartnerPacketUnknown[] = [
    {
      key: 'enrolledWithoutEnrolledAt',
      label: 'Enrolled members with no enrolled date recorded',
      count: enrolledWithoutDate,
    },
    {
      key: 'placementStartDateNotVerified',
      label: 'Placement records without a verified start date',
      count: notVerified,
    },
  ];

  return {
    definitionsVersion: PARTNER_PACKET_DEFINITIONS_VERSION,
    generatedAt: generatedAt.toISOString(),
    period: PARTNER_PACKET_PERIOD,
    source: PARTNER_PACKET_SOURCE,
    partnerName,
    loadedReferrals: loaded,
    totalReferrals: total,
    truncated: total > loaded,
    smallSample: loaded < SMALL_SAMPLE_THRESHOLD,
    lines,
    rows,
    unknowns,
    exclusions: [...PARTNER_PACKET_EXCLUSIONS],
  };
}

/** The truncation warning printed on the CSV and the exports page. */
export function partnerPacketTruncationWarning(packet: PartnerOutcomePacket): string | null {
  if (!packet.truncated) return null;
  return `WARNING: this packet includes the ${packet.loadedReferrals} most recent of ${packet.totalReferrals} referrals. Line counts other than "Referred members" cover only those ${packet.loadedReferrals}.`;
}

/** Row-block columns of the packet CSV. No email, story, salary or demographics. */
export const PARTNER_PACKET_ROW_HEADERS = [
  'Member name',
  'Referred at',
  'Stage',
  'Program',
  'Enrolled',
  'Training completed',
  'Credential record (member-reported)',
  'Placement status',
  'Placed employer (start date verified)',
  'Job title (start date verified)',
] as const;

export const PARTNER_PACKET_SUMMARY_HEADERS = ['metric', 'count', 'denominator', 'display'] as const;

/**
 * A '#' line kept on one line and formula-safe, the same rule the route's
 * branding lines use: a CR/LF could start an unescaped data row, and a
 * formula trigger after ',' or ';' (a new cell) gets csvEscape's leading '.
 */
function commentValue(value: string): string {
  return value
    .replace(/[\r\n]+/g, ' ')
    .replace(/([,;])(?=[\s"]*[=+\-@\t])/g, "$1'");
}

const yesNo = (v: boolean) => (v ? 'yes' : 'no');

/**
 * The packet as CSV: '#' provenance lines, then a
 * `metric,count,denominator,display` block, a blank line and the row block.
 */
export function partnerOutcomePacketCsv(packet: PartnerOutcomePacket): string {
  const header = [
    '# Workforce Advancement Project — Partner Outcome Packet',
    `# partner=${packet.partnerName}`,
    `# generated_at=${packet.generatedAt}`,
    `# period=${packet.period}`,
    `# definitions_version=${packet.definitionsVersion}`,
    `# source: ${packet.source}`,
    `# referrals_in_packet=${packet.loadedReferrals} of ${packet.totalReferrals}`,
    ...packet.lines.map((l) => `# ${l.label}: ${l.definition} (${l.definitionRef})`),
    '# Every figure is a count shown as "X of N". No percentages or rates are shown.',
    ...(packet.smallSample
      ? [`# small_sample: fewer than ${SMALL_SAMPLE_THRESHOLD} referrals; read the counts, not a rate.`]
      : []),
    ...packet.unknowns.map((u) => `# unknown: ${u.label}: ${u.count}`),
    ...packet.exclusions.map((e) => `# exclusion: ${e}`),
  ];
  const warning = partnerPacketTruncationWarning(packet);
  if (warning) header.push(`# ${warning}`);
  header.push('# Not a regulatory certification.', '#');

  const summary = [
    PARTNER_PACKET_SUMMARY_HEADERS.join(','),
    ...packet.lines.map((l) =>
      [l.key, String(l.count), String(l.denominator), csvEscape(l.display)].join(','),
    ),
  ];

  const rows = [
    PARTNER_PACKET_ROW_HEADERS.join(','),
    ...packet.rows.map((r) =>
      [
        csvEscape(r.memberName),
        r.referredAt,
        csvEscape(r.stageLabel),
        csvEscape(r.programTitle),
        yesNo(r.enrolled),
        yesNo(r.trainingCompleted),
        yesNo(r.credentialRecordMemberReported),
        r.placementStatus,
        csvEscape(r.employerName ?? ''),
        csvEscape(r.jobTitle ?? ''),
      ].join(','),
    ),
  ];

  return [...header.map(commentValue), ...summary, '', ...rows].join('\r\n');
}
