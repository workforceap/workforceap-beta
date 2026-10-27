import { canonical, digest } from './demo-acceptance-journal.mjs';

export const PHASE_NAMES = Object.freeze(['unassigned', 'assigned-owner', 'approved-profile']);
export const PHASE_SCOPES = Object.freeze(['saved-result', 'synthetic-assignment', 'mentor-owner', 'mentor-directory-exposure', 'synthetic-live-job']);
export const PHASE_CONTENT_PATHS = Object.freeze([
  'lib/content/careerBriefs.ts', 'lib/content/memberResources.ts', 'lib/content/programs.ts', 'lib/content/programSlug.ts',
  'lib/content/programCurriculumManifest.ts', 'lib/content/workforceApModule.ts', 'lib/content/itSupportLabs.ts', 'lib/content/courseraDiscoveredCatalog.ts',
  'shared/programSyllabi.ts', 'shared/programCurricula.ts', 'shared/digitalLiteracyPathway.ts', 'lib/member/curriculumAssignment.ts',
  'content/career-brief/2026-03-21-weekly-brief.md', 'content/member-resources/index.json', 'content/member-resources/ats-resume-template.md',
]);
const repository = 'workforceap/workforceap-beta';
const projectRef = 'esbdrgaonplpvzmtrdhw';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SHA = /^[a-f0-9]{40}$/;
const required = (ok, message) => { if (!ok) throw new Error(message); };
function reservedId(context, kind) {
  const hex = digest({ runId: context.runId, organizationId: context.organizationId, controlSha: context.controlSha, kind });
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Fixed synthetic contract. It reserves identities; it grants no permission to create them. */
export function createPhaseBlueprint(context) {
  const { runId, organizationId, controlSha, baselineSha, fixtureAsOf, contentProof } = context;
  required(/^[1-9]\d{0,19}-1$/.test(runId ?? '') && UUID.test(organizationId ?? '') && SHA.test(controlSha ?? '') && SHA.test(baselineSha ?? '') && controlSha !== baselineSha, 'Invalid phase blueprint identity.');
  const at = Date.parse(fixtureAsOf);
  required(Number.isFinite(at) && new Date(at).toISOString() === fixtureAsOf, 'An exact UTC fixture timestamp is required.');
  required(Array.isArray(contentProof) && contentProof.length === PHASE_CONTENT_PATHS.length, 'Both immutable content contracts are required.');
  for (const [index, path] of PHASE_CONTENT_PATHS.entries()) {
    const item = contentProof[index];
    required(canonical(Object.keys(item ?? {}).sort()) === canonical(['baselineBlob', 'candidateBlob', 'path']) && item.path === path && SHA.test(item.baselineBlob) && item.baselineBlob === item.candidateBlob, 'Baseline and candidate content must match the exact reviewed contract.');
  }
  const ids = Object.fromEntries(['counselorResult', 'enrollment', 'mentor', 'job'].map(kind => [kind, reservedId(context, kind)]));
  return {
    schemaVersion: 1, contract: 'portal-synthetic-fixtures-v1', repository, projectRef, runId, organizationId, controlSha, baselineSha, fixtureAsOf,
    ids, contentProof, actorRefs: { member: 'users.member', assigningAdmin: 'users.admin', employer: 'employerId' },
    savedResult: { toolType: 'career_counselor', inputSummary: `Synthetic portal acceptance: ${runId}`, output: `Synthetic career-coaching record for acceptance run ${runId}. Practice identifying a career goal and one next action. No real counseling session or AI generation occurred.` },
    assignment: { programSlug: 'it-support-professional-certificate-ibm', curriculumVersion: 'legacy-v1', isPrimary: true },
    module: { programSlug: 'digital-literacy-empowerment-class', courseSlug: 'digital-literacy-empowerment-class-course-1', requiresEnrollment: false },
    lab: { labId: 'ticket-triage', contentVersion: '2026-09-09.v1', rubricVersion: '2026-09-09.v1', state: 'empty-assigned' },
    mentor: { fullName: `Synthetic acceptance mentor ${runId}`, title: 'Acceptance fixture', company: 'Synthetic DEMO fixture', industry: 'Information technology', bio: 'Synthetic portal acceptance profile. No real mentor service is offered.', availableHours: 0, totalHoursDonated: 0, isActive: false, approvedAt: null, linkedinUrl: null },
    job: { title: `Synthetic acceptance job ${runId}`, description: 'Synthetic QA listing; not a real vacancy. Do not apply.', status: 'live', expiresAt: new Date(at + 4 * 60 * 60_000).toISOString(), sourceUrl: null, requirements: [], preferredCertifications: [], suggestedPrograms: [], applicationsCount: 0 },
    phases: [...PHASE_NAMES], providerActions: false, emailActions: false,
  };
}

export const phaseBlueprintHash = blueprint => digest(blueprint);

export function validatePhaseBlueprint(blueprint, expected) {
  const context = { runId: expected.runId, organizationId: expected.organizationId, controlSha: expected.controlSha, baselineSha: expected.baselineSha,
    fixtureAsOf: blueprint?.fixtureAsOf, contentProof: blueprint?.contentProof };
  required(canonical(blueprint) === canonical(createPhaseBlueprint(context)), 'Phase blueprint differs from the fixed reviewed source contract.');
  required(new Set(Object.values(blueprint.ids)).size === 4, 'Reserved phase IDs must be distinct.');
  return blueprint;
}

/** Only protected-environment data may supply this object; never synthesize an approval. */
export function assertPhaseApproval(approval, blueprint, phase, { now = Date.now() } = {}) {
  validatePhaseBlueprint(blueprint, blueprint);
  required(PHASE_NAMES.includes(phase), 'Unknown synthetic phase.');
  const allowedKeys = ['schemaVersion', 'contract', 'approved', 'blueprintHash', 'repository', 'projectRef', 'runId', 'organizationId', 'controlSha', 'baselineSha', 'reviewer', 'scopes', 'approvedAt', 'expiresAt', 'reference'];
  required(approval && canonical(Object.keys(approval).sort()) === canonical(allowedKeys.sort()), 'Exact explicit phase approval is required.');
  required(approval.schemaVersion === 1 && approval.contract === 'portal-phase-approval-v1' && approval.approved === true && approval.blueprintHash === phaseBlueprintHash(blueprint), 'Approval must bind the exact blueprint digest.');
  for (const key of ['repository', 'projectRef', 'runId', 'organizationId', 'controlSha', 'baselineSha']) required(approval[key] === blueprint[key], `Approval ${key} mismatch.`);
  required(canonical(approval.reviewer) === canonical({ login: 'mabrown040', id: 225406758 }), 'Explicit authorized reviewer required.');
  required(typeof approval.reference === 'string' && /^https:\/\/github\.com\/workforceap\/workforceap-beta\/(?:actions\/runs|issues|pull)\/[1-9]\d*(?:#[A-Za-z0-9-]+)?$/.test(approval.reference), 'A concrete repository approval reference is required.');
  const approved = Date.parse(approval.approvedAt), expires = Date.parse(approval.expiresAt);
  required(Number.isFinite(approved) && Number.isFinite(expires) && approved <= now && expires > now && expires > approved && expires - approved <= 24 * 60 * 60_000 && Date.parse(blueprint.job.expiresAt) > now, 'Approval or bounded synthetic job lifetime is invalid or expired.');
  required(Array.isArray(approval.scopes) && new Set(approval.scopes).size === approval.scopes.length && approval.scopes.every(scope => PHASE_SCOPES.includes(scope)), 'Approval scopes are invalid.');
  const needed = phase === 'unassigned' ? [] : phase === 'assigned-owner' ? PHASE_SCOPES.slice(0, 3) : PHASE_SCOPES;
  required(needed.every(scope => approval.scopes.includes(scope)), 'Explicit approval is missing a required synthetic or exposure scope.');
  return { blueprintHash: phaseBlueprintHash(blueprint), approvalHash: digest(approval), reference: approval.reference, scopes: [...approval.scopes], reviewer: approval.reviewer, approvedAt: approval.approvedAt, expiresAt: approval.expiresAt, checkedAt: new Date(now).toISOString() };
}

export function phaseActivationFromEnvironment(env, blueprint, phase, options) {
  required(env.DEMO_QA_PHASES_ENABLED === 'true', 'Synthetic phases are disabled until explicitly reviewed.');
  let approval;
  try { approval = JSON.parse(env.DEMO_QA_PHASE_APPROVAL ?? ''); } catch { throw new Error('Protected-environment phase approval is missing.'); }
  return assertPhaseApproval(approval, blueprint, phase, options);
}
