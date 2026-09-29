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
- Coordinated inbound receiving for a two-shift crew of 12 associates and cut dock wait time 15%
- Reconciled a $1,000 petty-cash float each week
- Certified forklift operator; OSHA 10
Education
Lakeshore Community College - A.A.S. Industrial Maintenance, 2018
Education MBA | State University
Name: Avery Quillfeather
Email: avery.q2019@example.test
Phone: 15126291505
Address: 42 Birch Lane, Springfield, IL 62704
LinkedIn: linkedin.com/in/avery-q-2019
Education: High School`,
  goals: 'Target program: AWS Cloud Practitioner\nProgram category: Information Technology',
};

/**
 * The gate for every check: faithful rewrites of the source above. Each one
 * must pass; a check that cannot pass all of them is narrowed or dropped.
 */
const FAITHFUL_CORPUS: Array<[string, string]> = [
  ['entry, em dash and comma', '## Experience\n**Warehouse Lead** — Riverbend Logistics, Mar 2019–2023'],
  ['entry, "Title at Org"', '## Experience\nWarehouse Lead at Riverbend Logistics | 2019 - 2023'],
  ['entry, "Org — Title"', '## Experience\nRiverbend Logistics — Warehouse Lead (March 2019 – 2023)'],
  ['entry, reordered title words', '## Experience\nLead, Warehouse — Riverbend Logistics, 2019'],
  ['entry, corporate suffix added', '## Experience\nWarehouse Lead, Riverbend Logistics, Inc., 2019–2023'],
  ['entry, title and employer merged', '## Experience\nWarehouse Lead Riverbend Logistics Inc'],
  ['month as number', '## Experience\nWarehouse Lead — Riverbend Logistics, 03/2019 – 2023'],
  ['month with comma', 'Joined Riverbend Logistics in March, 2019.'],
  ['bullet vs prose', 'Warehouse lead at Riverbend Logistics who coordinated inbound receiving for a two-shift crew.'],
  ['headcount as written', '- Coordinated receiving for a crew of 12 associates'],
  ['headcount spelled out', '- Led a team of twelve associates'],
  ['money without separator', '- Reconciled a $1000 petty-cash float weekly'],
  ['percent spelled out', '- Cut dock wait time 15 percent'],
  ['percent with space', '- Cut dock wait time by 15 %'],
  ['degree, comma form', '## Education\nA.A.S. Industrial Maintenance, Lakeshore Community College, 2018'],
  ['degree spelled out with "at"', '## Education\nAssociate of Applied Science in Industrial Maintenance at Lakeshore Community College'],
  ['degree spelled out, "School — Degree"', '## Education\nLakeshore Community College — Associate of Applied Science, Industrial Maintenance (2018)'],
  ['generic associate degree', '## Education\nAssociate degree, Lakeshore Community College'],
  ['"College" without "Community"', '## Education\nAAS, Lakeshore College, 2018'],
  ['MBA, generic-named school', '## Education\nMBA, State University'],
  ['"Attended" generic-named school', '## Education\nAttended State University'],
  ['"Attended" named school', 'Attended Lakeshore Community College.'],
  ['"Graduated from"', 'Graduated from Lakeshore Community College in 2018.'],
  ['high school diploma', '## Education\nHigh School Diploma'],
  ['"Attended High School"', '## Education\nAttended High School'],
  ['certification, "Certified X"', '## Certifications\n- Certified Forklift Operator'],
  ['certification, "X certification"', '## Certifications\n- Forklift certification'],
  ['certification, OSHA hours', '## Certifications\n- OSHA 10-Hour'],
  ['certification, "X certified"', '- OSHA 10 certified'],
  ['phone, parentheses', '(512) 629-1505'],
  ['phone, dashes', 'Phone: 512-629-1505'],
  ['phone, dots', '512.629.1505'],
  ['phone, +1 spaces', '+1 512 629 1505'],
  ['phone, Slack link', '<tel:(512)629-1505|(512) 629-1505>'],
  ['contact header', 'Springfield, IL 62704 | avery.q2019@example.test | linkedin.com/in/avery-q-2019'],
  ['contact url with scheme', '[LinkedIn](https://www.linkedin.com/in/avery-q-2019/)'],
  ['street address', '42 Birch Lane, Springfield, IL 62704'],
  ['target program as a goal', 'Interested in the AWS Cloud Practitioner program.'],
  ['goal: career in target field', 'Seeking an entry-level role in Information Technology.'],
  ['job-title words that look like a school', 'Interested in School Bus Driver roles.'],
  ['negated prose', 'No gaps in employment history.'],
  ['closing line', 'References available upon request.'],
];

test('findUnsupportedResumeClaims accepts every faithful rewrite in the corpus', () => {
  for (const [label, draft] of FAITHFUL_CORPUS) {
    assert.deepEqual(findUnsupportedResumeClaims(FACT_SOURCES, draft), [], label);
  }
  // And all of them together, as one draft.
  assert.deepEqual(findUnsupportedResumeClaims(FACT_SOURCES, FAITHFUL_CORPUS.map(([, draft]) => draft).join('\n\n')), []);
});

test('findUnsupportedResumeClaims accepts grounded prose about a generic-named school', () => {
  const source = 'Jane Doe\nEducation MBA | State University';
  assert.deepEqual(findUnsupportedResumeClaims(source, '# Jane Doe\n\n## Education\nAttended State University'), []);
  assert.deepEqual(findUnsupportedResumeClaims(source, '# Jane Doe\n\nMBA graduate who attended State University.'), []);
});

test('findUnsupportedResumeClaims: "Attended High School" needs high-school evidence in history', () => {
  assert.deepEqual(findUnsupportedResumeClaims('Jane Doe\nEducation: GED, 2015', '## Education\nAttended High School'), []);
  // With no high school, diploma or GED anywhere in history this is invented education.
  assert.deepEqual(
    findUnsupportedResumeClaims('Jane Doe\nExperience\nCashier at Corner Market, 2020', '## Education\nAttended High School'),
    ['unsupported_credential'],
  );
});

test('findUnsupportedResumeClaims rejects each detectable kind of invented or filler content', () => {
  const expectations: Array<[string, string[]]> = [
    ['## Experience\nWarehouse Lead — Harborview Freight, 2019–2023', ['unsupported_entry_detail']],
    ['## Experience\nShift Supervisor — Harborview Freight Inc.', ['unsupported_organization', 'unsupported_entry_detail']],
    ['## Experience\nHarborview Freight | Warehouse Lead | 2019', ['unsupported_entry_detail']],
    ['## Experience\nVice President — Riverbend Logistics, 2019–2023', ['unsupported_entry_detail']],
    ['## Experience\nVice President at Riverbend Logistics, 2019', ['unsupported_entry_detail']],
    ['- Manager at Amazon', ['unsupported_organization']],
    ['Previously worked at Harborview Freight.', ['unsupported_organization']],
    ['- Promoted after training at Northgate Community College', ['unsupported_organization']],
    ['- Studied at Riverbend Community College', ['unsupported_organization']],
    ['- Certificate, University of Eastbrook', ['unsupported_organization']],
    ['## Education\nAssociate of Applied Science, Northgate Technical Institute, 2018', ['unsupported_organization', 'unsupported_entry_detail']],
    ['- Forklift operator since 2015', ['unsupported_date']],
    ['- Started June 2019', ['unsupported_date']],
    ['- Managed 25 staff', ['unsupported_number']],
    ['- Supervised 30 warehouse associates', ['unsupported_number']],
    ['- Raised throughput by 40%', ['unsupported_number']],
    ['- Managed a $2M inventory', ['unsupported_number']],
    ['- Reconciled a $10,000 float', ['unsupported_number']],
    ['Phone: (512) 629-1506', ['unsupported_contact']],
    ['avery@harborview.test', ['unsupported_contact']],
    ['- Supervisor at [Company Name]', ['placeholder']],
  ];
  for (const [draft, expected] of expectations) {
    assert.deepEqual(findUnsupportedResumeClaims(FACT_SOURCES, draft).sort(), [...expected].sort(), draft);
  }
  for (const filler of [
    '## Skills\nNot provided',
    '## Certifications\nNo certifications were provided.',
    '## Education\nNo education history provided',
    'Skills: None',
    'LinkedIn: N/A',
    '## Experience — No employment history was provided.',
  ]) {
    assert.deepEqual(findUnsupportedResumeClaims(FACT_SOURCES, filler), ['missing_section_filler'], filler);
  }
});

test('findUnsupportedResumeClaims rejects degrees and credentials not in history', () => {
  const expectations: Array<[string, string[]]> = [
    ['## Education\nB.S. Industrial Maintenance — Lakeshore Community College, 2018', ['unsupported_credential']],
    ['Holds a Bachelor of Arts degree.', ['unsupported_credential']],
    ['## Certifications\n- CDL Class A', ['unsupported_credential']],
    ['## Certifications\n- Certified Project Manager', ['unsupported_credential']],
    ['- Welding certification', ['unsupported_credential']],
    // The target program is a goal: stating it as earned or as enrollment is rejected ...
    ['## Certifications\n- AWS Certified Cloud Practitioner', ['unsupported_credential']],
    ['AWS Cloud Practitioner certified.', ['unsupported_credential']],
    ['Enrolled in AWS Cloud Practitioner.', ['unsupported_credential']],
    ['Currently pursuing AWS Cloud Practitioner certification.', ['unsupported_credential']],
  ];
  for (const [draft, expected] of expectations) {
    assert.deepEqual(findUnsupportedResumeClaims(FACT_SOURCES, draft).sort(), [...expected].sort(), draft);
  }
  // ... and accepted only when phrased as a goal.
  assert.deepEqual(findUnsupportedResumeClaims(FACT_SOURCES, 'Seeking AWS Cloud Practitioner certification.'), []);
});
