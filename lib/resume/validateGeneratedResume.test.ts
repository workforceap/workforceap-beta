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

// Fictional history: page 1 experience and page 2 education of a synthetic PDF,
// plus profile fields. The target program is a goal and is passed separately.
const FACT_SOURCES = {
  history: `Avery Quillfeather
Experience
Riverbend Logistics - Warehouse Lead, March 2019-23
- Coordinated inbound receiving for a two-shift crew and cut dock wait time 15%
- Reconciled a $1,000 petty-cash float each week
- Certified forklift operator; OSHA 10
Education
Lakeshore Community College - A.A.S. Industrial Maintenance, 2018
Education MBA | State University
Name: Avery Quillfeather
Phone: 555-0142
Education: High School`,
  goals: 'Target program: AWS Cloud Practitioner\nProgram category: Information Technology',
};

const FAITHFUL = `# Avery Quillfeather

## Professional Summary
Dependable warehouse lead who coordinates receiving and keeps crews safe. Interested in School Bus Driver roles.
Pursuing the AWS Cloud Practitioner program.

## Experience
**Warehouse Lead** — Riverbend Logistics, Inc., Mar 2019–2023
- Coordinated inbound receiving for a two-shift crew, cutting dock wait time 15 percent
- Reconciled a $1000 petty-cash float weekly
- Forklift certification and OSHA 10
Warehouse Lead Riverbend Logistics Inc
Warehouse Lead at Riverbend Logistics | 2019 - 2023
- [Riverbend Logistics company site](https://example.test)

## Education
Associate of Applied Science, Industrial Maintenance — Lakeshore Community College, 2018
A.A.S. Industrial Maintenance | Lakeshore Community College
MBA, State University
Attended State University
High School Diploma
Graduated from Lakeshore Community College

No gaps in employment history.
References available upon request.`;

test('findUnsupportedResumeClaims accepts faithful rewrites of source facts', () => {
  assert.deepEqual(findUnsupportedResumeClaims(FACT_SOURCES, FAITHFUL), []);
});

test('findUnsupportedResumeClaims accepts grounded prose about a generic-named school', () => {
  const source = 'Jane Doe\nEducation MBA | State University';
  assert.deepEqual(findUnsupportedResumeClaims(source, '# Jane Doe\n\n## Education\nAttended State University'), []);
  assert.deepEqual(findUnsupportedResumeClaims(source, '# Jane Doe\n\nMBA graduate who attended State University.'), []);
});

test('findUnsupportedResumeClaims: "Attended High School" needs high-school evidence in history', () => {
  assert.deepEqual(findUnsupportedResumeClaims(FACT_SOURCES, '## Education\nAttended High School'), []);
  assert.deepEqual(findUnsupportedResumeClaims('Jane Doe\nEducation: GED, 2015', '## Education\nAttended High School'), []);
  // With no high school, diploma or GED anywhere in history this is invented education.
  assert.deepEqual(
    findUnsupportedResumeClaims('Jane Doe\nExperience\nCashier at Corner Market, 2020', '## Education\nAttended High School'),
    ['unsupported_credential'],
  );
});

test('findUnsupportedResumeClaims names each kind of invented or filler content', () => {
  const draft = (extra: string) => `# Avery Quillfeather\n\n## Experience\nWarehouse Lead — Riverbend Logistics, 2019–2023\n${extra}`;
  const expectations: Array<[string, string[]]> = [
    ['Warehouse Lead — Harborview Freight, 2019–2023', ['unsupported_entry_detail']],
    ['Shift Supervisor — Harborview Freight Inc.', ['unsupported_organization', 'unsupported_entry_detail']],
    ['Harborview Freight | Warehouse Lead | 2019', ['unsupported_entry_detail']],
    ['Vice President — Riverbend Logistics, 2019–2023', ['unsupported_entry_detail']],
    ['Vice President at Riverbend Logistics, 2019', ['unsupported_entry_detail']],
    ['- Manager at Amazon', ['unsupported_organization']],
    ['- Promoted after training at Northgate Community College', ['unsupported_organization']],
    ['- Studied at Riverbend Community College', ['unsupported_organization']],
    ['- Certificate, University of Eastbrook', ['unsupported_organization']],
    ['- Forklift operator since 2015', ['unsupported_date']],
    ['- Started June 2019', ['unsupported_date']],
    ['- Managed 25 staff', ['unsupported_number']],
    ['- Raised throughput by 40%', ['unsupported_number']],
    ['- Managed a $2M inventory', ['unsupported_number']],
    ['- Reconciled a $10,000 float', ['unsupported_number']],
    ['- OSHA 30 trained', ['unsupported_number']],
    ['- Supervisor at [Company Name]', ['placeholder']],
  ];
  for (const [extra, expected] of expectations) {
    assert.deepEqual(findUnsupportedResumeClaims(FACT_SOURCES, draft(extra)).sort(), [...expected].sort(), extra);
  }
  for (const filler of [
    '## Skills\nNot provided',
    '## Certifications\nNo certifications were provided.',
    '## Education\nNo education history provided',
    'Skills: None',
    'LinkedIn: N/A',
    '## Experience — No employment history was provided.',
  ]) {
    assert.deepEqual(findUnsupportedResumeClaims(FACT_SOURCES, draft(filler)), ['missing_section_filler'], filler);
  }
});

test('findUnsupportedResumeClaims rejects altered degrees and credentials not in history', () => {
  const education = (line: string) => `## Education\n${line}`;
  assert.deepEqual(
    findUnsupportedResumeClaims(FACT_SOURCES, education('B.S. Industrial Maintenance — Lakeshore Community College, 2018')),
    ['unsupported_credential', 'unsupported_entry_detail'],
  );
  assert.deepEqual(findUnsupportedResumeClaims(FACT_SOURCES, 'Holds a Bachelor of Arts degree.'), ['unsupported_credential']);
  assert.deepEqual(findUnsupportedResumeClaims(FACT_SOURCES, '## Certifications\n- CDL Class A'), ['unsupported_credential']);
  // The target program is a goal: naming it as earned is rejected ...
  assert.deepEqual(findUnsupportedResumeClaims(FACT_SOURCES, '## Certifications\n- AWS Certified Cloud Practitioner'), ['unsupported_credential']);
  assert.deepEqual(findUnsupportedResumeClaims(FACT_SOURCES, 'AWS Cloud Practitioner certified.'), ['unsupported_credential']);
  // ... and accepted only when phrased as a goal.
  assert.deepEqual(findUnsupportedResumeClaims(FACT_SOURCES, 'Pursuing AWS Cloud Practitioner certification.'), []);
});
