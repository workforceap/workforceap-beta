import assert from 'node:assert/strict';
import test from 'node:test';

import { hasContradictoryMissingResumeSection } from './validateGeneratedResume';

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
