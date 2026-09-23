/**
 * Vision C4 / V12 — partner outcome packet builder. One pure builder that the
 * exports page and the `?preset=packet` CSV both render; every line reuses a
 * docs/OUTCOMES-METHODOLOGY.md §2/§4/§7 definition and is shown as "X of N".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findMany, count } = vi.hoisted(() => ({
  findMany: vi.fn(async (_args: { where: unknown; take?: number }) => [] as unknown[]),
  count: vi.fn(async (_args: { where: unknown; take?: number }) => 0),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    partnerReferral: { findMany, count },
    memberEvent: { findMany: vi.fn(async () => []) },
  },
}));

import {
  buildPartnerOutcomePacket,
  partnerOutcomePacketCsv,
  type PartnerOutcomePacket,
} from '@/lib/partner/outcomePacket';
import { countPartnerReferrals, loadPartnerReferralBundle, type PipelineRow } from '@/lib/partner/referralBundle';
import { PROGRAMS } from '@/lib/content/programs';
import { LEGACY_CURRICULUM_VERSION } from '@/lib/content/programCurriculumManifest';
import { getProgramCoursesForCurriculumVersion } from '@/lib/member/curriculumAssignment';

const GENERATED_AT = new Date('2026-09-23T12:00:00.000Z');

const PROGRAM = PROGRAMS.find((p) => getProgramCoursesForCurriculumVersion(p, LEGACY_CURRICULUM_VERSION).length > 0)!;
const COURSE_COUNT = getProgramCoursesForCurriculumVersion(PROGRAM, LEGACY_CURRICULUM_VERSION).length;

type Opts = {
  enrolled?: boolean;
  enrolledAt?: Date | null;
  completed?: boolean;
  credential?: boolean;
  placement?: 'verified' | 'unverified' | null;
};

function member(i: number, o: Opts = {}): PipelineRow {
  const enrolled = o.enrolled ?? true;
  return {
    member: {
      id: `m${i}`,
      fullName: `Member ${i}`,
      enrolledProgram: enrolled ? PROGRAM.slug : null,
      enrolledAt: o.enrolledAt === undefined ? (enrolled ? new Date('2026-02-01T00:00:00Z') : null) : o.enrolledAt,
      updatedAt: new Date('2026-09-01T00:00:00Z'),
      deletedAt: null,
      assessmentCompleted: true,
      courseEnrollments: [],
      placementRecord: o.placement
        ? {
            employerName: `Employer ${i}`,
            jobTitle: `Job ${i}`,
            salaryOffered: 52000,
            placedAt: new Date('2026-08-01T00:00:00Z'),
            startDateVerified: o.placement === 'verified',
            onboardingWindowEnd: null,
            retentionDecision: null,
          }
        : null,
      profile: null,
      userCertifications: o.credential ? [{ certName: 'CompTIA A+', earnedAt: null }] : [],
      applications: [],
      memberProgramProgress: o.completed
        ? [{ programSlug: PROGRAM.slug, averagePercent: 100, coursesCompleted: COURSE_COUNT }]
        : [],
    },
    referredAt: new Date(Date.UTC(2026, 0, i + 1)),
    stage: o.placement ? 'placed' : enrolled ? 'enrolled' : 'applied',
    progress: 0,
    programTitle: enrolled ? PROGRAM.title : '—',
    allProgramTitles: enrolled ? [PROGRAM.title] : [],
  };
}

/** 12 loaded rows: 3 verified placements, 2 unverified, 4 with credentials, 1 enrolled without enrolledAt. */
function fixture(): PipelineRow[] {
  return [
    member(1, { placement: 'verified', credential: true, completed: true }),
    member(2, { placement: 'verified', credential: true, completed: true }),
    member(3, { placement: 'verified' }),
    member(4, { placement: 'unverified', credential: true }),
    member(5, { placement: 'unverified' }),
    member(6, { credential: true }),
    member(7, { enrolledAt: null }),
    member(8),
    member(9),
    member(10, { enrolled: false }),
    member(11, { enrolled: false }),
    member(12, { enrolled: false }),
  ];
}

function build(pipelineMembers = fixture(), totalReferrals = pipelineMembers.length): PartnerOutcomePacket {
  return buildPartnerOutcomePacket({ pipelineMembers, totalReferrals, partnerName: 'Fixture Partner', generatedAt: GENERATED_AT });
}

function lineOf(packet: PartnerOutcomePacket, key: string) {
  const line = packet.lines.find((l) => l.key === key);
  if (!line) throw new Error(`missing line ${key}`);
  return line;
}

describe('buildPartnerOutcomePacket', () => {
  it('(a) reports every placement record and splits it by start-date verification, as X of N', () => {
    const packet = build();
    expect(packet.definitionsVersion).toBe('partner-packet-v1');
    expect(packet.generatedAt).toBe('2026-09-23T12:00:00.000Z');
    expect(packet.period).toBe('All referrals to date (by referral date)');
    expect(packet.loadedReferrals).toBe(12);
    expect(packet.totalReferrals).toBe(12);
    expect(packet.truncated).toBe(false);

    expect(lineOf(packet, 'referred')).toMatchObject({ count: 12, denominator: 12, display: '12 of 12', definitionRef: '§7 Partner referrals' });
    expect(lineOf(packet, 'enrolled')).toMatchObject({ count: 9, denominator: 12, display: '9 of 12' });
    expect(lineOf(packet, 'trainingCompleted')).toMatchObject({ count: 2, display: '2 of 12' });
    expect(lineOf(packet, 'credentialRecords')).toMatchObject({ count: 4, display: '4 of 12' });
    expect(lineOf(packet, 'placementRecords')).toMatchObject({ count: 5, display: '5 of 12' });
    expect(lineOf(packet, 'placementStartDateVerified')).toMatchObject({ count: 3, denominator: 12, display: '3 of 12' });
    expect(lineOf(packet, 'placementStartDateNotVerified')).toMatchObject({ count: 2, display: '2 of 12' });

    // No new percentages or rates anywhere in the summary.
    for (const line of packet.lines) {
      expect(line.display).toMatch(/^\d+ of \d+$/);
      expect(line.definitionRef).toMatch(/§\d|Partner outcome packet/);
    }

    expect(packet.unknowns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'enrolledWithoutEnrolledAt', count: 1 }),
        expect.objectContaining({ key: 'placementStartDateNotVerified', count: 2 }),
      ]),
    );
    expect(packet.exclusions).toContain('Deleted accounts and non-member (staff/test) accounts are excluded.');
  });

  it('rows carry employer and job title only for a verified start date, and no email, salary or story', () => {
    const packet = build();
    const byName = new Map(packet.rows.map((r) => [r.memberName, r]));
    expect(byName.get('Member 1')).toMatchObject({ placementStatus: 'start_date_verified', employerName: 'Employer 1', jobTitle: 'Job 1' });
    expect(byName.get('Member 4')).toMatchObject({ placementStatus: 'recorded_start_not_verified', employerName: null, jobTitle: null });
    expect(byName.get('Member 8')).toMatchObject({ placementStatus: 'none', employerName: null, jobTitle: null });
    expect(byName.get('Member 1')?.referredAt).toBe('2026-01-02T00:00:00.000Z');
    const serialized = JSON.stringify(packet.rows);
    expect(serialized).not.toMatch(/52000|salary|email|story|Placed at/i);
  });

  it('(b) every line except referred equals an aggregate over rows', () => {
    const packet = build();
    const rows = packet.rows;
    const agg: Record<string, number> = {
      enrolled: rows.filter((r) => r.enrolled).length,
      trainingCompleted: rows.filter((r) => r.trainingCompleted).length,
      credentialRecords: rows.filter((r) => r.credentialRecord).length,
      placementRecords: rows.filter((r) => r.placementStatus !== 'none').length,
      placementStartDateVerified: rows.filter((r) => r.placementStatus === 'start_date_verified').length,
      placementStartDateNotVerified: rows.filter((r) => r.placementStatus === 'recorded_start_not_verified').length,
    };
    for (const line of packet.lines) {
      if (line.key === 'referred') continue;
      expect(line.count, line.key).toBe(agg[line.key]);
      expect(line.denominator, line.key).toBe(rows.length);
    }
    expect(lineOf(packet, 'placementStartDateVerified').count + lineOf(packet, 'placementStartDateNotVerified').count).toBe(
      lineOf(packet, 'placementRecords').count,
    );
  });

  it('an unverified self-reported placement counts in all placement records but not in the verified subset', () => {
    // The shape confirmPlacement -> recordPlacementFromApplication writes for
    // a member's own offer confirmation: a placement row, startDateVerified false.
    const selfReport = member(1, { placement: 'unverified' });
    const packet = build([selfReport, member(2)]);
    expect(lineOf(packet, 'placementRecords')).toMatchObject({ count: 1, display: '1 of 2' });
    expect(lineOf(packet, 'placementStartDateVerified')).toMatchObject({ count: 0, display: '0 of 2' });
    expect(lineOf(packet, 'placementStartDateNotVerified')).toMatchObject({
      count: 1,
      label: 'Placement reported, pending verification',
    });
    expect(packet.rows[0]).toMatchObject({ placementStatus: 'recorded_start_not_verified', employerName: null, jobTitle: null });

    // The copy says so, and never claims self-reports are left out.
    const csv = partnerOutcomePacketCsv(packet);
    expect(packet.notes.join(' ')).toMatch(/recorded as an unverified placement record/);
    expect(csv).toContain('# note: A placement a member reports on their dashboard');
    expect(csv).not.toMatch(/not placement records|are not counted/i);
    for (const e of packet.exclusions) expect(e).not.toMatch(/placement/i);
  });

  it('labels credential records by every source and review status, not as member-reported', () => {
    // A system-created pending row from a course completion counts the same
    // as a member-entered one: the line has no source or status filter (§4).
    const systemCompletion = member(1);
    systemCompletion.member.userCertifications = [{ certName: 'Google IT Support — Course 1', earnedAt: new Date('2026-08-01T00:00:00Z') }];
    const packet = build([systemCompletion, member(2)]);
    const line = lineOf(packet, 'credentialRecords');
    expect(line).toMatchObject({ count: 1, display: '1 of 2', label: 'Credential records (any source or review status)' });
    expect(line.definition).toMatch(/member-entered/);
    expect(line.definition).toMatch(/course completion/);
    expect(line.definition).toMatch(/pending, approved or rejected/);
    expect(line.definition).toMatch(/not a verified-credential count/);
    expect(packet.rows[0].credentialRecord).toBe(true);

    const csv = partnerOutcomePacketCsv(packet);
    expect(csv).not.toMatch(/member-reported/i);
    expect(csv).toContain('Credential record (any source or status)');
    expect(csv).toContain('credentialRecords,1,2,1 of 2');
  });

  it('prints generated_at and the page/CSV timing note in the CSV header', () => {
    const csv = partnerOutcomePacketCsv(build());
    const lines = csv.split('\r\n');
    expect(lines).toContain('# generated_at=2026-09-23T12:00:00.000Z');
    expect(csv).toMatch(/# note: The page and the CSV use the same definitions, but each reads live records/);
    expect(csv).not.toMatch(/always match|cannot drift|same numbers/i);
  });

  it('(c) is deterministic for the same input and generatedAt', () => {
    expect(build()).toEqual(build());
    expect(partnerOutcomePacketCsv(build())).toBe(partnerOutcomePacketCsv(build()));
  });

  it('(d) discloses a capped load: referred counts every referral and a warning is printed', () => {
    const rows = Array.from({ length: 500 }, (_, i) => member(i + 1));
    const packet = build(rows, 612);
    expect(packet.truncated).toBe(true);
    expect(packet.loadedReferrals).toBe(500);
    expect(lineOf(packet, 'referred')).toMatchObject({ count: 612, display: '612 of 612' });
    expect(lineOf(packet, 'enrolled')).toMatchObject({ denominator: 500 });
    const csv = partnerOutcomePacketCsv(packet);
    expect(csv).toContain('# WARNING: this packet includes the 500 most recent of 612 referrals.');
    expect(csv).toContain('# referrals_in_packet=500 of 612');
    expect(partnerOutcomePacketCsv(build())).not.toContain('WARNING');
  });

  it('handles zero referrals without dividing or inventing a rate', () => {
    const packet = build([], 0);
    expect(packet.truncated).toBe(false);
    expect(packet.smallSample).toBe(true);
    for (const line of packet.lines) expect(line.display).toBe('0 of 0');
  });
});

describe('countPartnerReferrals (h)', () => {
  beforeEach(() => {
    findMany.mockClear();
    count.mockClear();
  });

  it('counts with the same partner/org/member scope the bundle loads, uncapped', async () => {
    count.mockResolvedValueOnce(612);
    await loadPartnerReferralBundle('partner-1', 'org-1');
    await expect(countPartnerReferrals('partner-1', 'org-1')).resolves.toBe(612);

    const loadArgs = findMany.mock.calls[0][0];
    const countArgs = count.mock.calls[0][0];
    expect(countArgs.where).toEqual(loadArgs.where);
    expect(countArgs.take).toBeUndefined();
    expect(loadArgs.take).toBe(500);
    expect(countArgs.where).toMatchObject({
      partnerId: 'partner-1',
      partner: { organizationId: 'org-1' },
      member: { deletedAt: null, organizationId: 'org-1' },
    });
  });
});
