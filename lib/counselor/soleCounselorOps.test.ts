import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  DEFAULT_SOLE_COUNSELOR_EMAIL,
  formatSoleCounselorPlan,
  isOpsFixtureEmail,
  type SoleCounselorPlan,
} from './soleCounselorOps';

describe('soleCounselorOps', () => {
  it('keeps the confirmed dad email as the default sole counselor', () => {
    assert.equal(DEFAULT_SOLE_COUNSELOR_EMAIL, 'mbrowncsn@sbcglobal.net');
  });

  it('treats portal QA and seeded fixture emails as non-caseload', () => {
    assert.equal(isOpsFixtureEmail('counselor-test@workforceap.org'), true);
    assert.equal(isOpsFixtureEmail('member-test@workforceap.org'), true);
    assert.equal(isOpsFixtureEmail('test-smoke-abc@example.com'), true);
    assert.equal(isOpsFixtureEmail('someone@example.com'), true);
    assert.equal(isOpsFixtureEmail('mbrown@hsconsultingtx.com'), true);
    assert.equal(isOpsFixtureEmail('john.cofield@gmail.com'), false);
    assert.equal(isOpsFixtureEmail('mbrowncsn@sbcglobal.net'), false);
  });

  it('formats a readable dry-run plan', () => {
    const plan: SoleCounselorPlan = {
      sole: {
        counselorId: 'c-dad',
        userId: 'u-dad',
        email: 'mbrowncsn@sbcglobal.net',
        fullName: 'Michael Brown',
        organizationId: 'org-1',
        active: true,
        affiliation: 'wap_staff',
      },
      otherActiveWapStaff: [
        {
          counselorId: 'c-other',
          userId: 'u-other',
          email: 'other@workforceap.org',
          fullName: 'Other Counselor',
          activeCaseload: 2,
        },
      ],
      alreadyInactiveOthers: [
        {
          counselorId: 'c-qa',
          userId: 'u-qa',
          email: 'counselor-test@workforceap.org',
          fullName: 'Portal QA Counselor',
          activeCaseload: 0,
        },
      ],
      reassign: [
        {
          memberId: 'm-1',
          email: 'member@gmail.com',
          fullName: 'Ada Member',
          organizationId: 'org-1',
          threadOwnerEmail: 'mabrown040@gmail.com',
          reason: 'unassigned',
        },
      ],
      skipped: [
        {
          memberId: 'm-2',
          email: 'partnered@gmail.com',
          fullName: 'Pat Partnered',
          reason: 'partner_referred',
        },
      ],
      mikeOwnedThreadCount: 1,
    };

    const text = formatSoleCounselorPlan(plan);
    assert.match(text, /mbrowncsn@sbcglobal\.net/);
    assert.match(text, /Other active WAP staff to deactivate: 1/);
    assert.match(text, /Unassigned members to assign to sole counselor: 1/);
    assert.match(text, /partner_referred: 1/);
    assert.match(text, /threadOwner=mabrown040@gmail\.com/);
  });
});
