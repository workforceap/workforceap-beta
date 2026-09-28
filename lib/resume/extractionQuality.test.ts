import assert from 'node:assert/strict';
import test from 'node:test';

import { getResumeExtractionWarning } from './extractionQuality';

test('flags merged section headings that stayed on the same line as content', () => {
  const text = `Michael Brown II\nExperience Founding Account Executive | Contango IT | Remote\nExceeded quota in ramp and Q1 2025 through targeted prospecting.\nEducation MBA | Abilene Christian University`;
  assert.match(getResumeExtractionWarning(text) ?? '', /flattened headings or bullets/i);
});

test('does not infer lost bullets from readable heading and entry lines', () => {
  const text = `Jane Doe\nProfessional Summary\nOperations leader with ten years of experience.\nExperience\nLed regional expansion across four markets and increased retention by 18 percent.\nEducation\nState University`;
  assert.equal(getResumeExtractionWarning(text), null);
});

test('does not warn on a readable two-page PDF extraction without bullet symbols', () => {
  const text = `Taylor Quill
Professional Summary
Operations coordinator with experience improving inventory workflows.
Experience
Arbordale Stationery | Operations Coordinator | 2022 to 2025
Reduced weekly stock-count time by 18 percent through a new checklist.
Taylor Quill | continued
Education
Ridgebrook Community College | Associate of Arts | 2021
Skills
Inventory reconciliation, spreadsheet reporting, and team scheduling.
Project
Built a 12-step receiving guide for new warehouse volunteers.`;
  assert.equal(getResumeExtractionWarning(text), null);
});

test('does not mistake a longer line-structured resume for low line-break density', () => {
  const text = [
    'Jane Doe',
    'Professional Summary',
    ...Array.from({ length: 9 }, (_, index) =>
      `Coordinated team ${index + 1} inventory checks and documented every handoff for reliable monthly reporting.`),
    'Experience',
    'Operations Coordinator | 2021 to 2025',
    'Education',
    'State University | 2020',
  ].join('\n');
  assert.ok(text.length >= 500);
  assert.equal(getResumeExtractionWarning(text), null);
});

test('flags long flattened lines with guidance shared across upload flows', () => {
  const lines = [
    'Jane Doe coordinated warehouse intake and documented all shift handoffs. '.repeat(2).trim(),
    'She tracked inventory counts weekly and resolved receiving discrepancies. '.repeat(2).trim(),
    'She trained new volunteers and maintained clear checklist revisions for each shift. '.repeat(2).trim(),
  ];
  const text = lines.join('\n');
  assert.ok(lines.every((line) => line.length >= 140));
  assert.ok(text.length < 500);
  const warning = getResumeExtractionWarning(text) ?? '';
  assert.match(warning, /flattened headings or bullets/i);
  assert.match(warning, /review your resume details/i);
  assert.doesNotMatch(warning, /paste plain text|score/i);
});

test('does not warn for reasonably structured plain-text resumes', () => {
  const text = `Jane Doe\n\nProfessional Summary\nOperations leader with 10 years of experience.\n\nExperience\n• Led regional expansion across four markets and increased retention by 18%.\n• Built reporting workflows that cut review time by 6 hours per week.\n\nEducation\nState University\n\nSkills\nSalesforce, Tableau, SQL`;
  assert.equal(getResumeExtractionWarning(text), null);
});
