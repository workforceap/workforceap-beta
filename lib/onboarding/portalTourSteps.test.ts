import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MEMBER_PORTAL_TOUR_STEPS,
  EMPLOYER_PORTAL_TOUR_STEPS,
  PARTNER_PORTAL_TOUR_STEPS,
} from './portalTourSteps';
import { TOUR_REGISTRY, toTourSteps } from '@/lib/tours/registry';

const SUITES = [
  ['MEMBER_PORTAL_TOUR_STEPS', MEMBER_PORTAL_TOUR_STEPS, 'member.home'],
  ['EMPLOYER_PORTAL_TOUR_STEPS', EMPLOYER_PORTAL_TOUR_STEPS, 'employer.home'],
  ['PARTNER_PORTAL_TOUR_STEPS', PARTNER_PORTAL_TOUR_STEPS, 'partner.home'],
] as const;

for (const [name, steps, key] of SUITES) {
  test(`${name} is an array of valid TourStep objects`, () => {
    assert.ok(Array.isArray(steps), 'Should be an array');
    assert.ok(steps.length > 0, 'Should not be empty');

    for (const step of steps) {
      assert.equal(typeof step.targetId, 'string', 'targetId must be a string');
      assert.equal(typeof step.titleKey, 'string', 'titleKey must be a string');
      assert.equal(typeof step.bodyKey, 'string', 'bodyKey must be a string');
      if (step.placement) {
        assert.ok(
          ['top', 'bottom', 'left', 'right'].includes(step.placement),
          `Invalid placement value: ${step.placement}`
        );
      }
    }
  });

  test(`${name} mirrors the ${key} registry entry`, () => {
    assert.deepEqual(steps, toTourSteps(TOUR_REGISTRY[key]));
  });
}
