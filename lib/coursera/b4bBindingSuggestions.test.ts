import test from 'node:test';
import assert from 'node:assert/strict';

import { computeBindingSuggestions } from './b4bBindingSuggestions';
import type { Program } from '@/lib/content/programs';
import type { B4BProgramWithContents } from '@/lib/coursera/programContentsCache';

function mkProgram(slug: string, title: string, courseraB4BProgramId?: string): Program {
  return {
    slug,
    title,
    category: 'test',
    categoryLabel: 'Test',
    categoryColor: '#000',
    borderColor: '#000',
    icon: '🧪',
    duration: '—',
    skills: [],
    courses: [],
    partner: 'Test',
    courseraB4BProgramId,
  };
}

function mkB4B(id: string, name: string, slug?: string): B4BProgramWithContents {
  return { id, slug: slug ?? null, name, url: null, courses: [] };
}

test('exact normalized name match → confidence "exact" and not yet bound', () => {
  const catalog = [mkProgram('it-support-ibm', 'IT Support Professional Certificate (IBM)')];
  const b4b = [mkB4B('B4B-IT', 'IT Support Professional Certificate (IBM)')];
  const report = computeBindingSuggestions(catalog, b4b);
  assert.equal(report.exactMatches, 1);
  assert.equal(report.suggestions[0]!.confidence, 'exact');
  assert.equal(report.suggestions[0]!.alreadyBound, false);
  assert.equal(report.suggestions[0]!.suggestedB4BId, 'B4B-IT');
});

test('already-bound match counts only as alreadyBound, not exact', () => {
  const catalog = [
    mkProgram('it-support-ibm', 'IT Support Professional Certificate (IBM)', 'B4B-IT'),
  ];
  const b4b = [mkB4B('B4B-IT', 'IT Support Professional Certificate (IBM)')];
  const report = computeBindingSuggestions(catalog, b4b);
  assert.equal(report.alreadyBound, 1);
  assert.equal(report.exactMatches, 0);
  assert.equal(report.suggestions[0]!.alreadyBound, true);
});

test('partial match catches name variants (multi-program org)', () => {
  const catalog = [mkProgram('ai-dev-ibm', 'AI Professional Practitioner Certificate')];
  // Provide 2 B4B programs so the single-umbrella branch doesn't engage.
  const b4b = [
    mkB4B('B4B-AI', 'AI Professional Practitioner Certificate (IBM)'),
    mkB4B('B4B-PEER', 'Unrelated Peer Program'),
  ];
  const report = computeBindingSuggestions(catalog, b4b);
  assert.equal(report.umbrella, null);
  assert.equal(report.partialMatches, 1);
  assert.equal(report.suggestions[0]!.confidence, 'partial');
});

test('no candidate → unmatched (multi-program org)', () => {
  const catalog = [mkProgram('digital-literacy', 'Digital Literacy Empowerment Class')];
  const b4b = [
    mkB4B('B4B-OTHER', 'Some Unrelated Program'),
    mkB4B('B4B-OTHER-2', 'Another Unrelated Program'),
  ];
  const report = computeBindingSuggestions(catalog, b4b);
  assert.equal(report.umbrella, null);
  assert.equal(report.unmatched, 1);
  assert.equal(report.suggestions[0]!.confidence, 'none');
  assert.equal(report.suggestions[0]!.suggestedB4BId, null);
});

test('drift detected when current id differs from suggestion', () => {
  const catalog = [
    mkProgram('it-support-ibm', 'IT Support Professional Certificate (IBM)', 'STALE-ID'),
  ];
  const b4b = [mkB4B('FRESH-ID', 'IT Support Professional Certificate (IBM)')];
  const report = computeBindingSuggestions(catalog, b4b);
  const s = report.suggestions[0]!;
  assert.equal(s.alreadyBound, false);
  assert.equal(s.suggestedB4BId, 'FRESH-ID');
  assert.equal(s.currentB4BId, 'STALE-ID');
});

test('multiple programs aggregate counts correctly', () => {
  const catalog = [
    mkProgram('a', 'Program A', 'A-ID'),
    mkProgram('b', 'Program B'),
    mkProgram('c', 'Program C'),
  ];
  const b4b = [
    mkB4B('A-ID', 'Program A'),
    mkB4B('B-ID', 'Program B'),
    // C has no B4B match
  ];
  const report = computeBindingSuggestions(catalog, b4b);
  assert.equal(report.umbrella, null);
  assert.equal(report.alreadyBound, 1);
  assert.equal(report.exactMatches, 1);
  assert.equal(report.unmatched, 1);
  assert.equal(report.totalCatalogPrograms, 3);
  assert.equal(report.totalB4BPrograms, 2);
});

test('single-umbrella B4B org binds every catalog program to the umbrella', () => {
  const catalog = [
    mkProgram('it', 'IT Support'),
    mkProgram('data', 'Data Analytics'),
    mkProgram('ai', 'AI Practitioner'),
  ];
  const b4b = [mkB4B('UMB-ID', 'Workforce Advancement Project', 'wap-shell')];
  const report = computeBindingSuggestions(catalog, b4b);

  assert.deepEqual(report.umbrella, {
    id: 'UMB-ID',
    name: 'Workforce Advancement Project',
    slug: 'wap-shell',
  });
  assert.equal(report.totalCatalogPrograms, 3);
  assert.equal(report.totalB4BPrograms, 1);
  assert.equal(report.exactMatches, 3);
  assert.equal(report.alreadyBound, 0);
  assert.equal(report.unmatched, 0);
  for (const s of report.suggestions) {
    assert.equal(s.suggestedB4BId, 'UMB-ID');
    assert.equal(s.confidence, 'exact');
  }
});

test('umbrella with already-bound program counts correctly', () => {
  const catalog = [
    mkProgram('it', 'IT Support', 'UMB-ID'),
    mkProgram('data', 'Data Analytics'),
  ];
  const b4b = [mkB4B('UMB-ID', 'Umbrella')];
  const report = computeBindingSuggestions(catalog, b4b);
  assert.equal(report.alreadyBound, 1);
  assert.equal(report.exactMatches, 1);
});
