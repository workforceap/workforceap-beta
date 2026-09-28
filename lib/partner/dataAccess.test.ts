import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  isMinorProfile,
  minorBirthDateCutoff,
  partnerDataAccess,
  partnerDisclosureMessageKey,
  partnerEmailDetails,
  partnerHiddenMemberWhere,
  partnerMayViewMember,
  partnerPlacementSelect,
  partnerProgressStage,
  partnerVisiblePlacement,
  withPartnerMemberVisibility,
} from './dataAccess';

const NOW = new Date('2026-09-28T12:00:00Z');
const PLACEMENT = {
  employerName: 'SECRET_EMPLOYER',
  jobTitle: 'SECRET_ROLE',
  salaryOffered: 98765,
  placedAt: new Date('2026-08-01T00:00:00Z'),
  startDateVerified: true,
  onboardingWindowEnd: new Date('2026-10-01T00:00:00Z'),
  retentionDecision: 'retained',
  retentionStatus: 'active',
};

test('referral (payout-track) partners are the restricted tier; every other type keeps the full view', () => {
  assert.equal(partnerDataAccess({ partnerType: 'referral' }).tier, 'restricted');
  for (const type of ['community', 'high_school', 'training_center', '', null, undefined]) {
    assert.equal(partnerDataAccess({ partnerType: type }).tier, 'full', String(type));
  }
  assert.equal(partnerDataAccess(null).tier, 'full');
  const restricted = partnerDataAccess({ partnerType: 'referral' });
  assert.deepEqual(
    [restricted.canSeeContact, restricted.canSeeProfileDetails, restricted.canSeePlacementDetails],
    [false, false, false],
  );
  const community = partnerDataAccess({ partnerType: 'community' });
  assert.deepEqual(
    [community.canSeeContact, community.canSeeProfileDetails, community.canSeePlacementDetails],
    [true, true, true],
  );
});

test('restricted placement keeps only placed yes/no and the date', () => {
  const restricted = partnerVisiblePlacement(partnerDataAccess({ partnerType: 'referral' }), PLACEMENT);
  assert.deepEqual(restricted, {
    employerName: null,
    jobTitle: null,
    salaryOffered: null,
    placedAt: PLACEMENT.placedAt,
    startDateVerified: true,
    onboardingWindowEnd: null,
    retentionDecision: null,
    retentionStatus: null,
  });
  assert.doesNotMatch(JSON.stringify(restricted), /SECRET|98765|retained/);
  assert.deepEqual(partnerPlacementSelect(partnerDataAccess({ partnerType: 'referral' })), {
    placedAt: true,
    startDateVerified: true,
  });
});

test('community placement is unchanged', () => {
  const full = partnerVisiblePlacement(partnerDataAccess({ partnerType: 'community' }), PLACEMENT);
  assert.equal(full?.employerName, 'SECRET_EMPLOYER');
  assert.equal(full?.jobTitle, 'SECRET_ROLE');
  assert.equal(full?.salaryOffered, 98765);
  assert.equal(full?.retentionDecision, 'retained');
  assert.equal(partnerVisiblePlacement(partnerDataAccess({ partnerType: 'community' }), null), null);
});

test('a minor is the isMinor flag or a saved date of birth under 18', () => {
  assert.equal(isMinorProfile({ isMinor: true }, NOW), true);
  assert.equal(isMinorProfile({ isMinor: false, dob: new Date('2010-01-01') }, NOW), true);
  assert.equal(isMinorProfile({ isMinor: false, dob: '2008-09-28' }, NOW), false, '18 today');
  assert.equal(isMinorProfile({ isMinor: false, dob: '2008-09-29' }, NOW), true, '18 tomorrow');
  assert.equal(isMinorProfile({ isMinor: false, dob: null }, NOW), false);
  assert.equal(isMinorProfile(null, NOW), false);
  assert.equal(minorBirthDateCutoff(NOW).toISOString(), '2008-09-28T00:00:00.000Z');
});

test('minors are hidden from non-school partners unless FERPA consent is on file', () => {
  const minor = { isMinor: true, ferpaConsentGiven: false };
  const consented = { isMinor: true, ferpaConsentGiven: true };
  for (const type of ['community', 'referral', 'other']) {
    const access = partnerDataAccess({ partnerType: type });
    assert.equal(partnerMayViewMember(access, minor, NOW), false, type);
    assert.equal(partnerMayViewMember(access, consented, NOW), true, type);
    assert.equal(partnerMayViewMember(access, { isMinor: false }, NOW), true, type);
    assert.equal(partnerMayViewMember(access, null, NOW), true, type);
  }
  assert.equal(partnerMayViewMember(partnerDataAccess({ partnerType: 'high_school' }), minor, NOW), true);
});

test('the Prisma filter appends to NOT and never overwrites existing exclusions', () => {
  const community = partnerDataAccess({ partnerType: 'community' });
  const existingNot = [{ email: { endsWith: '@example.com' } }];
  const where = withPartnerMemberVisibility({ deletedAt: null, NOT: existingNot }, community, NOW);
  assert.equal(where.deletedAt, null);
  assert.deepEqual(where.NOT, [...existingNot, partnerHiddenMemberWhere(community, NOW)]);
  assert.deepEqual(partnerHiddenMemberWhere(community, NOW), {
    profile: {
      is: {
        ferpaConsentGiven: false,
        OR: [{ isMinor: true }, { dob: { gt: new Date('2008-09-28T00:00:00.000Z') } }],
      },
    },
  });
  const school = partnerDataAccess({ partnerType: 'high_school' });
  const original = { deletedAt: null };
  assert.equal(withPartnerMemberVisibility(original, school, NOW), original);
  assert.equal(partnerHiddenMemberWhere(school, NOW), null);
});

test('restricted partner emails keep program, course and certification names only', () => {
  const restricted = partnerDataAccess({ partnerType: 'referral' });
  assert.deepEqual(partnerEmailDetails(restricted, { Employer: 'Acme', Role: 'Tech', Program: 'IT Support' }), {
    Program: 'IT Support',
  });
  const details = { Employer: 'Acme', Role: 'Tech' };
  assert.equal(partnerEmailDetails(partnerDataAccess({ partnerType: 'community' }), details), details);
});

test('progress stage buckets', () => {
  assert.equal(partnerProgressStage({ enrolled: false, progressPct: 0 }), 'not_enrolled');
  assert.equal(partnerProgressStage({ enrolled: true, progressPct: 0 }), 'enrolled');
  assert.equal(partnerProgressStage({ enrolled: true, progressPct: 40 }), 'in_progress');
  assert.equal(partnerProgressStage({ enrolled: true, progressPct: 100 }), 'completed');
});

test('every locale carries both disclosure templates, naming the partner, and the restricted copy lists what is withheld', () => {
  for (const locale of ['en', 'es', 'fr', 'pt']) {
    const messages = JSON.parse(readFileSync(path.join(process.cwd(), 'messages', `${locale}.json`), 'utf8'));
    for (const tier of ['restricted', 'full'] as const) {
      const key = `partnerDisclosure${partnerDisclosureMessageKey(tier) === 'restricted' ? 'Restricted' : 'Full'}`;
      const copy = messages.apply[key];
      assert.equal(typeof copy, 'string', `${locale} ${key}`);
      assert.match(copy, /\{partner\}/, `${locale} ${key}`);
    }
  }
  const en = JSON.parse(readFileSync(path.join(process.cwd(), 'messages', 'en.json'), 'utf8')).apply;
  assert.match(en.partnerDisclosureRestricted, /will not see your email, phone number, address, employment or education details, employer, job title, or pay/);
  assert.match(en.partnerDisclosureFull, /email address/);
  assert.match(en.partnerDisclosureFull, /employer, job title, pay/);
});
