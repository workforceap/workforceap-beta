import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BROWSER_PHASE_NAMES } from '../scripts/lib/portal-acceptance-lanes.mjs';
import { createPortalBrowserPlan, createPortalPhaseContracts, portalPhaseDynamicRoutes, validateBrowserPhaseInput, PORTAL_PHASE_CONTENT_PATHS, PORTAL_PHASE_FIXED_CONTENT } from '../scripts/lib/portal-browser-plan.mjs';
import { DYNAMIC_PATHS } from '../scripts/lib/portal-audit-paths.mjs';
import { PORTAL_REVIEW_FIXTURES } from '../lib/dev/portalReviewFixtures';
import { resolveWorkforceApModule } from '../lib/content/workforceApModule';
import { listPracticeLabsForAssignment, IT_SUPPORT_LAB_COURSE_SLUG } from '../lib/content/itSupportLabs';

const identity = { runId: '42-1', projectRef: 'esbdrgaonplpvzmtrdhw', organizationId: 'org-42', controlSha: 'a'.repeat(40), deployedSha: 'b'.repeat(40), baselineSha: 'c'.repeat(40), planHash: 'd'.repeat(64) };
const ids = { counselorResult: '00000000-0000-4000-8000-000000000001', enrollment: '00000000-0000-4000-8000-000000000002', mentor: '00000000-0000-4000-8000-000000000003', job: '00000000-0000-4000-8000-000000000004' };
const memberId = '00000000-0000-4000-8000-000000000005';
const phases = BROWSER_PHASE_NAMES.map((name, index) => ({ name, blueprintHash: 'e'.repeat(64), stateDigest: String(index + 1).repeat(64), ids }));
const base = { identity, fixtures: PORTAL_REVIEW_FIXTURES, memberId };
const planFor = (name: string) => createPortalBrowserPlan({ ...base, phase: phases.find(phase => phase.name === name)! });

describe('reviewed browser phase coverage', () => {
  it('keeps hosted phases disabled by default and refuses them in the local companion', () => {
    const input = { phase: phases[0] };
    expect(() => validateBrowserPhaseInput(input)).toThrow('disabled');
    expect(() => validateBrowserPhaseInput(input, { phasesEnabled: true, localFixturesOnly: true })).toThrow('local');
    expect(validateBrowserPhaseInput(input, { phasesEnabled: true })).toEqual(phases[0]);
    expect(validateBrowserPhaseInput({}, { localFixturesOnly: true })).toBeUndefined();
  });

  it('refuses route or approval overrides instead of treating caller flags as proof', () => {
    expect(() => validateBrowserPhaseInput({ phase: phases[0], mentorApproved: true }, { phasesEnabled: true })).toThrow('approval boolean');
    expect(() => validateBrowserPhaseInput({ phase: phases[0], dynamicRoutes: [{ pattern: '/dashboard/jobs/[id]', path: '/dashboard/jobs/foreign' }] }, { phasesEnabled: true })).toThrow('route overrides');
    expect(() => createPortalBrowserPlan({ ...base, phase: phases[0], mentorApproved: true })).toThrow('approval boolean');
    expect(() => createPortalBrowserPlan({ ...base, phase: phases[0], memberId: 'unproven' })).toThrow('member UUID');
  });

  it('covers all seven current dynamic patterns exactly once across fixed phases', () => {
    const bindings = phases.flatMap(portalPhaseDynamicRoutes);
    expect(bindings.map(route => route.pattern).sort()).toEqual(DYNAMIC_PATHS.member.filter(pattern => !pattern.includes('...')).sort());
    expect(new Set(bindings.map(route => route.pattern)).size).toBe(7);
    expect(bindings.some(route => route.path === `/dashboard/counselor/${ids.counselorResult}`)).toBe(true);
    expect(bindings.some(route => route.path === `/dashboard/jobs/${ids.job}`)).toBe(true);
    expect(bindings.some(route => route.path === `/dashboard/mentors/${ids.mentor}`)).toBe(true);
  });

  it('proves absent-assignment and absent-mentor redirects only in unassigned state', () => {
    const unassigned = planFor('unassigned');
    expect(unassigned.cases.filter(item => item.path === '/dashboard/mentor').every(item => item.expectedPath === '/mentor/apply')).toBe(true);
    expect(unassigned.cases.filter(item => item.path === '/dashboard/program/start').every(item => item.expectedPath === '/dashboard/program')).toBe(true);
    expect(unassigned.cases.some(item => item.lane === 'staff-comparison' && item.path === '/admin/members/' + memberId)).toBe(true);
    expect(unassigned.cases.some(item => item.lane === 'inventory-readiness')).toBe(true);
    expect(unassigned.cases.some(item => item.lane === 'logged-out-routes')).toBe(true);
    expect(unassigned.cases.some(item => item.lane === 'mentor-comparison')).toBe(false);
  });

  it('requires assigned positives and all mentor owner comparison states without contradicting redirects', () => {
    const assigned = planFor('assigned-owner');
    for (const path of ['/dashboard/program', '/dashboard/program/start', '/dashboard/learning/labs/ticket-triage', `/dashboard/counselor/${ids.counselorResult}`]) {
      expect(assigned.cases.filter(item => item.path === path)).toHaveLength(2);
      expect(assigned.cases.filter(item => item.path === path).every(item => item.expectedPath === path && !item.missing)).toBe(true);
    }
    expect(assigned.cases.filter(item => item.lane === 'mentor-comparison')).toHaveLength(12);
    expect(assigned.cases.filter(item => item.lane === 'mentor-comparison').every(item => item.expectedPath === '/dashboard/mentor' && !item.missing)).toBe(true);
    expect(assigned.cases.some(item => item.path === '/dashboard/program/employer-screening')).toBe(false);
    expect(assigned.cases.some(item => item.lane === 'staff-comparison')).toBe(false);
  });

  it('requires mentor and job details in the approved profile phase only', () => {
    const approved = planFor('approved-profile');
    expect(approved.cases).toHaveLength(4);
    expect(approved.cases.every(item => item.lane === 'member-routes' && !item.missing && item.expectedPath === item.path)).toBe(true);
    expect(approved.cases.map(item => item.path)).toEqual(expect.arrayContaining([`/dashboard/mentors/${ids.mentor}`, `/dashboard/jobs/${ids.job}`]));
    expect(planFor('unassigned').cases.some(item => item.path === `/dashboard/jobs/${ids.job}`)).toBe(false);
  });

  it('returns required cases for all three phases and independently mapped local fixtures', () => {
    const contract = createPortalPhaseContracts({ ...base, phases });
    expect(contract.contracts.map(item => item.phase!.name)).toEqual(BROWSER_PHASE_NAMES);
    expect(Object.keys(contract.expectedCases).sort()).toEqual(['fixture-render-matrix', 'inventory-readiness', 'logged-out-routes', 'member-routes', 'mentor-comparison', 'staff-comparison']);
    for (const item of contract.contracts) for (const values of Object.values(item.expectedCases)) expect(values.every(id => id.startsWith(`${item.phase!.name}:`))).toBe(true);
    expect(contract.localFixtureCaseIds.length).toBeGreaterThan(0);
    const legacyLocalIds = createPortalBrowserPlan(base).cases.filter(item => item.missing === 'local_development_only_fixture').map(item => item.id);
    expect(contract.localFixtureCaseIds).toEqual(legacyLocalIds.map(id => `unassigned:${id}`));
  });

  it('rejects incomplete or mixed phase plans before deriving a final expected-case contract', () => {
    expect(() => createPortalPhaseContracts({ ...base, phases: phases.slice(0, 2) })).toThrow('three');
    expect(() => createPortalPhaseContracts({ ...base, phases: [phases[0], phases[0], phases[2]] })).toThrow('Duplicate');
    expect(() => createPortalPhaseContracts({ ...base, phases: [phases[0], { ...phases[1], blueprintHash: 'f'.repeat(64) }, phases[2]] })).toThrow('blueprint');
    expect(() => createPortalPhaseContracts({ ...base, phases: [phases[0], { ...phases[1], ids: { ...ids, job: '00000000-0000-4000-8000-000000000099' } }, phases[2]] })).toThrow('reserved IDs');
  });

  it('binds the actual current module and lab resolver contracts, not a plausible but invalid course URL', () => {
    const fixed = PORTAL_PHASE_FIXED_CONTENT;
    expect(resolveWorkforceApModule({ programSlug: fixed.moduleProgram, curriculumVersion: '', courseSlug: fixed.moduleCourse })?.name).toBe('Computer Basics');
    expect(resolveWorkforceApModule({ programSlug: fixed.programSlug, curriculumVersion: fixed.curriculumVersion, courseSlug: IT_SUPPORT_LAB_COURSE_SLUG })).toBeNull();
    const lab = listPracticeLabsForAssignment({ programSlug: fixed.programSlug, curriculumVersion: fixed.curriculumVersion, courseSlug: IT_SUPPORT_LAB_COURSE_SLUG }).find(item => item.id === fixed.labId);
    expect(lab).toMatchObject({ contentVersion: fixed.labContentVersion, rubricVersion: fixed.labRubricVersion });
    expect(portalPhaseDynamicRoutes(phases[1]).find(route => route.pattern.includes('/modules/'))?.path).toBe(`/dashboard/learning/modules/${fixed.moduleCourse}?program=${fixed.moduleProgram}`);
    expect(PORTAL_PHASE_CONTENT_PATHS.every(path => existsSync(path))).toBe(true);
  });
});
