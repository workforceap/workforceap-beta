import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REPORTING_HUB_PATH,
  REPORTING_PERIOD_LABELS,
  REPORTING_REDIRECTS,
  REPORTING_RELATED_LINKS,
  REPORTING_TABS,
  REPORTING_TAB_COPY,
  parseReportingPeriod,
  parseReportingTab,
  reportingRedirectHref,
  reportingRelatedHref,
  reportingTabHref,
  reportingViewContext,
  wantsLegacyView,
} from './reportingHub';

test('the hub has exactly the five proposed tabs, Overview first', () => {
  assert.deepEqual(
    REPORTING_TABS.map((tab) => tab.id),
    ['overview', 'outcomes', 'training', 'coursera', 'exports'],
  );
  for (const tab of REPORTING_TABS) {
    assert.ok(REPORTING_TAB_COPY[tab.id].title.length > 0, `${tab.id} has a title`);
    assert.ok(REPORTING_TAB_COPY[tab.id].lede.length > 0, `${tab.id} has a lede`);
  }
});

test('parseReportingTab accepts known ids and falls back to the Overview', () => {
  assert.equal(parseReportingTab('outcomes'), 'outcomes');
  assert.equal(parseReportingTab(['training']), 'training');
  assert.equal(parseReportingTab('bogus'), 'overview');
  assert.equal(parseReportingTab(undefined), 'overview');
  assert.equal(parseReportingTab(null), 'overview');
});

test('reportingTabHref always emits ?tab= (including Overview) and appends extras in order', () => {
  assert.equal(reportingTabHref('overview'), '/admin/reporting?tab=overview');
  assert.equal(reportingTabHref('outcomes'), '/admin/reporting?tab=outcomes');
  assert.equal(reportingTabHref('outcomes', { period: 'ytd' }), '/admin/reporting?tab=outcomes&period=ytd');
  assert.equal(reportingTabHref('overview', { period: undefined }), '/admin/reporting?tab=overview');
});

test('parseReportingPeriod validates the board periods', () => {
  assert.equal(parseReportingPeriod('ytd'), 'ytd');
  assert.equal(parseReportingPeriod('q-prev'), 'q-prev');
  assert.equal(parseReportingPeriod('last-century'), 'all-time');
  assert.equal(parseReportingPeriod(undefined), 'all-time');
});

test('every legacy reporting route forwards to a real tab', () => {
  const tabIds = new Set(REPORTING_TABS.map((tab) => tab.id));
  for (const tab of Object.values(REPORTING_REDIRECTS)) assert.ok(tabIds.has(tab), `${tab} is a hub tab`);
  assert.equal(reportingRedirectHref('/admin/analytics'), '/admin/reporting?tab=overview');
  assert.equal(reportingRedirectHref('/admin/metrics'), '/admin/reporting?tab=overview');
  assert.equal(reportingRedirectHref('/admin/board'), '/admin/reporting?tab=outcomes');
  assert.equal(reportingRedirectHref('/admin/outcomes'), '/admin/reporting?tab=outcomes');
  assert.equal(reportingRedirectHref('/admin/training-progress'), '/admin/reporting?tab=training');
  assert.equal(reportingRedirectHref('/admin/coursera'), '/admin/reporting?tab=coursera');
  assert.equal(reportingRedirectHref('/admin/exports'), '/admin/reporting?tab=exports');
});

test('the outcomes routes carry a valid period into the hub and drop junk', () => {
  assert.equal(reportingRedirectHref('/admin/board', { period: 'q-current' }), '/admin/reporting?tab=outcomes&period=q-current');
  assert.equal(reportingRedirectHref('/admin/outcomes', { period: 'ytd', org: 'x' }), '/admin/reporting?tab=outcomes&period=ytd');
  assert.equal(reportingRedirectHref('/admin/outcomes', { period: 'nope' }), '/admin/reporting?tab=outcomes');
  // The analytics ?tab= (engagement | enrollment) both live on the Overview now.
  assert.equal(reportingRedirectHref('/admin/analytics', { tab: 'enrollment' }), '/admin/reporting?tab=overview');
});

test('wantsLegacyView reads only ?ui=legacy', () => {
  assert.equal(wantsLegacyView({ ui: 'legacy' }), true);
  assert.equal(wantsLegacyView({ ui: ['legacy'] }), true);
  assert.equal(wantsLegacyView({ ui: 'kit' }), false);
  assert.equal(wantsLegacyView({}), false);
  assert.equal(wantsLegacyView(undefined), false);
});

test('related links point at routes that stay outside the hub', () => {
  const hubOwned = new Set(Object.keys(REPORTING_REDIRECTS));
  for (const link of REPORTING_RELATED_LINKS) {
    assert.ok(link.href.startsWith('/admin/'), `${link.href} is an admin route`);
    assert.ok(!hubOwned.has(link.href), `${link.href} is not a route the hub replaced`);
  }
});

test('reporting copy never relabels rolling metrics as if they used the outcomes period', () => {
  for (const tab of REPORTING_TABS) {
    const ctx = reportingViewContext(tab.id, 'ytd');
    assert.ok(ctx.periodLabel.length > 0, `${tab.id} has a period label`);
    assert.ok(ctx.scopeLabel.length > 0, `${tab.id} has a scope label`);
    assert.ok(ctx.definition.length > 0, `${tab.id} has a definition`);
  }

  const outcomes = reportingViewContext('outcomes', 'ytd');
  assert.equal(outcomes.periodLabel, `Outcomes: ${REPORTING_PERIOD_LABELS.ytd}`);
  assert.equal(outcomes.scopeLabel, 'This organization');
  assert.match(outcomes.definition, /selected outcomes period/);
  assert.match(outcomes.definition, /rolling windows/);

  const training = reportingViewContext('training', 'ytd', true);
  assert.equal(training.periodLabel, 'Latest saved training progress');
  assert.match(training.definition, /does not filter this roster/);

  const overview = reportingViewContext('overview', 'q-current', true);
  assert.match(overview.scopeLabel, /all organizations/i);
  assert.match(overview.definition, /without changing these measures/);
});

test('only the board print link carries a non-default outcomes period', () => {
  assert.equal(reportingRelatedHref('/admin/board/print', 'ytd'), '/admin/board/print?period=ytd');
  assert.equal(reportingRelatedHref('/admin/board/print', 'all-time'), '/admin/board/print');
  assert.equal(reportingRelatedHref('/admin/weekly-recap', 'ytd'), '/admin/weekly-recap');
});
