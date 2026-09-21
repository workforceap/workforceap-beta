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
