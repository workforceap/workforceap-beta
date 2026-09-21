import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REPORTING_HUB_PATH,
  REPORTING_REDIRECTS,
  REPORTING_RELATED_LINKS,
  REPORTING_TABS,
  REPORTING_TAB_COPY,
  parseReportingPeriod,
  parseReportingTab,
  reportingRedirectHref,
  reportingTabHref,
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

test('reportingTabHref keeps the Overview on the bare hub path and appends extras in order', () => {
  assert.equal(reportingTabHref('overview'), REPORTING_HUB_PATH);
  assert.equal(reportingTabHref('outcomes'), '/admin/reporting?tab=outcomes');
  assert.equal(reportingTabHref('outcomes', { period: 'ytd' }), '/admin/reporting?tab=outcomes&period=ytd');
  assert.equal(reportingTabHref('overview', { period: undefined }), REPORTING_HUB_PATH);
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
  assert.equal(reportingRedirectHref('/admin/analytics'), '/admin/reporting');
  assert.equal(reportingRedirectHref('/admin/metrics'), '/admin/reporting');
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
  assert.equal(reportingRedirectHref('/admin/analytics', { tab: 'enrollment' }), '/admin/reporting');
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
