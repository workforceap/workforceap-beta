import assert from 'node:assert/strict';
import test from 'node:test';

import { findUnsupportedResumeClaims, hasContradictoryMissingResumeSection } from './validateGeneratedResume';

test('rejects missing-section claims when the extracted original has populated sections', () => {
  const source = `Jane Doe
Experience Operations Manager | Acme Logistics
Managed incoming shipments and trained warehouse staff.
Education MBA | State University
Skills Inventory control, scheduling, and spreadsheet reporting`;

  assert.equal(hasContradictoryMissingResumeSection(source,
    `# Jane Doe\n\n## Experience\nNo employment history was provided in the resume.\n\n## Education\nState University`), true);
  assert.equal(hasContradictoryMissingResumeSection(source,
    `# Jane Doe\n\n## Education\nNo educational background was provided.\n\n## Skills\nInventory control`), true);
  assert.equal(hasContradictoryMissingResumeSection(source,
    `# Jane Doe\n\n## Skills\nNo specific skills were provided in the profile.`), true);
  assert.equal(hasContradictoryMissingResumeSection(source,
    '# Jane Doe\n\nExperience: No employment history was provided.'), true);
  assert.equal(hasContradictoryMissingResumeSection(source,
    '# Jane Doe\n\n## Experience — No employment history was provided.'), true);
  assert.equal(hasContradictoryMissingResumeSection(source,
    '# Jane Doe\n\nEducation: No educational background was provided.'), true);
  assert.equal(hasContradictoryMissingResumeSection(source,
    '# Jane Doe\n\n## Skills — No specific skills were provided.'), true);
});

test('permits sparse source text and ordinary negated prose', () => {
  const sparse = 'Jane Doe\nProfessional Summary\nMotivated applicant seeking a first role in logistics.';
  assert.equal(hasContradictoryMissingResumeSection(sparse,
    '# Jane Doe\n\n## Experience\nNo employment history was provided.'), false);

  const source = 'Jane Doe\nExperience\nOperations coordinator at Acme Logistics since 2021.';
  assert.equal(hasContradictoryMissingResumeSection(source,
    '# Jane Doe\n\n## Experience\nNo gaps in employment history.\nOperations coordinator at Acme Logistics.'), false);
  assert.equal(hasContradictoryMissingResumeSection(source,
    '# Jane Doe\n\n## Experience\nNo Experience Required Trainer at Acme Logistics.'), false);

  const summarySentence = 'Jane Doe\nExperience with Microsoft Word is an asset for this role.';
  assert.equal(hasContradictoryMissingResumeSection(summarySentence,
    '# Jane Doe\n\n## Experience\nNo employment history was provided.'), false);
});

test('does not treat an empty heading followed by another section as experience evidence', () => {
  const source = 'Jane Doe\nExperience\nEducation MBA | State University';
  assert.equal(hasContradictoryMissingResumeSection(source,
    '# Jane Doe\n\n## Experience\nNo employment history was provided.'), false);
});

// Fictional source: page 1 experience and page 2 education of a synthetic PDF.
const FACT_SOURCE = `Avery Quillfeather
Experience
Riverbend Logistics - Warehouse Lead, 2019-23
- Coordinated inbound receiving for a two-shift crew and cut dock wait time 15%
Education
Lakeshore Community College - A.A.S. Industrial Maintenance, 2018
Name: Avery Quillfeather
Education: High School`;

test('findUnsupportedResumeClaims accepts a draft that restates only source facts', () => {
  assert.deepEqual(findUnsupportedResumeClaims(FACT_SOURCE, `# Avery Quillfeather

## Professional Summary
Dependable warehouse lead who coordinates receiving and keeps crews safe. Interested in School Bus Driver roles.

## Experience
**Warehouse Lead** — Riverbend Logistics, Inc., 2019–2023
- Coordinated inbound receiving for a two-shift crew, cutting dock wait time 15 %
- [Riverbend Logistics company site](https://example.test)
Warehouse Lead Riverbend Logistics Inc

## Education
A.A.S. Industrial Maintenance — Lakeshore Community College, 2018
High School Diploma

No gaps in employment history.
References available upon request.`), []);
});

test('findUnsupportedResumeClaims names each kind of invented or filler content', () => {
  const draft = (extra: string) => `# Avery Quillfeather\n\n## Experience\nWarehouse Lead — Riverbend Logistics, 2019–2023\n${extra}`;
  assert.deepEqual(findUnsupportedResumeClaims(FACT_SOURCE, draft('Shift Supervisor — Harborview Freight Inc.')), ['unsupported_organization']);
  assert.deepEqual(findUnsupportedResumeClaims(FACT_SOURCE, draft('Graduate of Northgate Community College')), ['unsupported_organization']);
  assert.deepEqual(findUnsupportedResumeClaims(FACT_SOURCE, draft('Certificate, University of Eastbrook')), ['unsupported_organization']);
  assert.deepEqual(findUnsupportedResumeClaims(FACT_SOURCE, draft('Forklift operator, 2015')), ['unsupported_year']);
  assert.deepEqual(findUnsupportedResumeClaims(FACT_SOURCE, draft('- Raised throughput by 40%')), ['unsupported_metric']);
  assert.deepEqual(findUnsupportedResumeClaims(FACT_SOURCE, draft('- Managed a $2M inventory')), ['unsupported_metric']);
  assert.deepEqual(findUnsupportedResumeClaims(FACT_SOURCE, draft('Supervisor at [Company Name]')), ['placeholder']);
  for (const filler of [
    '## Skills\nNot provided',
    '## Certifications\nNo certifications were provided.',
    '## Education\nNo education history provided',
    'Skills: None',
    'LinkedIn: N/A',
    '## Experience — No employment history was provided.',
  ]) {
    assert.deepEqual(findUnsupportedResumeClaims(FACT_SOURCE, draft(filler)), ['missing_section_filler'], filler);
  }
});
