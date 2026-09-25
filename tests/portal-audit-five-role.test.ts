import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  resolvePortalRoleCredentials,
  validateDedicatedPortalCredentials,
} from '../scripts/lib/portal-audit-auth.mjs';
import {
  evaluatePortalPageAfterNavigation,
  isReadOnlyAuditCapabilityActive,
  redactDynamicHrefPath,
  sanitizeAuditDiagnostic,
  sanitizeAuditUrl,
  waitForRedirectTargetCommit,
  waitForVisibleActionTarget,
  waitForPortalReady,
} from '../scripts/lib/portal-audit-browser.mjs';
import { isVerifiedReadOnlyDestination } from '../scripts/lib/portal-audit-environment.mjs';
import {
  applyBlockedWriteFailure,
  classifyReadOnlyAuditRequest,
  redirectDestinationFailureReasons,
  dataRequestQuietWindowSatisfied,
  dynamicRoutePatternMatches,
  evaluateAccessProbe,
  failedAccessProbeDiagnostics,
  fixtureConditionMatches,
  isVerifiedDeniedRedirectWithCanceledGets,
  isBlockedAuditTelemetryRequest,
  isSuppressedAuditSideEffectGetRequest,
  isAllowedReadOnlyNonGetRequest,
  missingRedirectFixtureOutcome,
  navigationTargetMatches,
  redirectTargetMatches,
  resolveRedirectAuditEntry,
  resolveDynamicRouteCandidates,
  summarizeActionCoverage,
  summarizeRedirectCoverage,
} from '../scripts/lib/portal-audit-actions.mjs';
import { classifyPortalAuditRow } from '../scripts/lib/portal-audit-classify.mjs';
import {
  auditPortalRouteInventory,
  comparePortalRouteInventory,
} from '../scripts/lib/portal-audit-inventory.mjs';
import {
  ATTENDED_ACTION_GATES,
  DYNAMIC_PATHS,
  PRODUCTION_CANARY_PATHS,
  PRODUCTION_CANARY_ROLES,
  REDIRECT_ONLY_PATHS,
  REQUIRED_DYNAMIC_PATHS,
  ROLE_ACCESS_ROOTS,
  ROLE_ACCESS_MATRIX,
  SAFE_ACTION_CONTRACTS,
  STATIC_PATHS,
} from '../scripts/lib/portal-audit-paths.mjs';
import {
  normalizePortalAuditMode,
  validatePortalAuditTarget,
} from '../scripts/lib/portal-audit-target.mjs';

const roles = ['member', 'admin', 'employer', 'partner', 'counselor'];

describe('portal navigation readiness', () => {
  it('retries a canceled intermediate redirect until the exact target commits', async () => {
    let attempts = 0;
    const timeouts: number[] = [];
    const page = {
      isClosed: () => false,
      waitForURL: async (matches: (url: URL) => boolean, options: { waitUntil: string; timeout: number }) => {
        attempts += 1;
        expect(options.waitUntil).toBe('commit');
        expect(options.timeout).toBeGreaterThan(0);
        timeouts.push(options.timeout);
        if (attempts === 1) throw new Error('net::ERR_ABORTED; maybe frame was detached?');
        expect(matches(new URL('https://portal.test/dashboard/program'))).toBe(true);
        expect(matches(new URL('https://portal.test/dashboard/other'))).toBe(false);
      },
    };

    await waitForRedirectTargetCommit(
      page,
      (url: URL) => redirectTargetMatches(url.toString(), '/dashboard/program', 'https://portal.test'),
      1_000
    );
    expect(attempts).toBe(2);
    expect(timeouts[1]).toBeLessThanOrEqual(timeouts[0]);
  });

  it('keeps a canceled redirect failure when the target never commits', async () => {
    let attempts = 0;
    const page = {
      isClosed: () => false,
      waitForURL: async () => {
        attempts += 1;
        throw new Error(attempts === 1
          ? 'net::ERR_ABORTED; maybe frame was detached?'
          : 'Timeout waiting for exact redirect target');
      },
    };

    await expect(waitForRedirectTargetCommit(page, () => true, 1_000))
      .rejects.toThrow('Timeout waiting for exact redirect target');
    expect(attempts).toBe(2);
  });

  it('yields between immediate cancellations so a later target commit can arrive', async () => {
    let targetCommitted = false;
    setTimeout(() => { targetCommitted = true; }, 0);
    const page = {
      isClosed: () => false,
      waitForURL: async () => {
        if (!targetCommitted) throw new Error('net::ERR_ABORTED; maybe frame was detached?');
      },
    };

    await waitForRedirectTargetCommit(page, () => true, 1_000);
    expect(targetCommitted).toBe(true);
  });

  it('does not retry a redirect error unrelated to canceled navigation', async () => {
    let attempts = 0;
    const page = {
      isClosed: () => false,
      waitForURL: async () => {
        attempts += 1;
        throw new Error('Navigation failed because page crashed!');
      },
    };

    await expect(waitForRedirectTargetCommit(page, () => true, 1_000))
      .rejects.toThrow('Navigation failed because page crashed!');
    expect(attempts).toBe(1);
  });

  it.each([
    ['employer', 'employer-open-jobs', 'Employer Overview', 'Job Postings'],
    ['partner', 'partner-open-referred-members', 'Partner Overview', 'Referred Members'],
    ['counselor', 'counselor-open-students', 'Today', 'My Members'],
  ] as const)('requires a fresh visible %s action heading while retaining failure gates', async (
    role,
    actionId,
    sourceHeading,
    targetHeading
  ) => {
    const contract = SAFE_ACTION_CONTRACTS[role].find(({ id }) => id === actionId);
    expect(contract?.targetReadySelector).toBe('.portal-page-frame h1:visible');
    let currentHeading: string = sourceHeading;
    let waitOptions: { state: string; timeout: number } | undefined;
    const markerPage = {
      locator: (selector: string) => {
        expect(selector).toBe(contract?.targetReadySelector);
        return {
          filter: ({ hasNotText }: { hasNotText: string }) => ({
            first: () => ({
              waitFor: async (options: { state: string; timeout: number }) => {
                waitOptions = options;
                if (currentHeading.includes(hasNotText)) throw new Error('stale source heading');
              },
            }),
          }),
        };
      },
    };
    expect(await waitForVisibleActionTarget(
      markerPage, contract!.targetReadySelector, sourceHeading, 750
    )).toBe(false);
    currentHeading = targetHeading;
    expect(await waitForVisibleActionTarget(
      markerPage, contract!.targetReadySelector, sourceHeading, 750
    )).toBe(true);
    expect(waitOptions).toEqual({ state: 'visible', timeout: 750 });
    expect(await waitForVisibleActionTarget(markerPage, contract!.targetReadySelector, '', 750)).toBe(false);

    const renderedTarget = {
      exactExpectedPath: true,
      sameOrigin: true,
      documentStatus: 200,
      appReady: true,
      h1Count: 1,
      readOnlyCapabilityActive: true,
      errorFallbackDetected: false,
      consoleErrorCount: 0,
      pageErrorCount: 0,
      otherFailureCount: 0,
    };
    expect(isVerifiedReadOnlyDestination(renderedTarget)).toBe(true);
    expect(isVerifiedReadOnlyDestination({ ...renderedTarget, h1Count: 0 })).toBe(false);
    expect(isVerifiedReadOnlyDestination({ ...renderedTarget, pageErrorCount: 1 })).toBe(false);
    expect(isVerifiedReadOnlyDestination({ ...renderedTarget, otherFailureCount: 1 })).toBe(false);
  });

  function pageWithEvaluation(evaluate: () => Promise<unknown>) {
    let readinessChecks = 0;
    return {
      page: {
        evaluate,
        waitForLoadState: async () => { readinessChecks += 1; },
        locator: () => ({ waitFor: async () => {} }),
        waitForFunction: async () => {},
      },
      readinessChecks: () => readinessChecks,
    };
  }

  it('waits for DOM readiness without an evaluation that can race a redirect', async () => {
    const { page } = pageWithEvaluation(async () => {
      throw new Error('page.evaluate must not be needed for readiness');
    });
    await expect(waitForPortalReady(page)).resolves.toBeUndefined();
  });

  it('retries a page inspection when a full-page redirect replaces its context', async () => {
    let evaluations = 0;
    const { page, readinessChecks } = pageWithEvaluation(async () => {
      evaluations += 1;
      if (evaluations === 1) {
        throw new Error('page.evaluate: Execution context was destroyed, most likely because of a navigation');
      }
      return { ready: true };
    });

    await expect(evaluatePortalPageAfterNavigation(page, () => true)).resolves.toEqual({ ready: true });
    expect(evaluations).toBe(2);
    expect(readinessChecks()).toBe(1);
  });

  it('does not retry unrelated inspection failures or hide repeated navigation', async () => {
    let unrelatedCalls = 0;
    const unrelated = pageWithEvaluation(async () => {
      unrelatedCalls += 1;
      throw new Error('page.evaluate: application failure');
    });
    await expect(evaluatePortalPageAfterNavigation(unrelated.page, () => true)).rejects.toThrow('application failure');
    expect(unrelatedCalls).toBe(1);
    expect(unrelated.readinessChecks()).toBe(0);

    let navigationCalls = 0;
    const repeatedNavigation = pageWithEvaluation(async () => {
      navigationCalls += 1;
      throw new Error('page.evaluate: Execution context was destroyed, most likely because of a navigation');
    });
    await expect(evaluatePortalPageAfterNavigation(repeatedNavigation.page, () => true)).rejects.toThrow('Execution context was destroyed');
    expect(navigationCalls).toBe(3);
    expect(repeatedNavigation.readinessChecks()).toBe(2);
  });
});

function completeEnvironment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    ...Object.fromEntries(
      roles.flatMap((role) => [
        [`E2E_${role.toUpperCase()}_EMAIL`, `${role}@example.test`],
        [`E2E_${role.toUpperCase()}_PASSWORD`, `${role}-secret`],
      ]),
    ),
  };
}

describe('five-role portal audit credentials', () => {
  it('requires a dedicated complete pair for every requested role', () => {
    const result = validateDedicatedPortalCredentials(roles, completeEnvironment());
    expect(result.ok).toBe(true);
    expect(Object.keys(result.credentials)).toEqual(roles);
    expect(result.errors).toEqual([]);
  });

  it('does not silently reuse member credentials for another role', () => {
    const result = validateDedicatedPortalCredentials(['member', 'partner'], {
      NODE_ENV: 'test',
      E2E_MEMBER_EMAIL: 'member@example.test',
      E2E_MEMBER_PASSWORD: 'member-secret',
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual({
      role: 'partner',
      code: 'missing_credentials',
      required: ['E2E_PARTNER_EMAIL', 'E2E_PARTNER_PASSWORD'],
    });
    expect(resolvePortalRoleCredentials('partner', completeEnvironment()).source).toBe('canonical');
  });

  it('rejects one identity reused across two role variables', () => {
    const env = completeEnvironment();
    env.E2E_ADMIN_EMAIL = env.E2E_MEMBER_EMAIL;
    const result = validateDedicatedPortalCredentials(roles, env);
    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual({
      role: 'admin',
      code: 'reused_identity',
      conflictsWith: 'member',
      required: ['E2E_ADMIN_EMAIL', 'E2E_ADMIN_PASSWORD'],
    });
  });
});

describe('portal route inventory gate', () => {
  it('matches every five-role App Router page to the checked-in manifest', () => {
    const result = auditPortalRouteInventory({
      appRoot: join(process.cwd(), 'app'),
      staticPaths: STATIC_PATHS,
      dynamicPaths: DYNAMIC_PATHS,
      redirectOnlyPaths: REDIRECT_ONLY_PATHS,
    });
    expect(result.ok).toBe(true);
    expect(result.sections).toMatchObject({
      member: { discoveredStaticCount: expect.any(Number) },
      admin: { discoveredDynamicCount: expect.any(Number) },
    });
  });

  it('reports missing static and dynamic routes instead of treating them as covered', () => {
    const result = comparePortalRouteInventory({
      discovered: {
        member: { static: ['/dashboard', '/dashboard/new'], dynamic: ['/dashboard/jobs/[id]'] },
      },
      staticPaths: { member: ['/dashboard'] },
      dynamicPaths: { member: [] },
      redirectOnlyPaths: {},
    });
    expect(result.ok).toBe(false);
    expect(result.sections).toMatchObject({
      member: {
        missingStatic: ['/dashboard/new'],
        missingDynamic: ['/dashboard/jobs/[id]'],
      },
    });
  });

  it('inventories intentional redirect pages without browser-auditing them', () => {
    expect(STATIC_PATHS.member).toContain('/dashboard/assessment');
    expect(STATIC_PATHS.member).not.toContain('/dashboard/assessments');
    expect(STATIC_PATHS.partner).not.toContain('/partner/members');
    expect(DYNAMIC_PATHS.partner).not.toContain('/partner/members/[id]');
    expect(REDIRECT_ONLY_PATHS.member).toContainEqual({
      path: '/dashboard/assessments',
      target: '/dashboard/assessment',
      reason: 'legacy_plural_alias',
    });
    expect(REDIRECT_ONLY_PATHS.partner).toContainEqual({
      path: '/partner/members',
      target: '/partner/referred-members',
      reason: 'renamed_route_alias',
    });
    expect(
      Object.values(REDIRECT_ONLY_PATHS)
        .flat()
        .every((entry) => entry.path && entry.target && entry.reason),
    ).toBe(true);
  });

  it('keeps fixture-gated pages out of rendered static coverage and in exact redirect coverage', () => {
    const adminGates = [
      '/admin/audit-logs',
      '/admin/csp-report',
      '/admin/data-retention',
      '/admin/messages',
      '/admin/webhook-events',
    ];
    for (const path of adminGates) {
      expect(STATIC_PATHS.admin).not.toContain(path);
      expect(REDIRECT_ONLY_PATHS.admin).toContainEqual({
        path,
        target: '/admin',
        reason: 'super_admin_only_for_regular_admin_fixture',
        fixtureCondition: 'regular_admin',
      });
      const source = readFileSync(join(process.cwd(), 'app', ...path.slice(1).split('/'), 'page.tsx'), 'utf8');
      expect(source).toContain("redirect('/admin')");
    }
    for (const path of ['/dashboard/program/start', '/dashboard/program/employer-screening']) {
      expect(STATIC_PATHS.member).not.toContain(path);
      expect(REDIRECT_ONLY_PATHS.member).toContainEqual({
        path,
        target: '/dashboard/program',
        reason: 'member_without_active_program_slug',
        fixtureCondition: 'member_without_active_program_slug',
      });
    }
    expect(STATIC_PATHS.member).not.toContain('/dashboard/mentor');
    expect(REDIRECT_ONLY_PATHS.member).toContainEqual({
      path: '/dashboard/mentor',
      target: '/mentor/apply',
      reason: 'member_without_mentor_record',
      fixtureCondition: 'member_without_mentor',
    });
  });

  it('counts redirect-only pages as discovered inventory coverage and rejects overlap', () => {
    const covered = comparePortalRouteInventory({
      discovered: {
        member: { static: ['/dashboard', '/dashboard/legacy'], dynamic: [] },
      },
      staticPaths: { member: ['/dashboard'] },
      dynamicPaths: { member: [] },
      redirectOnlyPaths: {
        member: [{ path: '/dashboard/legacy', target: '/dashboard', reason: 'legacy_alias' }],
      },
    });
    expect((covered.sections as Record<string, any>).member).toMatchObject({
      ok: true,
      auditedStaticCount: 1,
      redirectOnlyStaticCount: 1,
    });

    const overlapped = comparePortalRouteInventory({
      discovered: { member: { static: ['/dashboard'], dynamic: [] } },
      staticPaths: { member: ['/dashboard'] },
      dynamicPaths: { member: [] },
      redirectOnlyPaths: {
        member: [{ path: '/dashboard', target: '/dashboard/home', reason: 'bad_overlap' }],
      },
    });
    expect((overlapped.sections as Record<string, any>).member.overlappingStatic).toEqual([
      '/dashboard',
    ]);
    expect(overlapped.ok).toBe(false);
  });

  it('resolves only visible candidates that are not checked-in static routes', () => {
    expect(
      resolveDynamicRouteCandidates({
        hrefPaths: ['/employer/jobs/new', '/employer/jobs/job-123?view=summary'],
        patterns: ['/employer/jobs/[id]'],
        excludedPaths: ['/employer/jobs/new'],
        sourcePath: '/employer/jobs',
      }),
    ).toEqual([
      {
        pattern: '/employer/jobs/[id]',
        path: '/employer/jobs/job-123?view=summary',
        sourcePath: '/employer/jobs',
        sourceArtifactPath: '/employer/jobs',
      },
    ]);
  });

  it('assigns overlapping paths to the most-specific dynamic template', () => {
    expect(dynamicRoutePatternMatches('/dashboard/[...slug]', '/dashboard/jobs/job-123')).toBe(true);
    expect(
      resolveDynamicRouteCandidates({
        hrefPaths: ['/dashboard/jobs/job-123'],
        patterns: ['/dashboard/[...slug]', '/dashboard/jobs/[id]'],
      })[0]?.pattern,
    ).toBe('/dashboard/jobs/[id]');
  });

  it('preserves the concrete query on a discovered dynamic fixture', () => {
    const [candidate] = resolveDynamicRouteCandidates({
      hrefPaths: ['/employer/jobs/job-123?view=summary'],
      patterns: ['/employer/jobs/[id]'],
    });
    expect(candidate).toMatchObject({
      pattern: '/employer/jobs/[id]',
      path: '/employer/jobs/job-123?view=summary',
    });

    const result = classifyPortalAuditRow({
      role: 'employer',
      viewport: 'desktop',
      path: candidate.pattern,
      expectedPath: '/employer/jobs/[redacted]',
      comparisonExpectedPath: candidate.path,
      comparisonFinalUrl: 'https://preview.example.test/employer/jobs/job-123',
      sectionRoot: '/employer',
      finalUrl: 'https://preview.example.test/employer/jobs/[redacted]',
      originMatched: true,
      queryVariantMatched: false,
      readOnlyCapabilityActive: true,
      title: 'Job',
      bodyText: 'Employer job detail and applicant information.',
      appReady: true,
      documentStatus: 200,
      consoleErrors: [],
      pageErrors: [],
      h1Count: 1,
      horizontalOverflowPx: 0,
      unnamedInteractiveControls: [],
    });

    expect(result.ok).toBe(false);
    expect(result.failureReasons).toContain('query_variant_mismatch');
    expect(result).not.toHaveProperty('comparisonExpectedPath');
  });
});

describe('read-only portal action contracts', () => {
  it('declares safe required coverage and attended exclusions for every role', () => {
    for (const role of roles) {
      const actions = SAFE_ACTION_CONTRACTS[
        role as keyof typeof SAFE_ACTION_CONTRACTS
      ] as Array<{
        kind: string;
        sourcePath: string;
        targetPath?: string;
        targetPattern?: string;
        required?: boolean;
        requiredWhenApplicable?: boolean;
        emptyStateText?: string;
      }>;
      expect(actions.length).toBeGreaterThan(0);
      expect(actions.some((action) => action.required)).toBe(true);
      expect(
        actions.every((action) =>
          ['read_only_navigation', 'read_only_discovered_navigation'].includes(action.kind),
        ),
      ).toBe(true);
      expect(ATTENDED_ACTION_GATES[role as keyof typeof ATTENDED_ACTION_GATES].length).toBeGreaterThan(0);
      for (const action of actions) {
        expect(action.sourcePath.startsWith('/')).toBe(true);
        expect((action.targetPath ?? action.targetPattern)?.startsWith('/')).toBe(true);
        if (action.targetPattern) {
          expect(DYNAMIC_PATHS[role as keyof typeof DYNAMIC_PATHS]).toContain(action.targetPattern);
          expect(action.required || action.requiredWhenApplicable).toBe(true);
          if (action.requiredWhenApplicable) {
            expect(action.emptyStateText).toEqual(expect.any(String));
          }
        }
      }
    }
    expect(REQUIRED_DYNAMIC_PATHS.member).toContain('/dashboard/career-library/[id]');
  });

  it('counts a declared empty state as satisfying only a conditional requirement', () => {
    expect(
      summarizeActionCoverage([
        { required: true, status: 'passed' },
        {
          requiredWhenApplicable: true,
          status: 'not_applicable',
          reason: 'declared_empty_state_verified',
        },
      ]),
    ).toMatchObject({ required: 2, satisfiedRequired: 2, failedRequired: 0 });
    expect(
      summarizeActionCoverage([
        {
          requiredWhenApplicable: true,
          status: 'not_applicable',
          reason: 'no_safe_visible_fixture',
        },
      ]).failedRequired,
    ).toBe(1);
  });

  it('fails a read-only action whenever the page attempts a write request', () => {
    expect(
      applyBlockedWriteFailure(
        {
          status: 'passed',
          reason: 'read_only_anchor_navigation_exercised',
          failureReasons: [],
          blockedWriteRequestCount: 0,
        },
        1,
      ),
    ).toMatchObject({
      status: 'failed',
      reason: 'write_request_blocked',
      failureReasons: ['non_get_request_blocked'],
      blockedWriteRequestCount: 1,
    });
  });

  it('allows only the reviewed resume-render POSTs through the read-only guard', () => {
    expect(
      isAllowedReadOnlyNonGetRequest('POST', '/api/member/resume/docx-html'),
    ).toBe(true);
    expect(
      isAllowedReadOnlyNonGetRequest(
        'POST',
        '/api/counselor/members/member-1/resume/docx-html',
      ),
    ).toBe(true);
    expect(isAllowedReadOnlyNonGetRequest('POST', '/api/member/resume/generate')).toBe(
      false,
    );
    expect(isAllowedReadOnlyNonGetRequest('PATCH', '/api/employer/jobs/job-1')).toBe(
      false,
    );
    expect(isAllowedReadOnlyNonGetRequest('POST', '/api/auth/login')).toBe(false);
    expect(
      isAllowedReadOnlyNonGetRequest('POST', '/api/auth/login', {
        allowAuthentication: true,
      }),
    ).toBe(true);
    expect(isBlockedAuditTelemetryRequest('POST', '/api/events')).toBe(true);
    expect(isBlockedAuditTelemetryRequest('GET', '/api/events')).toBe(false);
    expect(isSuppressedAuditSideEffectGetRequest('GET', '/api/auth/check-mfa-required')).toBe(true);
    expect(isSuppressedAuditSideEffectGetRequest('POST', '/api/auth/check-mfa-required')).toBe(false);
  });

  it('origin-binds every non-GET exception before the browser can continue it', () => {
    const origin = 'https://trusted-preview.example.test';
    expect(
      classifyReadOnlyAuditRequest(
        'POST',
        `${origin}/api/auth/login`,
        origin,
        { allowAuthentication: true },
      ),
    ).toBe('continue');
    expect(
      classifyReadOnlyAuditRequest(
        'POST',
        'https://evil.example.test/api/auth/login',
        origin,
        { allowAuthentication: true },
      ),
    ).toBe('block');
    expect(
      classifyReadOnlyAuditRequest(
        'POST',
        'https://evil.example.test/api/member/resume/docx-html',
        origin,
      ),
    ).toBe('block');
    expect(
      classifyReadOnlyAuditRequest('POST', `${origin}/api/events`, origin),
    ).toBe('suppress_telemetry');
    expect(
      classifyReadOnlyAuditRequest('GET', `${origin}/api/auth/check-mfa-required`, origin),
    ).toBe('suppress_side_effect_get');
    expect(
      classifyReadOnlyAuditRequest(
        'GET',
        'https://evil.example.test/api/auth/check-mfa-required',
        origin,
      ),
    ).toBe('continue');
    expect(classifyReadOnlyAuditRequest('GET', 'https://cdn.example.test/app.js', origin)).toBe(
      'continue',
    );
  });

  it('waits for a fresh quiet window and extends it after delayed data activity', () => {
    expect(
      dataRequestQuietWindowSatisfied({
        inFlightCount: 0,
        lastActivityAt: 100,
        waitStartedAt: 1_000,
        now: 1_299,
      }),
    ).toBe(false);
    expect(
      dataRequestQuietWindowSatisfied({
        inFlightCount: 0,
        lastActivityAt: 1_250,
        waitStartedAt: 1_000,
        now: 1_549,
      }),
    ).toBe(false);
    expect(
      dataRequestQuietWindowSatisfied({
        inFlightCount: 0,
        lastActivityAt: 1_250,
        waitStartedAt: 1_000,
        now: 1_550,
      }),
    ).toBe(true);
    expect(
      dataRequestQuietWindowSatisfied({
        inFlightCount: 1,
        lastActivityAt: 1_000,
        waitStartedAt: 1_000,
        now: 2_000,
      }),
    ).toBe(false);
  });

  it('labels production as a non-staff canary and leaves staff auth attended', () => {
    expect(PRODUCTION_CANARY_ROLES).toEqual(['member', 'employer', 'partner']);
    expect(Object.keys(PRODUCTION_CANARY_PATHS)).toEqual(PRODUCTION_CANARY_ROLES);
    expect(ATTENDED_ACTION_GATES.admin).toContainEqual({
      id: 'admin-production-authentication',
      reason: 'requires_staff_mfa',
    });
    expect(ATTENDED_ACTION_GATES.counselor).toContainEqual({
      id: 'counselor-production-authentication',
      reason: 'requires_staff_mfa',
    });
  });

  it('suppresses the career resource view tracker only for read-only audit requests', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app',
        '(portal)',
        'dashboard',
        'career-library',
        '[id]',
        'page.tsx',
      ),
      'utf8',
    );
    expect(source).toContain('isReadOnlyPortalAuditHeader(requestHeaders)');
    expect(source).toContain('career-library-view-progress-and-download-mutations');
    expect(source).toContain('<ResourceViewTracker resourceId={id} />');
  });

  it('suppresses onboarding and shell polling only inside the authenticated read-only audit', () => {
    const entryClient = readFileSync(
      join(process.cwd(), 'components', 'onboarding', 'PortalEntryClient.tsx'),
      'utf8',
    );
    const workspaceShell = readFileSync(
      join(process.cwd(), 'components', 'portal', 'WorkspaceShell.tsx'),
      'utf8',
    );
    const notificationBell = readFileSync(
      join(process.cwd(), 'components', 'portal', 'NotificationBell.tsx'),
      'utf8',
    );

    expect(entryClient).toContain('!readOnlyAudit && showOnboardingWizard');
    expect(entryClient).toContain('onboarding-persistence-and-tour');
    expect(workspaceShell).toContain('workspace-nav-badges-and-notification-polling');
    expect(workspaceShell).toContain('data-portal-error-state="workspace-nav-badges"');
    expect(notificationBell).toContain('notification-fetch-poll-and-mutations');
    expect(notificationBell).toContain("data-portal-error-state={fetchError ? 'notification-bell-fetch' : undefined}");
  });

  it('marks primary-data fallbacks so empty-looking 200 pages cannot green the audit', () => {
    const sources = [
      ['app', '(portal)', 'dashboard', 'ai-tools', 'history', 'page.tsx'],
      ['app', '(portal)', 'dashboard', 'ai-tools', 'interview-practice', 'page.tsx'],
      ['app', '(portal)', 'dashboard', 'ai-tools', 'training-bridge', 'page.tsx'],
      ['app', '(portal)', 'dashboard', 'career-library', 'page.tsx'],
      ['app', '(portal)', 'dashboard', 'career-library', '[id]', 'page.tsx'],
      ['app', '(portal)', 'dashboard', 'page.tsx'],
      ['app', '(portal)', 'dashboard', 'jobs', 'page.tsx'],
      ['app', '(portal)', 'dashboard', 'profile', 'page.tsx'],
    ];

    for (const relativePath of sources) {
      const source = readFileSync(join(process.cwd(), ...relativePath), 'utf8');
      expect(source, relativePath.join('/')).toContain('data-portal-error-state=');
    }
  });

  it('marks staff and resume/resource secondary-load fallbacks with stable audit states', () => {
    const expectedMarkers: Array<[string[], string]> = [
      [['app', '(portal)', 'dashboard', 'ai-tools', 'resume-studio', 'page.tsx'], 'resume-studio-resume-load'],
      [['app', '(portal)', 'dashboard', 'resources', 'page.tsx'], 'member-resources-personalization-load'],
      [['app', '(portal)', 'partner', 'page.tsx'], 'partner-schema-compatibility-fallback'],
      [['app', '(portal)', 'counselor', 'inbox', 'page.tsx'], 'counselor-inbox-queue-load'],
      [['app', '(portal)', 'counselor', 'students', '[memberId]', 'page.tsx'], 'counselor-member-360-load'],
      [['app', 'admin', 'assessments', 'page.tsx'], 'admin-assessments-average-load'],
      [['app', 'admin', 'career-mappings', 'page.tsx'], 'admin-career-mappings-partner-load'],
      [['app', 'admin', 'counselors', 'page.tsx'], 'admin-counselors-assignment-load'],
      [['app', 'admin', 'employers', 'page.tsx'], 'admin-employers-aggregate-load'],
      [['app', 'admin', 'invites', 'page.tsx'], 'admin-invites-status-load'],
      [['app', 'admin', 'mentors', 'page.tsx'], 'admin-mentors-aggregate-load'],
      [['app', 'admin', 'students', 'page.tsx'], 'admin-students-secondary-load'],
      [['app', 'admin', 'subgroups', 'page.tsx'], 'admin-subgroups-aggregate-load'],
      // The training roster renders on the reporting hub's Training tab now;
      // /admin/training-progress forwards there (admin audit 2026-09-19, §6.1).
      [['app', 'admin', 'reporting', 'sections', 'TrainingSection.tsx'], 'admin-reporting-training-secondary-load'],
    ];

    for (const [relativePath, marker] of expectedMarkers) {
      const source = readFileSync(join(process.cwd(), ...relativePath), 'utf8');
      expect(source, relativePath.join('/')).toContain(marker);
    }
  });

  it('suppresses root analytics, telemetry identity, and service-worker writes during audit', () => {
    const layoutSource = readFileSync(join(process.cwd(), 'app', 'layout.tsx'), 'utf8');
    const chromeSource = readFileSync(
      join(process.cwd(), 'components', 'DeferredRootChrome.tsx'),
      'utf8',
    );
    const sentrySource = readFileSync(join(process.cwd(), 'instrumentation-client.ts'), 'utf8');

    expect(layoutSource).toContain("data-portal-read-only-audit={readOnlyAudit ? '1' : undefined}");
    expect(layoutSource).toContain('GTM_ID && !readOnlyAudit');
    expect(layoutSource).toContain('root-gtm-sentry-utm-and-provider-metrics');
    expect(layoutSource).toContain('root-service-worker-registration');
    expect(layoutSource).toContain('<DeferredRootChrome suppressAnalytics={readOnlyAudit} />');
    expect(chromeSource).toContain('!suppressAnalytics ? <DeferredAnalytics /> : null');
    expect(sentrySource).toContain('isReadOnlyPortalAuditDocument()');
    expect(sentrySource).toContain('beforeSendTransaction(event)');
  });

  it('accepts the audit capability only when middleware and root suppression both agree', () => {
    expect(
      isReadOnlyAuditCapabilityActive({
        readOnlyAuditDocument: true,
        auditSuppressedStates: ['root-gtm-sentry-utm-and-provider-metrics'],
      }),
    ).toBe(true);
    expect(
      isReadOnlyAuditCapabilityActive({
        readOnlyAuditDocument: false,
        auditSuppressedStates: ['root-gtm-sentry-utm-and-provider-metrics'],
      }),
    ).toBe(false);
    expect(
      isReadOnlyAuditCapabilityActive({
        readOnlyAuditDocument: true,
        auditSuppressedStates: [],
      }),
    ).toBe(false);
  });

  it('keeps audited training pages off Coursera OAuth and B4B caches', () => {
    const courseLoader = readFileSync(
      join(process.cwd(), 'lib', 'member', 'loadProgramCourses.ts'),
      'utf8',
    );
    const trainingView = readFileSync(
      join(process.cwd(), 'lib', 'member', 'memberProgramTrainingView.ts'),
      'utf8',
    );
    expect(courseLoader).toContain('const fromB4B = args.readOnlyAudit');
    expect(trainingView).toContain('readOnlyAudit: args.readOnlyAudit');

    for (const relativePath of [
      ['app', '(portal)', 'dashboard', 'program', 'page.tsx'],
      ['app', '(portal)', 'partner', 'referred-members', '[memberId]', 'page.tsx'],
      ['app', '(portal)', 'counselor', 'students', '[memberId]', 'page.tsx'],
    ]) {
      const source = readFileSync(join(process.cwd(), ...relativePath), 'utf8');
      expect(source, relativePath.join('/')).toContain('readOnlyAudit,');
      expect(source, relativePath.join('/')).toContain('coursera-course-resolution');
    }
  });

  it('marks audited role-gate and counselor legacy query failures', () => {
    const partnerGate = readFileSync(
      join(process.cwd(), 'components', 'portal', 'PartnerExclusiveServerGate.tsx'),
      'utf8',
    );
    const counselor = readFileSync(
      join(process.cwd(), 'app', '(portal)', 'counselor', 'overview', 'page.tsx'),
      'utf8',
    );
    expect(partnerGate).toContain('partner-exclusive-role-lookup');
    expect(partnerGate).toContain('if (readOnlyAudit)');
    expect(counselor).toContain('counselor-legacy-command-center-load');
    expect(counselor).toContain('counselor-legacy-priority-queue-load');
  });

  it('makes member-resource catalog fallbacks observable and bypasses cache during audits', () => {
    const catalogSource = readFileSync(
      join(process.cwd(), 'lib', 'content', 'memberResources.ts'),
      'utf8',
    );
    const indexSource = readFileSync(
      join(process.cwd(), 'app', '(portal)', 'dashboard', 'career-library', 'page.tsx'),
      'utf8',
    );
    const detailSource = readFileSync(
      join(
        process.cwd(),
        'app',
        '(portal)',
        'dashboard',
        'career-library',
        '[id]',
        'page.tsx',
      ),
      'utf8',
    );

    expect(catalogSource).toContain('const useCache = !options?.readOnlyAudit');
    expect(catalogSource).toContain('loadFailed: true');
    expect(indexSource).toContain('getMemberResourcesResult({ readOnlyAudit })');
    expect(detailSource).toContain('getMemberResourcesResult({ readOnlyAudit })');
    expect(indexSource).toContain('career-library-resource-catalog-load');
    expect(detailSource).toContain('career-library-resource-catalog-load');
  });

  it('requires explicit healthy denial evidence for cross-role access probes', () => {
    expect(
      evaluateAccessProbe(
        {
          ok: false,
          requestedPathname: '/partner',
          finalPathname: '/partner',
          documentStatus: 200,
          failureReasons: ['missing_h1'],
        },
        'denied',
      ),
    ).toMatchObject({ ok: false, denialEvidence: null });
    expect(
      evaluateAccessProbe(
        {
          ok: false,
          documentStatus: 200,
          wrongRoleRedirect: true,
          unexpectedRedirect: true,
          failureReasons: ['wrong_role_redirect', 'unexpected_redirect', 'missing_h1'],
        },
        'denied',
      ).ok,
    ).toBe(false);
    expect(
      evaluateAccessProbe(
        {
          ok: false,
          documentStatus: 500,
          failureReasons: ['document_error_status', 'route_error_fallback'],
        },
        'denied',
      ).ok,
    ).toBe(false);
    expect(
      evaluateAccessProbe(
        {
          ok: false,
          documentStatus: 200,
          wrongRoleRedirect: true,
          unexpectedRedirect: true,
          failureReasons: ['wrong_role_redirect', 'unexpected_redirect'],
        },
        'denied',
      ),
    ).toMatchObject({ ok: true, denialEvidence: 'safe_redirect_outside_target' });
    expect(
      evaluateAccessProbe(
        {
          ok: false,
          documentStatus: 403,
          failureReasons: ['document_error_status', 'app_not_ready', 'missing_h1'],
        },
        'denied',
      ),
    ).toMatchObject({ ok: true, denialEvidence: 'http_403' });
    expect(
      evaluateAccessProbe(
        {
          ok: false,
          documentStatus: 200,
          wrongRoleRedirect: false,
          unexpectedRedirect: true,
          failureReasons: ['unexpected_redirect'],
        },
        'denied',
      ).ok,
    ).toBe(false);
  });

  it('treats canceled GETs as diagnostic only at a verified denied source-role home', () => {
    const input = {
      path: '/admin',
      expectedPath: '/admin',
      comparisonExpectedPath: '/admin',
      sectionRoot: '/admin',
      finalUrl: 'https://preview.example/dashboard',
      comparisonFinalUrl: 'https://preview.example/dashboard',
      originMatched: true,
      documentStatus: 200,
      title: 'Member Dashboard',
      bodyText: 'Member Dashboard',
      appReady: true,
      readOnlyCapabilityActive: true,
      errorFallbackDetected: false,
      h1Count: 1,
      consoleErrors: [],
      pageErrors: [],
      blockedWriteRequestCount: 0,
      abortedDataRequestCount: 2,
      abortedDataRequests: [
        { method: 'GET', resourceType: 'fetch', prefetch: true, rsc: true },
        { method: 'GET', resourceType: 'fetch', prefetch: false, rsc: false },
      ],
    };
    const candidate = classifyPortalAuditRow(input);
    expect(candidate.failureReasons).toEqual(['wrong_role_redirect', 'unexpected_redirect']);
    expect(evaluateAccessProbe(candidate, 'denied')).toMatchObject({
      ok: true,
      denialEvidence: 'safe_redirect_outside_target',
    });
    expect(isVerifiedDeniedRedirectWithCanceledGets(candidate, 'denied', '/dashboard')).toBe(true);

    // The discount never applies to allowed probes, an arbitrary destination,
    // or a public landing whose separate denial contract permits no portal capability.
    expect(isVerifiedDeniedRedirectWithCanceledGets(candidate, 'allowed', '/dashboard')).toBe(false);
    expect(isVerifiedDeniedRedirectWithCanceledGets(candidate, 'denied', '/partner')).toBe(false);
    expect(isVerifiedDeniedRedirectWithCanceledGets(classifyPortalAuditRow({
      ...input,
      path: '/employer',
      expectedPath: '/employer',
      comparisonExpectedPath: '/employer',
      sectionRoot: '/employer',
      finalUrl: 'https://preview.example/employers',
      comparisonFinalUrl: 'https://preview.example/employers',
      readOnlyCapabilityActive: false,
    }), 'denied', '/employers')).toBe(false);

    for (const override of [
      { originMatched: false },
      { documentStatus: 403 },
      { documentStatus: 500 },
      { appReady: false },
      { h1Count: 0 },
      { h1Count: 2 },
      { errorFallbackDetected: true },
      { bodyText: '404 page not found' },
      { consoleErrors: ['Hydration failed'] },
      { pageErrors: ['Page crashed'] },
      { pageErrors: ['Same-origin data request failed (timeout)'] },
      { blockedWriteRequestCount: 1 },
      { readOnlyCapabilityActive: false },
      { finalUrl: 'https://preview.example/admin', comparisonFinalUrl: 'https://preview.example/admin' },
      { abortedDataRequestCount: 3 },
      { abortedDataRequests: [{ method: 'HEAD', resourceType: 'fetch' }] },
      { abortedDataRequests: [{ method: 'POST', resourceType: 'fetch' }] },
    ]) {
      const unhealthy = classifyPortalAuditRow({ ...input, ...override });
      expect(
        isVerifiedDeniedRedirectWithCanceledGets(unhealthy, 'denied', '/dashboard'),
        JSON.stringify(override),
      ).toBe(false);
    }
  });

  it('uses the rendered counselor landing for role access probes', () => {
    expect(ROLE_ACCESS_ROOTS.counselor).toBe('/counselor/today');
    expect(ROLE_ACCESS_ROOTS.member).toBe('/dashboard');
    expect(ROLE_ACCESS_ROOTS.employer).toBe('/employer');
  });

  it('accepts only exact healthy public landing redirects as cross-role denials', () => {
    const landing = {
      ok: false,
      requestedPathname: '/employer',
      finalPathname: '/employers',
      documentStatus: 200,
      originMatched: true,
      wrongRoleRedirect: true,
      unexpectedRedirect: true,
      appReady: true,
      h1Count: 1,
      routeErrorFallback: false,
      notFoundFallback: false,
      consoleErrorCount: 0,
      pageErrorCount: 0,
      failureReasons: [
        'wrong_role_redirect',
        'unexpected_redirect',
        'read_only_audit_capability_not_active',
      ],
    };
    expect(evaluateAccessProbe(landing, 'denied')).toMatchObject({
      ok: true,
      targetUsable: false,
      denialEvidence: 'exact_public_access_landing',
    });
    expect(evaluateAccessProbe({ ...landing, finalPathname: '/employers/signup' }, 'denied').ok).toBe(false);
    expect(evaluateAccessProbe({
      ...landing,
      finalPathname: '/unexpected-public-page',
      failureReasons: ['wrong_role_redirect', 'unexpected_redirect'],
    }, 'denied').ok).toBe(false);
    expect(evaluateAccessProbe({ ...landing, documentStatus: 500 }, 'denied').ok).toBe(false);
    expect(evaluateAccessProbe({
      ...landing,
      appReady: false,
      h1Count: 0,
      failureReasons: [...landing.failureReasons, 'app_not_ready', 'missing_h1'],
    }, 'denied')).toMatchObject({ ok: false, denialEvidence: null });
    expect(evaluateAccessProbe({ ...landing, originMatched: false }, 'denied').ok).toBe(false);
    expect(evaluateAccessProbe({
      ...landing,
      failureReasons: [...landing.failureReasons, 'page_errors'],
    }, 'denied').ok).toBe(false);
    expect(evaluateAccessProbe({
      ...landing,
      requestedPathname: '/partner',
      finalPathname: '/partners',
    }, 'denied').denialEvidence).toBe('exact_public_access_landing');
    expect(evaluateAccessProbe({
      ...landing,
      requestedPathname: '/dashboard',
      finalPathname: '/dashboard',
      ok: true,
      wrongRoleRedirect: false,
      unexpectedRedirect: false,
      failureReasons: [],
    }, 'denied').ok).toBe(false);
  });

  it('persists bounded fixed browser-error categories only for failed access probes', () => {
    const row = {
      consoleErrors: [
        'Failed to load resource: net::ERR_CONNECTION_RESET https://example.test?access_token=secret',
        'Failed to load resource: net::ERR_CONNECTION_RESET https://example.test?access_token=secret',
        'TypeError: user@example.test',
        'ReferenceError: 512-825-2896',
        'SyntaxError: password=hunter2',
      ],
      pageErrors: [
        'Navigation failed: private-member-slug',
        'Same-origin data request returned HTTP 503 at https://example.test/private',
        'Minified React error #418; visit https://react.dev/errors/418?args[]=HTML&args[]=secret',
      ],
    };
    const diagnostics = failedAccessProbeDiagnostics(row, false);
    expect(diagnostics.consoleErrorCategories).toEqual([
      'resource_load_failure', 'type_error', 'reference_error',
    ]);
    expect(diagnostics.pageErrorCategories).toEqual([
      'navigation_failure', 'same_origin_http_5xx', 'react_hydration',
    ]);
    expect(JSON.stringify(diagnostics)).not.toMatch(/private|secret|user@example|hunter2|512-825/);
    expect(failedAccessProbeDiagnostics(row, true)).toEqual({});
    expect(failedAccessProbeDiagnostics({}, false)).toEqual({
      consoleErrorCategories: [],
      pageErrorCategories: [],
    });
  });

  it('requires the checked-in fixture predicate and a healthy exact redirect', () => {
    expect(fixtureConditionMatches('regular_admin', 'admin', { role: 'admin', superAdmin: false })).toBe(true);
    expect(fixtureConditionMatches('regular_admin', 'admin', { role: 'admin', superAdmin: true })).toBe(false);
    expect(fixtureConditionMatches('member_without_mentor', 'member', { role: 'member', superAdmin: false })).toBe(true);
    expect(fixtureConditionMatches('member_without_active_program_slug', 'member', { role: 'member', superAdmin: false })).toBe(true);
    expect(fixtureConditionMatches('unknown_condition', 'member', { role: 'member', superAdmin: false })).toBe(false);

    const destination = {
      finalUrl: 'https://preview.example.test/admin',
      expectedTarget: '/admin',
      trustedOrigin: 'https://preview.example.test',
      documentStatus: 200,
      inspection: {
        readOnlyCapabilityActive: true,
        appReady: true,
        h1Count: 1,
        errorFallbackDetected: false,
        errorFallbackStates: [],
      },
    };
    expect(redirectDestinationFailureReasons(destination)).toEqual([]);
    // A canceled read prefetch during navigation is diagnostic after the
    // destination passes the same independent health checks as a static route.
    expect(redirectDestinationFailureReasons({ ...destination, abortedDataRequestCount: 1 })).toEqual([]);
    expect(redirectDestinationFailureReasons({ ...destination, documentStatus: 500 })).toContain('redirect_destination_document_not_200');
    expect(redirectDestinationFailureReasons({ ...destination, finalUrl: 'https://preview.example.test/dashboard' })).toContain('redirect_target_mismatch');
    expect(redirectDestinationFailureReasons({ ...destination, dataErrorCount: 1 })).toContain('same_origin_data_request_failed');
    expect(redirectDestinationFailureReasons({ ...destination, blockedWriteRequestCount: 1 })).toContain('non_get_request_blocked');
  });

  it('verifies the public partner sign-up alias by its final form and exact fragment', () => {
    expect(REDIRECT_ONLY_PATHS.partner).toContainEqual({
      path: '/partner/signup',
      target: '/partners#partner-signup',
      reason: 'legacy_alias',
    });
    const destination = {
      finalUrl: 'https://preview.example.test/en/partners#partner-signup',
      expectedTarget: '/partners#partner-signup',
      trustedOrigin: 'https://preview.example.test',
      documentStatus: 200,
      inspection: {
        readOnlyCapabilityActive: false,
        publicPartnerSignupFormPresent: true,
        appReady: true,
        h1Count: 1,
        errorFallbackDetected: false,
        errorFallbackStates: [],
      },
    };
    expect(redirectDestinationFailureReasons(destination)).toEqual([]);
    expect(redirectDestinationFailureReasons({
      ...destination,
      inspection: { ...destination.inspection, publicPartnerSignupFormPresent: false },
    })).toContain('public_partner_signup_form_missing');
    expect(redirectDestinationFailureReasons({
      ...destination,
      finalUrl: 'https://preview.example.test/en/partners',
    })).toContain('redirect_target_mismatch');
    expect(redirectDestinationFailureReasons({
      ...destination,
      finalUrl: 'https://other.example.test/en/partners#partner-signup',
    })).toContain('redirect_target_mismatch');
    expect(redirectDestinationFailureReasons({ ...destination, documentStatus: 500 }))
      .toContain('redirect_destination_document_not_200');
    expect(redirectDestinationFailureReasons({ ...destination, blockedWriteRequestCount: 1 }))
      .toContain('non_get_request_blocked');
  });

  it('does not excuse canceled GETs when a redirect target is unhealthy', () => {
    const destination = {
      finalUrl: 'https://preview.example.test/admin',
      expectedTarget: '/admin',
      trustedOrigin: 'https://preview.example.test',
      documentStatus: 200,
      inspection: {
        readOnlyCapabilityActive: true,
        appReady: true,
        h1Count: 1,
        errorFallbackDetected: false,
        errorFallbackStates: [],
      },
      abortedDataRequestCount: 1,
    };
    for (const unhealthy of [
      { documentStatus: 500, reason: 'redirect_destination_document_not_200' },
      { pageErrorCount: 1, reason: 'page_errors' },
      { consoleErrorCount: 1, reason: 'console_errors' },
      { dataErrorCount: 1, reason: 'same_origin_data_request_failed' },
      { blockedWriteRequestCount: 1, reason: 'non_get_request_blocked' },
      { inspection: { ...destination.inspection, h1Count: 0 }, reason: 'redirect_destination_not_ready' },
      { inspection: { ...destination.inspection, errorFallbackDetected: true }, reason: 'route_error_fallback' },
      { finalUrl: 'https://preview.example.test/partner', reason: 'redirect_target_mismatch' },
    ]) {
      const { reason, ...change } = unhealthy;
      expect(redirectDestinationFailureReasons({ ...destination, ...change })).toEqual(
        expect.arrayContaining([reason, 'same_origin_data_request_failed'])
      );
    }
  });

  it('matches only the resolved concrete target for dynamic navigation', () => {
    const contract = { targetPattern: '/admin/members/[id]' };
    expect(
      navigationTargetMatches(
        '/admin/members/member-a',
        contract,
        '/admin/members/member-a',
      ),
    ).toBe(true);
    expect(
      navigationTargetMatches(
        '/admin/members/member-b',
        contract,
        '/admin/members/member-a',
      ),
    ).toBe(false);
  });

  it('resolves dynamic redirect aliases and verifies exact internal targets', () => {
    const resolved = resolveRedirectAuditEntry(
      {
        path: '/partner/members/[id]',
        target: '/partner/referred-members/[memberId]',
      },
      new Map([
        ['/partner/referred-members/[memberId]', '/partner/referred-members/member-123'],
      ]),
    );
    expect(resolved).toEqual({
      sourcePath: '/partner/members/member-123',
      targetPath: '/partner/referred-members/member-123',
    });
    expect(
      redirectTargetMatches(
        'https://preview.example.test/partner/referred-members/member-123',
        resolved!.targetPath,
        'https://preview.example.test',
      ),
    ).toBe(true);
    expect(
      redirectTargetMatches(
        'https://preview.example.test/partner/referred-members/wrong',
        resolved!.targetPath,
        'https://preview.example.test',
      ),
    ).toBe(false);
    expect(
      redirectTargetMatches(
        'https://evil.example.test/partner/referred-members/member-123',
        resolved!.targetPath,
        'https://preview.example.test',
      ),
    ).toBe(false);
    expect(summarizeRedirectCoverage([{ status: 'passed' }, { status: 'failed' }])).toEqual({
      total: 2,
      passed: 1,
      failed: 1,
      notApplicable: 0,
    });
  });

  it('does not fail an optional dynamic redirect when no safe fixture exists', () => {
    expect(missingRedirectFixtureOutcome('when_discoverable')).toEqual({
      status: 'not_applicable',
      resultReason: 'no_safe_visible_fixture',
      failureReasons: [],
    });
    expect(missingRedirectFixtureOutcome('required')).toEqual({
      status: 'failed',
      resultReason: 'missing_dynamic_redirect_fixture',
      failureReasons: ['missing_dynamic_redirect_fixture'],
    });
    expect(REQUIRED_DYNAMIC_PATHS.partner).not.toContain(
      '/partner/referred-members/[memberId]',
    );
  });

  it('requires redirect query and fragment semantics to match', () => {
    const origin = 'https://preview.example.test';
    expect(
      redirectTargetMatches(
        `${origin}/dashboard/ai-tools?agent=readiness&tab=session`,
        '/dashboard/ai-tools?tab=session&agent=readiness',
        origin,
      ),
    ).toBe(true);
    expect(
      redirectTargetMatches(
        `${origin}/dashboard/profile`,
        '/dashboard/profile#settings',
        origin,
      ),
    ).toBe(false);
  });

  it('expects the training and Coursera stubs to land on My Program, where they redirect', () => {
    for (const path of ['/dashboard/training', '/dashboard/coursera']) {
      expect(REDIRECT_ONLY_PATHS.member).toContainEqual({
        path,
        target: '/dashboard/program',
        reason: 'consolidated_experience',
      });
      const stub = readFileSync(
        join(process.cwd(), 'app', '(portal)', ...path.slice(1).split('/'), 'page.tsx'),
        'utf8',
      );
      expect(stub, path).toMatch(/redirect\('\/dashboard\/program'/);
    }
  });

  it('asserts the final target of the chained readiness legacy redirect', () => {
    expect(REDIRECT_ONLY_PATHS.member).toContainEqual({
      path: '/dashboard/ai-tools/readiness-coach',
      target: '/dashboard/ai-tools?tab=session&agent=readiness',
      reason: 'legacy_alias',
    });
  });

  it('keeps resolved redirect fixture identifiers out of persisted audit code', () => {
    const source = readFileSync(
      join(process.cwd(), 'scripts', 'audit-portal-routes.mjs'),
      'utf8',
    );
    expect(source).not.toContain('resolvedSourcePath: resolved?.sourcePath');
    expect(source).not.toContain('resolvedTargetPath: resolved?.targetPath');
    expect(source).toContain("entry.path.replace(/\\[[^\\]]+\\]/g, '[redacted]')");
  });
});

describe('portal row quality signals', () => {
  it('fails a healthy-looking 200 page that rendered a stable data-load fallback', () => {
    const result = classifyPortalAuditRow({
      role: 'admin',
      viewport: 'desktop',
      path: '/admin/overview',
      expectedPath: '/admin/overview',
      sectionRoot: '/admin',
      finalUrl: 'https://example.test/admin/overview',
      originMatched: true,
      queryVariantMatched: true,
      readOnlyCapabilityActive: true,
      title: 'Admin overview',
      bodyText:
        'Admin overview unavailable There was a problem loading data. This is often temporary. Admin home Jobs',
      appReady: true,
      errorFallbackDetected: true,
      errorFallbackStates: ['admin-data-load'],
      documentStatus: 200,
      consoleErrors: [],
      pageErrors: [],
      h1Count: 1,
      horizontalOverflowPx: 0,
      unnamedInteractiveControls: [],
    });

    expect(result.ok).toBe(false);
    expect(result.routeErrorFallback).toBe(true);
    expect(result.failureReasons).toContain('route_error_fallback');
    expect(result.errorFallbackStates).toEqual(['admin-data-load']);
  });

  it('marks every shared portal error fallback with the stable DOM contract', () => {
    for (const relativePath of [
      ['components', 'admin', 'AdminDataLoadError.tsx'],
      ['components', 'error', 'RouteErrorFallback.tsx'],
      ['components', 'portal', 'PortalRouteFallback.tsx'],
    ]) {
      const source = readFileSync(join(process.cwd(), ...relativePath), 'utf8');
      expect(source).toContain('data-portal-error-state=');
    }
  });

  it('detects wrong-role redirects, overflow, duplicate h1s, and unnamed controls', () => {
    const result = classifyPortalAuditRow({
      role: 'partner',
      sectionRoot: '/partner',
      path: '/partner/settings',
      finalUrl: 'https://example.test/dashboard',
      title: 'Dashboard',
      bodyText: 'Private portal text must not be copied into the artifact',
      documentStatus: 200,
      consoleErrors: [],
      pageErrors: [],
      appReady: true,
      h1Count: 2,
      horizontalOverflowPx: 24,
      unnamedInteractiveControls: [{ tag: 'button', role: null, hrefPath: null }],
    });
    expect(result.failureReasons).toEqual(
      expect.arrayContaining([
        'wrong_role_redirect',
        'unexpected_redirect',
        'horizontal_overflow',
        'multiple_h1',
        'unnamed_interactive_controls',
      ])
    );
    expect(result).not.toHaveProperty('bodyText');
    expect(result).not.toHaveProperty('title');
  });

  it('settles mount-time data requests before taking the classified DOM snapshot', () => {
    const source = readFileSync(
      join(process.cwd(), 'scripts', 'audit-portal-routes.mjs'),
      'utf8',
    );
    const auditRouteStart = source.indexOf('async function auditRoute(');
    const auditRouteEnd = source.indexOf('\nasync function auditViewport(', auditRouteStart);
    const auditRouteSource = source.slice(auditRouteStart, auditRouteEnd);
    const settlement = auditRouteSource.indexOf('await dataRequests.waitForSettlement');
    const inspection = auditRouteSource.indexOf('inspection = await inspectPortalPage', settlement);
    const classification = auditRouteSource.indexOf('const candidateRow = classifyPortalAuditRow', inspection);
    expect(auditRouteStart).toBeGreaterThanOrEqual(0);
    expect(settlement).toBeGreaterThanOrEqual(0);
    expect(inspection).toBeGreaterThan(settlement);
    expect(classification).toBeGreaterThan(inspection);
  });

  it('fails a blank or half-hydrated 200 page', () => {
    const result = classifyPortalAuditRow({
      role: 'member',
      sectionRoot: '/dashboard',
      path: '/dashboard',
      finalUrl: 'https://example.test/dashboard',
      title: '',
      bodyText: '',
      documentStatus: 200,
      consoleErrors: [],
      pageErrors: [],
      appReady: false,
      h1Count: 0,
      horizontalOverflowPx: 0,
      interactiveControlCount: 0,
      unnamedInteractiveControls: [],
    });
    expect(result.ok).toBe(false);
    expect(result.failureReasons).toEqual(
      expect.arrayContaining(['app_not_ready', 'missing_h1']),
    );
  });

  it('redacts credentials, tokens, contact details, identifiers, and URL secrets from diagnostics', () => {
    const diagnostic = sanitizeAuditDiagnostic(
      'Bearer abcdef email=user@example.test phone=512-825-2896 member=550e8400-e29b-41d4-a716-446655440000 ' +
        'https://example.test/admin/members/550e8400-e29b-41d4-a716-446655440000?access_token=secret password=hunter2'
    );
    expect(diagnostic).not.toContain('abcdef');
    expect(diagnostic).not.toContain('user@example.test');
    expect(diagnostic).not.toContain('secret');
    expect(diagnostic).not.toContain('hunter2');
    expect(diagnostic).not.toContain('512-825-2896');
    expect(diagnostic).not.toContain('550e8400-e29b-41d4-a716-446655440000');
    expect(diagnostic).toContain('/admin/members/[redacted]');
  });

  it('redacts identifiers from dynamic unnamed-control hrefs', () => {
    expect(
      redactDynamicHrefPath('/admin/members/550e8400-e29b-41d4-a716-446655440000', [
        '/admin/members/[id]',
      ]),
    ).toBe('/admin/members/[redacted]');
    expect(
      redactDynamicHrefPath('/partner/referred-members/private-member-slug', [
        '/partner/referred-members/[memberId]',
      ]),
    ).toBe('/partner/referred-members/[redacted]');
  });

  it('redacts a dynamic destination without rewriting a reserved static sibling', () => {
    expect(
      sanitizeAuditUrl('https://example.test/admin/members/duplicates'),
    ).toBe('https://example.test/admin/members/duplicates');
    expect(
      sanitizeAuditUrl('https://example.test/admin/members/member-123', [
        '/admin/members/[id]',
      ]),
    ).toBe('https://example.test/admin/members/[redacted]');
    expect(
      sanitizeAuditUrl('https://example.test/admin/members/member-123?access_token=private', [
        '/admin/members/[id]',
      ]),
    ).toBe('https://example.test/admin/members/[redacted]');
  });

  it('classifies a redacted dynamic fixture against its redacted expected path', () => {
    const finalUrl = sanitizeAuditUrl(
      'https://example.test/admin/members/member-slug',
      ['/admin/members/[id]'],
    );
    const result = classifyPortalAuditRow({
      role: 'admin',
      viewport: 'desktop',
      path: '/admin/members/[id]',
      expectedPath: '/admin/members/[redacted]',
      sectionRoot: '/admin',
      finalUrl,
      queryVariantMatched: true,
      readOnlyCapabilityActive: true,
      title: 'Member record',
      bodyText: 'Member record details are available for authorized staff.',
      appReady: true,
      documentStatus: 200,
      consoleErrors: [],
      pageErrors: [],
      h1Count: 1,
      horizontalOverflowPx: 0,
      unnamedInteractiveControls: [],
    });

    expect(result.ok).toBe(true);
    expect(result.unexpectedRedirect).toBe(false);
  });

  it('fails a same-path redirect to an external origin', () => {
    const result = classifyPortalAuditRow({
      role: 'admin',
      viewport: 'desktop',
      path: '/admin',
      expectedPath: '/admin',
      sectionRoot: '/admin',
      finalUrl: 'https://evil.example/admin',
      originMatched: false,
      queryVariantMatched: true,
      title: 'Admin',
      bodyText: 'A convincing but external admin page with enough content.',
      appReady: true,
      documentStatus: 200,
      consoleErrors: [],
      pageErrors: [],
      h1Count: 1,
      horizontalOverflowPx: 0,
      unnamedInteractiveControls: [],
    });
    expect(result.ok).toBe(false);
    expect(result.failureReasons).toContain('external_origin_redirect');
  });

  it('fails a healthy-looking row when the deployment did not accept the audit capability', () => {
    const result = classifyPortalAuditRow({
      role: 'member',
      viewport: 'desktop',
      path: '/dashboard',
      expectedPath: '/dashboard',
      sectionRoot: '/dashboard',
      finalUrl: 'https://preview.example.test/dashboard',
      originMatched: true,
      queryVariantMatched: true,
      readOnlyCapabilityActive: false,
      auditSuppressedStates: [],
      title: 'Dashboard',
      bodyText: 'Member dashboard with training progress and next steps.',
      appReady: true,
      documentStatus: 200,
      consoleErrors: [],
      pageErrors: [],
      h1Count: 1,
      horizontalOverflowPx: 0,
      unnamedInteractiveControls: [],
    });

    expect(result.ok).toBe(false);
    expect(result.failureReasons).toContain('read_only_audit_capability_not_active');
  });

  it('redacts human-readable dynamic slugs inside diagnostics', () => {
    expect(
      sanitizeAuditDiagnostic(
        'Navigation failed at https://example.test/admin/members/jane-doe?tab=resume',
        ['/admin/members/[id]'],
      ),
    ).toBe('Navigation failed at https://example.test/admin/members/[redacted]');
    expect(
      sanitizeAuditDiagnostic('Failed loading /admin/members/jane-doe', [
        '/admin/members/[id]',
      ]),
    ).toBe('Failed loading /admin/members/[redacted]');
    expect(
      sanitizeAuditUrl('https://example.test/dashboard/jobs/member-readable-slug', [
        '/dashboard/[...slug]',
      ]),
    ).toBe('https://example.test/dashboard/[redacted]');
  });

  it('prefers a specific dynamic pattern over the dashboard catch-all', () => {
    const patterns = ['/dashboard/[...slug]', '/dashboard/career-library/[id]'];
    const expectedPath = new URL(
      sanitizeAuditUrl(
        'https://example.test/dashboard/career-library/career-123',
        patterns,
      ),
    ).pathname;
    const wrongFinalUrl = sanitizeAuditUrl(
      'https://example.test/dashboard/jobs',
      patterns,
    );
    expect(expectedPath).toBe('/dashboard/career-library/[redacted]');
    expect(wrongFinalUrl).toBe('https://example.test/dashboard/[redacted]');

    const result = classifyPortalAuditRow({
      role: 'member',
      viewport: 'desktop',
      path: '/dashboard/career-library/[id]',
      expectedPath,
      comparisonExpectedPath: '/dashboard/career-library/career-123',
      sectionRoot: '/dashboard',
      finalUrl: wrongFinalUrl,
      comparisonFinalUrl: 'https://example.test/dashboard/jobs',
      queryVariantMatched: true,
      title: 'Career resource',
      bodyText: 'Career resource details are available for this member.',
      appReady: true,
      documentStatus: 200,
      consoleErrors: [],
      pageErrors: [],
      h1Count: 1,
      horizontalOverflowPx: 0,
      unnamedInteractiveControls: [],
    });
    expect(result.unexpectedRedirect).toBe(true);
    expect(result.ok).toBe(false);
  });

  it('ships a machine-readable result artifact schema', () => {
    const schema = JSON.parse(
      readFileSync(join(process.cwd(), 'docs', 'portal-audit-results.schema.json'), 'utf8')
    );
    expect(schema.$schema).toContain('2020-12');
    expect(schema.required).toEqual(
      expect.arrayContaining([
        'schemaVersion',
        'status',
        'targetValidation',
        'inventory',
        'accessMatrix',
        'roles',
        'summary',
      ])
    );
    expect(schema.properties.schemaVersion.const).toBe('3.5.0');
    expect(schema.required).toContain('attendedGates');
    expect(schema.$defs.roleResult.required).toContain('actionCoverage');
    expect(schema.$defs.roleResult.required).toContain('redirectCoverage');
    expect(schema.$defs.roleAuth.required).toContain('blockedPostLoginWriteRequestCount');
    expect(schema.$defs.roleAuth.required).toContain('suppressedPostLoginSideEffectRequestCount');
    expect(schema.$defs.routeRow.required).toContain('errorFallbackDetected');
    expect(schema.$defs.routeRow.required).toContain('auditSuppressedStates');
    expect(schema.$defs.routeRow.required).toContain('readOnlyCapabilityActive');
    expect(schema.$defs.routeRow.required).toContain('abortedDataRequests');
    expect(schema.$defs.routeRow.required).toContain('pendingDataRequestCount');
    expect(schema.$defs.routeRow.required).toContain('pendingDataRequests');
    expect(schema.$defs.routeRow.required).toContain('blockedWriteRequests');
    expect(schema.$defs.routeRow.properties.abortedDataRequests.maxItems).toBe(10);
    expect(schema.$defs.routeRow.properties.pendingDataRequests.maxItems).toBe(10);
    expect(schema.$defs.pendingDataRequest.additionalProperties).toBe(false);
    expect(schema.$defs.routeRow.properties.blockedWriteRequests.maxItems).toBe(10);
    expect(schema.$defs.routeRow.properties.readOnlyCapabilityActive.type).toBe('boolean');
    expect(schema.$defs.routeRow.required).toContain('suppressedSideEffectRequestCount');
    expect(schema.$defs.accessProbe.required).toContain('targetUsable');
    expect(Object.keys(schema.$defs.accessProbe.properties)).toEqual(expect.arrayContaining([
      'documentStatus',
      'appReady',
      'h1Count',
      'routeErrorFallback',
      'notFoundFallback',
      'readOnlyCapabilityActive',
      'consoleErrorCount',
      'pageErrorCount',
      'durationMs',
    ]));
    expect(schema.$defs.accessProbe.required).toContain('failureReasons');
    expect(schema.$defs.accessProbe.required).toContain('abortedDataRequestCount');
    expect(schema.$defs.accessProbe.required).toContain('pendingDataRequestCount');
    expect(schema.$defs.actionResult.required).toContain('abortedDataRequestCount');
    expect(schema.$defs.actionResult.required).toContain('pendingDataRequestCount');
    expect(schema.$defs.redirectResult.required).toContain('abortedDataRequestCount');
    expect(schema.$defs.redirectResult.required).toContain('pendingDataRequestCount');
    expect(schema.$defs.redirectResult.required).toContain('pageErrors');
    expect(schema.$defs.redirectResult.required).toContain('consoleErrors');
    expect(schema.properties.summary.anyOf[1].required).toContain('abortedDataRequestCount');
    expect(schema.properties.executionPolicy.properties.actions.enum).toContain(
      'root_access_only',
    );
    expect(schema.properties.executionPolicy.required).toContain('evidenceScope');
    expect(schema.properties.executionPolicy.properties.evidenceScope.enum).toContain(
      'production_nonstaff_canary',
    );
    expect(schema.$defs.dynamicRoute.properties.status.enum).toEqual([
      'passed',
      'failed',
      'not_applicable',
    ]);
  });
});

describe('portal target and workflow trust gate', () => {
  it('normalizes audit modes before the crash-safe artifact is initialized', () => {
    expect(normalizePortalAuditMode(' ISOLATED_PREVIEW ')).toBe('isolated_preview');
    expect(normalizePortalAuditMode('garbage')).toBeNull();
    expect(normalizePortalAuditMode(undefined)).toBeNull();
  });

  it('normalizes an unsupported mode to null for a schema-valid blocked artifact', () => {
    expect(
      validatePortalAuditTarget({
        baseURL: 'https://preview.example.test',
        mode: 'garbage',
      }),
    ).toMatchObject({
      ok: false,
      mode: null,
      errors: ['unsupported_audit_mode'],
    });
  });

  it('writes schema-enum-safe mode fields when an unsupported mode is executed', () => {
    const directory = mkdtempSync(join(tmpdir(), 'portal-audit-mode-'));
    const output = join(directory, 'result.json');
    const run = spawnSync(process.execPath, ['scripts/audit-portal-routes.mjs'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORTAL_AUDIT_MODE: 'garbage',
        PLAYWRIGHT_BASE_URL: 'https://preview.example.test',
        PORTAL_AUDIT_OUTPUT: output,
      },
      encoding: 'utf8',
    });

    expect(run.status).toBe(1);
    const result = JSON.parse(readFileSync(output, 'utf8'));
    expect(result.status).toBe('blocked');
    expect(result.targetValidation.mode).toBeNull();
    expect(result.executionPolicy.mode).toBeNull();
    expect(result.executionPolicy.evidenceScope).toBeNull();
  });

  it('accepts only the exact configured preview origin', () => {
    expect(
      validatePortalAuditTarget({
        baseURL: 'https://preview-123.vercel.app',
        mode: 'isolated_preview',
        trustedPreviewOrigin: 'https://preview-123.vercel.app',
      }).ok,
    ).toBe(true);
    expect(
      validatePortalAuditTarget({
        baseURL: 'https://attacker.vercel.app',
        mode: 'isolated_preview',
        trustedPreviewOrigin: 'https://preview-123.vercel.app',
      }),
    ).toMatchObject({ ok: false, errors: ['target_does_not_match_trusted_preview'] });
    expect(
      validatePortalAuditTarget({
        baseURL: 'https://workforceap.org',
        mode: 'isolated_preview',
        trustedPreviewOrigin: 'https://workforceap.org',
      }).errors,
    ).toContain('preview_target_must_not_be_production');
  });

  it('allows only exact WorkforceAP production origins and loopback local targets', () => {
    expect(
      validatePortalAuditTarget({
        baseURL: 'https://workforceap.org',
        mode: 'production_canary',
      }).ok,
    ).toBe(true);
    expect(
      validatePortalAuditTarget({
        baseURL: 'https://workforceap.org.evil.test',
        mode: 'production_canary',
      }).errors,
    ).toContain('production_target_not_allowlisted');
    expect(
      validatePortalAuditTarget({ baseURL: 'http://localhost:3000', mode: 'local' }).ok,
    ).toBe(true);
    expect(
      validatePortalAuditTarget({ baseURL: 'http://192.168.1.2:3000', mode: 'local' }).ok,
    ).toBe(false);
  });

  it('writes a fresh blocked artifact when target trust fails before credentials', () => {
    const directory = mkdtempSync(join(tmpdir(), 'portal-audit-target-'));
    const output = join(directory, 'result.json');
    const run = spawnSync(process.execPath, ['scripts/audit-portal-routes.mjs'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORTAL_AUDIT_MODE: 'isolated_preview',
        PLAYWRIGHT_BASE_URL: 'https://attacker.vercel.app',
        PORTAL_AUDIT_TRUSTED_PREVIEW_ORIGIN: 'https://trusted-preview.vercel.app',
        PORTAL_AUDIT_OUTPUT: output,
        E2E_MEMBER_EMAIL: 'must-not-be-used@example.test',
        E2E_MEMBER_PASSWORD: 'must-not-be-used',
      },
      encoding: 'utf8',
    });
    expect(run.status).toBe(1);
    expect(existsSync(output)).toBe(true);
    const result = JSON.parse(readFileSync(output, 'utf8'));
    expect(result).toMatchObject({
      status: 'blocked',
      baseURL: 'https://attacker.vercel.app',
      targetValidation: {
        ok: false,
        errors: ['target_does_not_match_trusted_preview'],
      },
      credentialValidation: { authenticatedIdentitiesDistinct: null },
    });
    expect(result.completedAt).toEqual(expect.any(String));
  });

  it('pins the credentialed workflow to trusted master and fixed target choices', () => {
    const workflow = readFileSync(
      join(process.cwd(), '.github', 'workflows', 'authenticated-portal-smoke.yml'),
      'utf8',
    );
    expect(workflow).not.toContain('base_url:');
    expect(workflow).toContain("github.ref == 'refs/heads/master'");
    expect(workflow).toContain('${{ secrets.PREVIEW_SITE_URL }}');
    expect(workflow).toContain("if-no-files-found: error");
    expect(workflow).not.toMatch(/\*\.vercel\.app/);
    const productionStep = workflow.slice(workflow.indexOf('Run non-staff production canary'));
    expect(productionStep).toContain('E2E_MEMBER_EMAIL');
    expect(productionStep).not.toContain('E2E_ADMIN_EMAIL');
    expect(productionStep).not.toContain('E2E_COUNSELOR_EMAIL');
    expect(existsSync(join(process.cwd(), 'docs', 'portal-audit-results.json'))).toBe(false);
  });

  it('declares an explicit allowed and denied target set for every role', () => {
    for (const role of roles) {
      const policy = ROLE_ACCESS_MATRIX[role as keyof typeof ROLE_ACCESS_MATRIX];
      expect(policy.allowed).toContain(role);
      expect(new Set([...policy.allowed, ...policy.denied]).size).toBe(roles.length);
      expect(policy.allowed.filter((target) => policy.denied.includes(target))).toEqual([]);
    }
    expect(ROLE_ACCESS_MATRIX.admin.allowed).toContain('counselor');
  });
});
