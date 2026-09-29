/**
 * Real-database proof of the partner minor rule (lib/partner/dataAccess.ts)
 * and the queries built on it.
 *
 * The earlier partner-tier tests mocked Prisma, so they proved the shape of
 * the filters but not that Prisma and PostgreSQL agree with
 * `partnerMayViewMember`: the hidden-member condition is a to-one `profile`
 * filter with a nested `OR` and a `dob` range, appended to a caller's `NOT`
 * list, and the attention queue re-implements it in raw SQL. This suite seeds
 * one referred member per case under a community, a referral-track and a
 * high-school partner and asserts on what the real queries return:
 *
 *  - `withPartnerMemberVisibility` (Prisma) and the attention SQL
 *    (`buildAttentionPageQuery`) admit the same members;
 *  - the Feb 29 cutoff is clamped (a Mar 1 birthday 18 years back is still a
 *    minor) in both, and the SQL cutoff does not move with the session time
 *    zone;
 *  - `countUnpaidVerifiedPlacements` and `listPartnerWorkflowEvents` leave out
 *    a hidden minor, and a school partner keeps its minors.
 *
 * It runs only in the database-contract lane (`TEST_REAL_DB=1`, see
 * scripts/run-db-contract-tests.mjs); the default node:test lane skips it
 * because it has no PostgreSQL.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { prisma } from '../db/prisma';
import { MEMBER_ONLY_WHERE } from '../admin/memberOnlyWhere';
import { partnerDataAccess, partnerMayViewMember, withPartnerMemberVisibility } from './dataAccess';
import { buildAttentionPageQuery, type AttentionQueryResult } from './attentionPagination';
import { countUnpaidVerifiedPlacements } from './unpaidVerifiedPlacements';
import { listPartnerWorkflowEvents } from '../portal/workflowEvents';

/** This suite seeds and deletes rows, so it refuses anything but a local database. */
const LOCAL_DB_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function assertDisposableDatabase(): void {
  const raw = process.env.POSTGRES_PRISMA_URL ?? process.env.DATABASE_URL ?? '';
  if (!raw.trim()) {
    throw new Error('partnerVisibility.realdb: no database URL; this suite runs only in the database-contract lane.');
  }
  let host: string;
  try {
    host = new URL(raw).hostname;
  } catch {
    throw new Error('partnerVisibility.realdb: could not parse the database URL; refusing to run.');
  }
  if (!LOCAL_DB_HOSTS.has(host)) {
    throw new Error(`partnerVisibility.realdb: refusing to seed and delete rows on ${host}. Local disposable PostgreSQL only.`);
  }
}

const runId = randomUUID().slice(0, 8);
const NOW = new Date();
const LEAP_DAY = new Date('2028-02-29T15:00:00Z');
const yearsAgo = (years: number) => new Date(Date.UTC(NOW.getUTCFullYear() - years, 2, 15));

type Profile = { isMinor: boolean; dob: Date | null; ferpaConsentGiven: boolean } | null;

/**
 * One referred member per case. None has a verified placement or a
 * certification, so every one is eligible for the attention queue.
 */
const MEMBERS: Record<string, Profile> = {
  adult: { isMinor: false, dob: new Date('1990-04-01'), ferpaConsentGiven: false },
  // The usual adult: a profile row with no saved date of birth. A bare
  // `dob > cutoff` under `NOT` evaluated to NULL for this row and hid it.
  'adult with no date of birth': { isMinor: false, dob: null, ferpaConsentGiven: false },
  'minor by flag': { isMinor: true, dob: null, ferpaConsentGiven: false },
  'minor by date of birth': { isMinor: false, dob: yearsAgo(15), ferpaConsentGiven: false },
  'minor with FERPA consent': { isMinor: true, dob: null, ferpaConsentGiven: true },
  'no profile row': null,
  // On 2028-02-29 the first is 18 (Feb 28 birthday) and the second is still
  // 17 (turns 18 on Mar 1). Until then both are minors, so their visibility
  // today depends on the run date; the tests only pin what does not.
  'born 2010-02-28': { isMinor: false, dob: new Date('2010-02-28'), ferpaConsentGiven: false },
  'born 2010-03-01': { isMinor: false, dob: new Date('2010-03-01'), ferpaConsentGiven: false },
};

/** Members with a verified placement: the payout-due count. */
const PLACED: Record<string, Profile> = {
  'placed adult': { isMinor: false, dob: null, ferpaConsentGiven: false },
  'placed minor': { isMinor: true, dob: null, ferpaConsentGiven: false },
};

const PARTNER_TYPES = ['community', 'referral', 'high_school'] as const;
type PartnerTypeKey = (typeof PARTNER_TYPES)[number];

const seeded = {
  orgId: '',
  partnerIds: {} as Record<PartnerTypeKey, string>,
  userIds: new Map<string, string>(),
  staffUserId: '',
};

async function seedMember(key: string, profile: Profile, memberRoleId: string): Promise<string> {
  const user = await prisma.user.create({
    data: {
      organizationId: seeded.orgId,
      email: `partner-visibility-${seeded.userIds.size}-${runId}@example.test`,
      fullName: `Visibility contract: ${key}`,
    },
    select: { id: true },
  });
  seeded.userIds.set(key, user.id);
  await prisma.userRole.create({ data: { userId: user.id, roleId: memberRoleId } });
  if (profile) await prisma.profile.create({ data: { userId: user.id, role: 'member', ...profile } });
  for (const partnerId of Object.values(seeded.partnerIds)) {
    // Referred well before any `asOf` used below; the attention queue only
    // counts referrals made on or before it.
    await prisma.partnerReferral.create({ data: { partnerId, memberId: user.id, referredAt: new Date('2025-01-01T00:00:00Z') } });
  }
  return user.id;
}

const idsOf = (keys: string[]) => keys.map((k) => seeded.userIds.get(k)!).sort();
const keysVisibleTo = (type: PartnerTypeKey, population: Record<string, Profile>, now: Date) =>
  Object.entries(population)
    .filter(([, profile]) => partnerMayViewMember(partnerDataAccess({ partnerType: type }), profile, now))
    .map(([key]) => key);

before(async () => {
  assertDisposableDatabase();
  const org = await prisma.organization.create({
    data: { slug: `partner-visibility-${runId}`, name: `Partner visibility contract ${runId}` },
    select: { id: true },
  });
  seeded.orgId = org.id;
  for (const type of PARTNER_TYPES) {
    const partner = await prisma.partner.create({
      data: {
        organizationId: org.id,
        name: `Visibility ${type} ${runId}`,
        slug: `visibility-${type}-${runId}`.replace(/_/g, '-'),
        referralCode: `vis-${type}-${runId}`.replace(/_/g, '-'),
        partnerType: type,
        active: true,
      },
      select: { id: true },
    });
    seeded.partnerIds[type] = partner.id;
  }
  const memberRole = await prisma.role.upsert({ where: { name: 'member' }, create: { name: 'member' }, update: {}, select: { id: true } });
  for (const [key, profile] of Object.entries(MEMBERS)) await seedMember(key, profile, memberRole.id);
  for (const [key, profile] of Object.entries(PLACED)) {
    const userId = await seedMember(key, profile, memberRole.id);
    await prisma.placementRecord.create({
      data: { userId, employerName: 'Contract Employer', jobTitle: 'Contract Role', startDateVerified: true, placedAt: new Date('2026-08-01') },
    });
  }
  const staff = await prisma.user.create({
    data: { organizationId: org.id, email: `partner-visibility-staff-${runId}@example.test`, fullName: 'Visibility contract: partner staff' },
    select: { id: true },
  });
  seeded.staffUserId = staff.id;
  assert.equal(seeded.userIds.size, Object.keys(MEMBERS).length + Object.keys(PLACED).length);
});

after(async () => {
  await prisma.partner.deleteMany({ where: { id: { in: Object.values(seeded.partnerIds) } } });
  await prisma.user.deleteMany({ where: { id: { in: [...seeded.userIds.values(), seeded.staffUserId].filter(Boolean) } } });
  await prisma.organization.deleteMany({ where: { id: seeded.orgId } });
  await prisma.$disconnect();
});

async function prismaVisibleIds(type: PartnerTypeKey, now: Date, keys: string[]): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: withPartnerMemberVisibility(
      {
        id: { in: idsOf(keys) },
        organizationId: seeded.orgId,
        deletedAt: null,
        ...MEMBER_ONLY_WHERE,
        partnerReferrals: { some: { partnerId: seeded.partnerIds[type] } },
      },
      partnerDataAccess({ partnerType: type }),
      now,
    ),
    select: { id: true },
  });
  return rows.map((r) => r.id).sort();
}

async function attentionMemberIds(type: PartnerTypeKey, asOf: Date, timeZone?: string): Promise<string[]> {
  const query = buildAttentionPageQuery(seeded.partnerIds[type], seeded.orgId, { tier: 'all', asOf, limit: 100 });
  const [result] = await prisma.$transaction(async (tx) => {
    if (timeZone) await tx.$executeRawUnsafe(`SET LOCAL TIME ZONE '${timeZone.replace(/'/g, "''")}'`);
    return tx.$queryRaw<AttentionQueryResult[]>(query);
  });
  assert.ok(result, 'attention query returned no aggregate');
  return result.rows.map((row) => row.memberId).sort();
}

test('Prisma admits exactly the members partnerMayViewMember allows, for every partner type', async () => {
  const keys = Object.keys(MEMBERS);
  for (const type of PARTNER_TYPES) {
    const expected = keysVisibleTo(type, MEMBERS, NOW);
    assert.deepEqual(await prismaVisibleIds(type, NOW, keys), idsOf(expected), type);
  }
  // The fixture really separates the tiers: minors without consent are hidden
  // from non-school partners, adults (dated or not) and consented minors are
  // not, and the school partner keeps everyone.
  const community = keysVisibleTo('community', MEMBERS, NOW);
  for (const key of ['adult', 'adult with no date of birth', 'minor with FERPA consent', 'no profile row']) {
    assert.ok(community.includes(key), `${key} is visible`);
  }
  for (const key of ['minor by flag', 'minor by date of birth']) assert.ok(!community.includes(key), `${key} is hidden`);
  assert.equal(keysVisibleTo('high_school', MEMBERS, NOW).length, keys.length);
});

test('the attention SQL and the Prisma filter hide the same members', async () => {
  for (const type of PARTNER_TYPES) {
    assert.deepEqual(await attentionMemberIds(type, NOW), await prismaVisibleIds(type, NOW, Object.keys(MEMBERS)), type);
  }
});

test('on Feb 29 a Mar 1 birthday 18 years back is still a minor, in Prisma and in SQL', async () => {
  const keys = ['born 2010-02-28', 'born 2010-03-01'];
  for (const type of ['community', 'referral'] as const) {
    assert.deepEqual(await prismaVisibleIds(type, LEAP_DAY, keys), idsOf(['born 2010-02-28']), `${type} prisma`);
    const sql = (await attentionMemberIds(type, LEAP_DAY)).filter((id) => idsOf(keys).includes(id));
    assert.deepEqual(sql, idsOf(['born 2010-02-28']), `${type} sql`);
  }
  assert.deepEqual(await prismaVisibleIds('high_school', LEAP_DAY, keys), idsOf(keys));
});

test('the SQL cutoff does not move with the session time zone', async () => {
  const keys = idsOf(['born 2010-02-28', 'born 2010-03-01']);
  for (const timeZone of ['UTC', 'Etc/GMT+12', 'Pacific/Kiritimati']) {
    const sql = (await attentionMemberIds('community', LEAP_DAY, timeZone)).filter((id) => keys.includes(id));
    assert.deepEqual(sql, idsOf(['born 2010-02-28']), timeZone);
  }
});

test('the payout-due count leaves out a hidden minor and keeps a school partner\'s', async () => {
  for (const type of PARTNER_TYPES) {
    const expected = keysVisibleTo(type, PLACED, NOW).length;
    const count = await countUnpaidVerifiedPlacements(seeded.partnerIds[type], seeded.orgId, partnerDataAccess({ partnerType: type }));
    assert.equal(count, expected, type);
  }
  assert.equal(keysVisibleTo('community', PLACED, NOW).length, 1);
  assert.equal(keysVisibleTo('high_school', PLACED, NOW).length, 2);
});

test('the partner timeline leaves out events whose actor is a hidden member', async () => {
  const actors = ['placed adult', 'placed minor', 'minor with FERPA consent'];
  for (const partnerId of Object.values(seeded.partnerIds)) {
    for (const key of actors) {
      await prisma.portalWorkflowEvent.create({
        data: { scope: 'partner', partnerId, actorUserId: seeded.userIds.get(key)!, kind: 'contract', headline: key },
      });
    }
    await prisma.portalWorkflowEvent.create({
      data: { scope: 'partner', partnerId, actorUserId: seeded.staffUserId, kind: 'contract', headline: 'partner staff' },
    });
    await prisma.portalWorkflowEvent.create({ data: { scope: 'partner', partnerId, actorUserId: null, kind: 'contract', headline: 'system' } });
  }
  for (const type of PARTNER_TYPES) {
    const rows = await listPartnerWorkflowEvents(seeded.partnerIds[type], 50, partnerDataAccess({ partnerType: type }));
    const headlines = rows.map((r) => r.headline).sort();
    const expected = type === 'high_school'
      ? [...actors, 'partner staff', 'system'].sort()
      : ['minor with FERPA consent', 'partner staff', 'placed adult', 'system'].sort();
    assert.deepEqual(headlines, expected, type);
  }
});

test('a relation-filtered referral lookup (the partner routes) finds a visible member and not a hidden one', async () => {
  for (const type of ['community', 'referral'] as const) {
    const access = partnerDataAccess({ partnerType: type });
    const find = (key: string) => prisma.partnerReferral.findFirst({
      where: { partnerId: seeded.partnerIds[type], memberId: seeded.userIds.get(key)!, member: withPartnerMemberVisibility({}, access) },
      select: { id: true },
    });
    assert.ok(await find('adult'), `${type}: adult`);
    assert.ok(await find('no profile row'), `${type}: no profile row`);
    assert.equal(await find('minor by flag'), null, `${type}: minor by flag`);
    assert.equal(await find('minor by date of birth'), null, `${type}: minor by date of birth`);
  }
});
