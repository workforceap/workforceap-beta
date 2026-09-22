import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCatalogCoverageReport,
  catalogCoverageIssueLabel,
} from './catalogCoverage';

test('catalog coverage report covers every registered Learning Path', () => {
  const report = buildCatalogCoverageReport();
  assert.equal(report.summary.pathCount, 16);
  assert.ok(report.summary.pathsWithIssues > 0, 'known catalog gaps should surface as issues');
  assert.ok(
    report.summary.missingLearningPathIds >= 1,
    'tEMYo (IT Support + Entry-Level Cyber) still lacks a Learning Path id',
  );
  assert.equal(
    report.summary.missingDiscoveredCatalog,
    0,
    'every registered path should have a discovered catalog entry after Curriculum sync',
  );
});

test('IT Support + Entry-Level Cyber path still lacks learningPathId but has a catalog entry', () => {
  const report = buildCatalogCoverageReport();
  const row = report.rows.find((entry) => entry.collectionId === 'tEMYo');
  assert.ok(row);
  assert.equal(row.programSlug, 'it-support-and-entry-level-cyber-security-certificate');
  assert.equal(row.learningPathId, null);
  assert.equal(row.discoveredCourseCount, 12);
  assert.ok(row.curatedCourseCount > 0);
  assert.ok(row.issues.includes('missing_learning_path_id'));
  assert.equal(row.issues.includes('missing_discovered_catalog'), false);
});

test('combined Net+/Sec+ discovered catalog matches the curated Curriculum collection', () => {
  const report = buildCatalogCoverageReport();
  const row = report.rows.find((entry) => entry.collectionId === '81uci');
  assert.ok(row);
  assert.equal(row.programSlug, 'cybersecurity-professional-certificate-google');
  assert.equal(row.discoveredCourseCount, row.curatedCourseCount);
  assert.equal(row.curatedOnlyCourseIds.length, 0);
  assert.equal(row.discoveredOnlyCourseIds.length, 0);
  assert.equal(row.issues.includes('discovered_missing_curated_courses'), false);
});

test('catalogCoverageIssueLabel covers every issue kind', () => {
  assert.match(catalogCoverageIssueLabel('missing_learning_path_id'), /Learning Path id/i);
  assert.match(catalogCoverageIssueLabel('missing_discovered_catalog'), /discovered catalog/i);
  assert.match(catalogCoverageIssueLabel('discovered_missing_curated_courses'), /missing curated/i);
  assert.match(catalogCoverageIssueLabel('discovered_extra_courses'), /extra courses/i);
  assert.match(catalogCoverageIssueLabel('unverified_path'), /Unverified/i);
});

/**
 * WAP-76: the committed catalog must say what the Curriculum download says.
 *
 * Two programs are deliberately excluded and must stay excluded. Their live
 * learner collections (legacy-v1) are not the board-approved 2026-approved-v2
 * curricula, and the approved sets have no Coursera collection yet
 * (docs/plans/2026-08-30-approved-coursera-curriculum-v2.md). Refreshing them
 * from the download would quietly replace an approved curriculum with an
 * unapproved one, so the drift is recorded here rather than removed.
 */
const DELIBERATELY_UNREFRESHED: ReadonlyMap<string, string> = new Map([
  ['pWA8u', 'Data Science / DBA (IBM) - approved v2 curriculum has no Coursera collection'],
  ['Qa9KU', 'Management & Data Analyst - approved v2 curriculum has no Coursera collection'],
]);

test('every refreshed program matches its curated collection exactly', () => {
  const report = buildCatalogCoverageReport();
  const drifted: string[] = [];
  let compared = 0;
  for (const row of report.rows) {
    if (row.discoveredCourseCount === null) continue;
    if (DELIBERATELY_UNREFRESHED.has(row.collectionId)) continue;
    compared += 1;
    if (row.curatedOnlyCourseIds.length > 0 || row.discoveredOnlyCourseIds.length > 0) {
      drifted.push(
        `${row.collectionId} (${row.programSlug}): ` +
          `${row.curatedOnlyCourseIds.length} missing from the catalog, ` +
          `${row.discoveredOnlyCourseIds.length} the collection no longer carries`,
      );
    }
  }
  assert.deepEqual(drifted, [], `catalog has drifted from the Curriculum download:\n  ${drifted.join('\n  ')}`);
  // An empty drift list proves nothing about an empty input. There are 16
  // registered Learning Paths and two documented exceptions, so this loop must
  // have actually compared the other fourteen.
  assert.equal(
    compared,
    report.summary.pathCount - DELIBERATELY_UNREFRESHED.size,
    'the drift loop skipped programs it should have compared',
  );
  assert.ok(compared >= 14, `only ${compared} programs were compared against the download`);
});

test('the two deliberately unrefreshed programs are still the only exceptions', () => {
  const report = buildCatalogCoverageReport();
  const stillDrifting = report.rows
    .filter((row) => row.curatedOnlyCourseIds.length > 0 || row.discoveredOnlyCourseIds.length > 0)
    .map((row) => row.collectionId)
    .sort();
  assert.deepEqual(
    stillDrifting,
    [...DELIBERATELY_UNREFRESHED.keys()].sort(),
    'a program either matches the download or is on the documented exception list',
  );
});

test('UX Design no longer claims the course Coursera dropped', () => {
  const report = buildCatalogCoverageReport();
  const row = report.rows.find((entry) => entry.collectionId === 'h0Rk9');
  assert.ok(row);
  assert.equal(row.programSlug, 'ux-design-professional-certificate-google');
  assert.equal(row.discoveredCourseCount, 6);
  assert.equal(row.curatedCourseCount, 6);
  assert.deepEqual(row.discoveredOnlyCourseIds, [], 'Build Dynamic User Interfaces (UI) for Websites is gone');
});
