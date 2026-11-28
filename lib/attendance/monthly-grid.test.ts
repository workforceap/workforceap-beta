import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodDates, summarize } from './evidence';
import { buildMonthlyGrid, monthlyGridStart } from './monthly-grid';
import { assistiveSignals } from './assistive-signals';

test('November 2026 starts on Sunday and keeps six weeks', () => {
  assert.equal(monthlyGridStart('2026-11-09'), '2026-11-01');
  const grid = buildMonthlyGrid('2026-11-09', summarize(periodDates('monthly', '2026-11-09', null), []));
  assert.equal(grid.weeks.length, 6);
  assert.equal(grid.weeks[0][0].date, '2026-11-01');
  assert.equal(grid.weeks.flat().filter(cell => cell.date).length, 30);
  assert.equal(grid.running.classHours, null);
  assert.equal(grid.running.labHours, null);
  assert.equal(grid.running.totalHours, null);
  assert.equal(grid.weeks.flat().some(cell => cell.classHours === '0.00' || cell.labHours === '0.00'), false);
});

test('staff minutes become class hours only; absence and estimates stay blank', () => {
  const dates = periodDates('monthly', '2026-11-09', null);
  const days = summarize(dates, [
    { sourceKey: 'a', date: '2026-11-09', kind: 'verified-duration', minutes: 270, verifiedBy: 'synthetic-admin', reference: 'synthetic', reason: 'synthetic' },
    { sourceKey: 'b', date: '2026-11-10', kind: 'A', verifiedBy: 'synthetic-admin', reference: 'synthetic', reason: 'synthetic' },
    { sourceKey: 'c', date: '2026-11-11', kind: 'estimated', minutes: 600, verifiedBy: null, reference: 'synthetic', reason: 'synthetic' },
  ]);
  const grid = buildMonthlyGrid('2026-11-09', days);
  const known = grid.weeks.flat().find(cell => cell.date === '2026-11-09');
  const absent = grid.weeks.flat().find(cell => cell.date === '2026-11-10');
  const estimated = grid.weeks.flat().find(cell => cell.date === '2026-11-11');
  assert.equal(known?.classHours, '4.50');
  assert.equal(known?.labHours, null);
  assert.equal(absent?.classHours, null);
  assert.equal(estimated?.classHours, null);
  assert.equal(grid.running.classHours, '4.50');
  assert.equal(grid.running.labHours, null);
  assert.equal(grid.running.totalHours, '4.50');
});

test('assistive signals count points in the month and never become hours', () => {
  const signals = assistiveSignals({
    month: '2026-11',
    courseraPoints: [{ timestamp: '2026-11-09T15:00:00Z' }, { timestamp: '2026-11-09T18:00:00Z' }, { timestamp: '2026-12-01T15:00:00Z' }],
    sitePoints: [{ timestamp: '2026-11-09T16:00:00Z' }],
    coursera: { coursesCompleted: 1, learningHours: 12 },
    catalogHours: 40,
  });
  assert.deepEqual(signals.days, [{ date: '2026-11-09', courseraPoints: 2, sitePoints: 1 }]);
  assert.match(signals.activityLabel, /not verified attendance/);
  assert.match(signals.cumulativeLabel, /not verified attendance/);
  assert.equal('classHours' in signals, false);
});
