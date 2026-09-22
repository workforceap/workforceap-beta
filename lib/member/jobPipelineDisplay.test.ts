import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ACTIVE_APPLICATION_STATUSES,
  displayJobLocation,
  isActiveApplicationStatus,
  JOBS_BOARD_EMPTY,
} from './jobPipelineDisplay';

/** Empty-state copy lives in messages/*.json (`empty.*`, KIT_GUIDE §6). */
const en = JSON.parse(readFileSync(new URL('../../messages/en.json', import.meta.url), 'utf8')) as {
  empty: Record<string, Record<string, string>>;
};

test('displayJobLocation uses a readable fallback instead of an em dash', () => {
  assert.equal(displayJobLocation(null), 'Location not listed');
  assert.equal(displayJobLocation(undefined), 'Location not listed');
  assert.equal(displayJobLocation(''), 'Location not listed');
  assert.equal(displayJobLocation('   '), 'Location not listed');
  assert.equal(displayJobLocation('—'), 'Location not listed');
  assert.equal(displayJobLocation('Austin, TX'), 'Austin, TX');
});

test('empty recommendations copy is a short next step, not a truncated paragraph', () => {
  assert.equal(en.empty.matches.title, 'No matched roles yet');
  assert.ok(en.empty.matches.body.length <= 96);
  assert.doesNotMatch(en.empty.matches.body, /Keep your profile and certifications up to date and/);
  assert.equal(en.empty.matches.action, 'Update profile');
});

test('board inventory empty names next steps without promising seeded jobs', () => {
  assert.equal(JOBS_BOARD_EMPTY.kind, 'unavailable');
  assert.equal(en.empty.openings.title, 'No live openings right now');
  assert.match(en.empty.openings.body, /have not posted live roles yet/i);
  assert.doesNotMatch(en.empty.openings.body, /\[Demo\]|seed|Capital Area/i);
  assert.equal(en.empty.openings.action, 'Update profile');
  assert.equal(en.empty.openings.secondary, 'Message your counselor');
  assert.equal(JOBS_BOARD_EMPTY.primaryHref, '/dashboard/profile');
  assert.equal(JOBS_BOARD_EMPTY.secondaryHref, '/dashboard/messages');
});

describe('ACTIVE_APPLICATION_STATUSES (home tile and Jobs page share one definition)', () => {
  it('counts applications in flight and nothing that is saved-only or closed', () => {
    assert.deepEqual([...ACTIVE_APPLICATION_STATUSES], ['APPLIED', 'PHONE_SCREEN', 'INTERVIEWING', 'OFFER']);
    for (const status of ACTIVE_APPLICATION_STATUSES) assert.equal(isActiveApplicationStatus(status), true);
    assert.equal(isActiveApplicationStatus('SAVED'), false, 'a saved job is not an application yet');
    assert.equal(isActiveApplicationStatus('ACCEPTED'), false, 'an accepted offer is closed');
    assert.equal(isActiveApplicationStatus('REJECTED'), false);
    assert.equal(isActiveApplicationStatus(null), false);
    assert.equal(isActiveApplicationStatus(undefined), false);
  });

  it('the Jobs page counts every row before its 20-row table cap and the home tile filters on the same list', () => {
    const rows = [
      ...Array.from({ length: 25 }, (_, i) => ({ status: i % 2 ? 'APPLIED' : 'INTERVIEWING' })),
      { status: 'SAVED' },
      { status: 'SAVED' },
      { status: 'ACCEPTED' },
      { status: 'REJECTED' },
    ];
    const active = rows.filter((row) => isActiveApplicationStatus(row.status)).length;
    assert.equal(active, 25, 'not capped at 20, no saved / closed rows');
    // What the home loader passes to Prisma for the "Active jobs" tile.
    const homeWhere = { status: { in: [...ACTIVE_APPLICATION_STATUSES] } };
    const homeCount = rows.filter((row) => homeWhere.status.in.includes(row.status as never)).length;
    assert.equal(homeCount, active);
  });
});
