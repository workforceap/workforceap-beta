import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { WioaScreeningRow } from '@/components/portal/kit/pages/admin-subviews/WioaScreeningKit';
import {
  matchesWioaScreeningSearch,
  sortWioaScreeningRows,
} from '@/lib/admin/wioaScreeningSort';

function row(over: Partial<WioaScreeningRow> & Pick<WioaScreeningRow, 'id' | 'name'>): WioaScreeningRow {
  return {
    initials: 'AA',
    category: 'Adult',
    docs: 'Complete',
    docsComplete: true,
    reviewStatus: 'pending',
    reviewer: '—',
    awaitingReview: true,
    daysWaiting: 3,
    ...over,
  };
}

describe('wioaScreeningSort', () => {
  it('sorts days waiting descending by default key', () => {
    const rows = [
      row({ id: 'a', name: 'Ann', daysWaiting: 2 }),
      row({ id: 'b', name: 'Bob', daysWaiting: 10 }),
      row({ id: 'c', name: 'Cy', daysWaiting: null, awaitingReview: false }),
    ];
    const sorted = sortWioaScreeningRows(rows, 'daysWaiting', 'desc');
    assert.deepEqual(sorted.map((r) => r.id), ['b', 'a', 'c']);
  });

  it('sorts student names ascending', () => {
    const rows = [
      row({ id: 'b', name: 'Zoe' }),
      row({ id: 'a', name: 'Ann' }),
    ];
    const sorted = sortWioaScreeningRows(rows, 'name', 'asc');
    assert.deepEqual(sorted.map((r) => r.name), ['Ann', 'Zoe']);
  });

  it('matches search across name and docs', () => {
    const r = row({ id: '1', name: 'Jordan Lee', docs: 'Missing W-2', docsComplete: false });
    assert.equal(matchesWioaScreeningSearch(r, 'jordan'), true);
    assert.equal(matchesWioaScreeningSearch(r, 'w-2'), true);
    assert.equal(matchesWioaScreeningSearch(r, 'zzz'), false);
  });
});
