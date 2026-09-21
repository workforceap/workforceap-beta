import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ANALYTICS_TABS,
  DAILY_ACTIVITY_BUCKET_NOTE,
  buildEnrollmentOutcomesPanel,
  degradedSlicesNote,
  parseAnalyticsTab,
} from './analyticsTabs';

describe('analytics tabs', () => {
  it('lists Engagement first and Enrollment and outcomes second', () => {
    assert.deepEqual(ANALYTICS_TABS.map((tab) => [tab.id, tab.label]), [
      ['engagement', 'Engagement'],
      ['enrollment', 'Enrollment and outcomes'],
    ]);
  });

  it('parses ?tab= and falls back to engagement', () => {
    assert.equal(parseAnalyticsTab('enrollment'), 'enrollment');
    assert.equal(parseAnalyticsTab(['enrollment', 'x']), 'enrollment');
    assert.equal(parseAnalyticsTab('engagement'), 'engagement');
    assert.equal(parseAnalyticsTab('metrics'), 'engagement');
    assert.equal(parseAnalyticsTab(undefined), 'engagement');
    assert.equal(parseAnalyticsTab(null), 'engagement');
  });
});

describe('enrollment and outcomes projection', () => {
  const source = {
    totalMembers: 1200, weeklyActiveMembers: 300, aiToolRuns: 45,
    placementStats: { enrolled: 800, placed: 200, certifications: 50, placementRate: 25 },
    enrollmentByProgram: [{ program: 'Cyber', count: 2 }, { program: 'IT Support', count: 6 }, { program: 'Data', count: 2 }],
    careerOsMetrics: { completionEventsReceived: 4, actionsCreated: 3, actionsPending: 1, actionsCompleted: 2, followThroughRate: 67 },
  };

  it('prints each program as its share of all enrolled members, largest first', () => {
    const panel = buildEnrollmentOutcomesPanel(source);
    assert.equal(panel.enrolledTotal, 10);
    assert.deepEqual(panel.enrollmentByProgram.map((row) => [row.label, row.value, row.pct]), [
      ['IT Support', '6 · 60%', 60],
      ['Cyber', '2 · 20%', 20],
      ['Data', '2 · 20%', 20],
    ]);
  });

  it('labels the six headline tiles and captions the ratios', () => {
    const panel = buildEnrollmentOutcomesPanel(source);
    assert.deepEqual(panel.kpis.map((kpi) => [kpi.label, kpi.value]), [
      ['Total members', '1,200'],
      ['Weekly active', '300'],
      ['Placements', '200'],
      ['Placement rate', '25%'],
      ['Certificates', '50'],
      ['AI tool runs', '45'],
    ]);
    assert.equal(panel.kpis[3].delta, '200 of 800 enrolled');
    assert.equal(panel.kpis[3].deltaTone, 'muted');
    assert.deepEqual(panel.careerOs.map((kpi) => kpi.value), ['4', '3', '1', '2', '67%']);
  });

  it('handles no enrollments without dividing by zero', () => {
    const panel = buildEnrollmentOutcomesPanel({ ...source, enrollmentByProgram: [] });
    assert.equal(panel.enrolledTotal, 0);
    assert.deepEqual(panel.enrollmentByProgram, []);
    const zero = buildEnrollmentOutcomesPanel({ ...source, enrollmentByProgram: [{ program: 'X', count: 0 }] });
    assert.equal(zero.enrollmentByProgram[0].pct, 0);
  });
});

describe('overview tab qualifies its numbers (number audit S29 follow-on)', () => {
  const source = {
    totalMembers: 10, weeklyActiveMembers: 4, aiToolRuns: 3,
    placementStats: { enrolled: 8, placed: 2, certifications: 1, placementRate: 25 },
    enrollmentByProgram: [{ program: 'IT Support', count: 8 }],
    careerOsMetrics: { completionEventsReceived: 1, actionsCreated: 1, actionsPending: 0, actionsCompleted: 1, followThroughRate: 100 },
  };

  it('always carries the calendar-day note, so the newest bucket is not read as a rolling 24h', () => {
    const panel = buildEnrollmentOutcomesPanel(source);
    assert.equal(panel.chartsNote, DAILY_ACTIVITY_BUCKET_NOTE);
    assert.match(panel.chartsNote, /midnight to midnight/);
    assert.match(panel.chartsNote, /not a rolling 24 hours/);
  });

  it('says nothing about degraded slices when every number is real', () => {
    assert.equal(buildEnrollmentOutcomesPanel(source).degradedNote, undefined);
    assert.equal(buildEnrollmentOutcomesPanel({ ...source, degradedSlices: [] }).degradedNote, undefined);
    assert.equal(degradedSlicesNote(undefined), undefined);
    assert.equal(degradedSlicesNote([]), undefined);
  });

  it('names the zero-filled slices so a 0 is not read as "none"', () => {
    const panel = buildEnrollmentOutcomesPanel({ ...source, degradedSlices: ['placementStats', 'dailyActivity'] });
    assert.ok(panel.degradedNote);
    assert.match(panel.degradedNote, /showing 0/);
    assert.match(panel.degradedNote, /placementStats, dailyActivity/);
    assert.match(panel.degradedNote, /never cached/);
  });

  it('leaves every printed number untouched when a slice is degraded (captions only)', () => {
    const clean = buildEnrollmentOutcomesPanel(source);
    const degraded = buildEnrollmentOutcomesPanel({ ...source, degradedSlices: ['placementStats'] });
    assert.deepEqual(degraded.kpis, clean.kpis);
    assert.deepEqual(degraded.enrollmentByProgram, clean.enrollmentByProgram);
    assert.deepEqual(degraded.careerOs, clean.careerOs);
    assert.equal(degraded.enrolledTotal, clean.enrolledTotal);
  });
});
