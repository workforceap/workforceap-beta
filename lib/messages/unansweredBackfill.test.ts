import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyUnansweredBackfill,
  findUnansweredThreadsMissingStaffNotification,
  planBackfillEntry,
  type UnansweredThreadRow,
} from './unansweredBackfill';

const row: UnansweredThreadRow = {
  threadId: 'thread-1', memberId: 'member-1', organizationId: 'org-a', memberLabel: 'Ada Member',
  counselorUserId: 'admin-1', messageId: 'msg-1', messagePreview: 'Can someone help me?',
  memberLastMessageAt: new Date('2026-08-29T15:00:00Z'), staffNotificationsSince: 0,
};

test('routes to the counselor of record when that user still exists', () => {
  const entry = planBackfillEntry(row, { counselorExists: true, adminUserIds: ['admin-2'] });
  assert.equal(entry.route, 'counselor');
  assert.deepEqual(entry.recipientUserIds, ['admin-1']);
  assert.equal(entry.link, '/counselor');
  assert.match(entry.title, /Ada Member/);
});

test('falls back to org admins when the thread has nobody on the other end', () => {
  const entry = planBackfillEntry({ ...row, counselorUserId: null }, { counselorExists: false, adminUserIds: ['admin-2', 'member-1'] });
  assert.equal(entry.route, 'admins');
  // A member who also holds an admin profile never receives their own message.
  assert.deepEqual(entry.recipientUserIds, ['admin-2']);
  assert.equal(entry.link, '/admin/messages');
});

test('a deleted counselor of record is treated as unassigned', () => {
  const entry = planBackfillEntry(row, { counselorExists: false, adminUserIds: [] });
  assert.equal(entry.route, 'none');
  assert.deepEqual(entry.recipientUserIds, []);
});

test('only threads with zero staff notifications since the member wrote are returned', async () => {
  const db = {
    $queryRawUnsafe: async () => [
      { thread_id: 't1', member_id: 'm1', organization_id: 'o', member_label: 'A', counselor_user_id: null, message_id: 'x1', body: 'a'.repeat(300), member_last_msg_at: new Date(), staff_notifications_since: 0 },
      { thread_id: 't2', member_id: 'm2', organization_id: 'o', member_label: 'B', counselor_user_id: 'c', message_id: 'x2', body: 'hi', member_last_msg_at: new Date(), staff_notifications_since: 1 },
    ],
  } as any;
  const rows = await findUnansweredThreadsMissingStaffNotification(db);
  assert.deepEqual(rows.map((r) => r.threadId), ['t1']);
  assert.equal(rows[0].messagePreview.length, 200);
});

test('apply writes one notification per recipient and tags it as a backfill', async () => {
  const written: any[] = [];
  const result = await applyUnansweredBackfill([
    planBackfillEntry({ ...row, counselorUserId: null }, { counselorExists: false, adminUserIds: ['admin-2', 'admin-3'] }),
    planBackfillEntry(row, { counselorExists: false, adminUserIds: [] }),
  ], async (input) => { written.push(input); });
  assert.deepEqual(result, { notificationsCreated: 2, threadsNotified: 1, threadsWithoutRecipient: 1 });
  assert.deepEqual(written.map((w) => w.userId), ['admin-2', 'admin-3']);
  assert.equal(written[0].type, 'message');
  assert.equal(written[0].data.backfill, 'wap-168');
  assert.equal(written[0].data.threadId, 'thread-1');
  assert.equal(written[0].data.unassigned, true);
});
