import { describe, expect, it } from 'vitest';
import {
  isExcludedPublicEmployerName,
  isExcludedPublicJobTitle,
} from '@/lib/jobs/publicJobFilters';

describe('isExcludedPublicEmployerName', () => {
  it('excludes known sandbox / QA / seed employers (no leak to member board)', () => {
    const excluded = [
      'Test',
      'TEST',
      'Test Students',
      'Capital Area Employer Network',
      'capital area employer network',
      'QA Employer Co',
      'QA Audit Co',
      'Demo Employer',
      'WorkforceAP Example Employer',
      'Test Kitchen Co',
      'QA Automation Labs',
      '  QA Employer Co  ',
    ];
    for (const name of excluded) {
      expect(isExcludedPublicEmployerName(name), name).toBe(true);
    }
  });

  it('does not exclude real partner / hiring employers (no false positives)', () => {
    const allowed = [
      'Contango IT',
      'Workforce Solutions Capital Area',
      'Workforce Solutions Rural Capital Area',
      'Dell Technologies',
      'Austin Regional Clinic',
      'Capital Area Health Partners',
      'Testing Grounds LLC',
      'Quality Assurance Partners',
      '',
      null,
      undefined,
    ];
    for (const name of allowed) {
      expect(isExcludedPublicEmployerName(name), String(name)).toBe(false);
    }
  });
});

describe('isExcludedPublicJobTitle', () => {
  it('excludes QA / test / seed-tagged titles regardless of employer', () => {
    const excluded = [
      '[QA] Software Engineer',
      '[qa] intern',
      '[Test] Data Entry',
      '[TEST] Clerk',
      '[Demo] IT Support Specialist',
      '[demo] Patient Services Representative',
      '[Preview] Administrative Coordinator',
      '[preview] Workforce Trainer',
      '  [QA] Tagged  ',
    ];
    for (const title of excluded) {
      expect(isExcludedPublicJobTitle(title), title).toBe(true);
    }
  });

  it('does not exclude ordinary job titles', () => {
    const allowed = [
      'Software Engineer',
      'QA Lead (not a fixture tag)',
      'Test Automation Engineer',
      'Demo day speaker coordinator',
      'Preview of benefits specialist',
      'IT Support Specialist',
      '',
      null,
      undefined,
    ];
    for (const title of allowed) {
      expect(isExcludedPublicJobTitle(title), String(title)).toBe(false);
    }
  });
});
