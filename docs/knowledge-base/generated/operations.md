# operations: complete file catalog

[All areas](README.md) · [Machine inventory](inventory.json)

| File | Lines | Domain | Exported symbols |
| --- | ---: | --- | --- |
| [scripts/a11y-scan.sh](../../../scripts/a11y-scan.sh) | 94 | operations |  |
| [scripts/analyze-ai-tool-efficacy.ts](../../../scripts/analyze-ai-tool-efficacy.ts) | 44 | operations |  |
| [scripts/apply-preview-approved-curriculum-schema.cjs](../../../scripts/apply-preview-approved-curriculum-schema.cjs) | 132 | operations | EXPECTED_MAPPING_COUNT:126, MIGRATION_NAME:127, executeMigration:128, main:129, validatePreviewTarget:130, verifyPostconditions:131 |
| [scripts/apply-preview-member-lab-schema.cjs](../../../scripts/apply-preview-member-lab-schema.cjs) | 162 | operations | MIGRATION_NAME:162, STATE_KEYS:162, validatePreviewTarget:162, executeMigration:162, readSchemaState:162, normalizeSql:162, loadContract:162, schemaReady:162, schemaAbsent:162, ensurePreviewSchema:162, main:162 |
| [scripts/apply-preview-training-workspace-schema.cjs](../../../scripts/apply-preview-training-workspace-schema.cjs) | 118 | operations | MIGRATION_NAME:118, validatePreviewTarget:118, executeMigration:118, readSchemaState:118, schemaReady:118, ensurePreviewSchema:118, main:118 |
| [scripts/audit-ai-tools-history.js](../../../scripts/audit-ai-tools-history.js) | 93 | operations |  |
| [scripts/audit-cohort.ts](../../../scripts/audit-cohort.ts) | 52 | operations |  |
| [scripts/audit-coursera-links.ts](../../../scripts/audit-coursera-links.ts) | 40 | learning-coursera |  |
| [scripts/audit-graph-check.sh](../../../scripts/audit-graph-check.sh) | 50 | operations |  |
| [scripts/audit-map.mjs](../../../scripts/audit-map.mjs) | 126 | operations |  |
| [scripts/audit-member-pages.mjs](../../../scripts/audit-member-pages.mjs) | 67 | operations |  |
| [scripts/audit-portal-routes.mjs](../../../scripts/audit-portal-routes.mjs) | 1552 | operations |  |
| [scripts/audit-rank.mjs](../../../scripts/audit-rank.mjs) | 113 | operations |  |
| [scripts/audit-tenant-scoping.cjs](../../../scripts/audit-tenant-scoping.cjs) | 258 | operations |  |
| [scripts/auto-sync-master.ps1](../../../scripts/auto-sync-master.ps1) | 123 | operations |  |
| [scripts/backfill-coursera-courseids.cjs](../../../scripts/backfill-coursera-courseids.cjs) | 381 | learning-coursera | scanProgramsFromSource:374 |
| [scripts/backfill-courses.ts](../../../scripts/backfill-courses.ts) | 82 | operations |  |
| [scripts/backfill-unanswered-member-message-notifications.ts](../../../scripts/backfill-unanswered-member-message-notifications.ts) | 45 | communications |  |
| [scripts/canonicalize-course-progress-slugs.test.ts](../../../scripts/canonicalize-course-progress-slugs.test.ts) | 67 | operations |  |
| [scripts/canonicalize-course-progress-slugs.ts](../../../scripts/canonicalize-course-progress-slugs.ts) | 339 | operations | mergeCourseProgressCollision:72 |
| [scripts/capture-roster-after-screenshots.mjs](../../../scripts/capture-roster-after-screenshots.mjs) | 85 | operations |  |
| [scripts/check-b4b-programs.ts](../../../scripts/check-b4b-programs.ts) | 32 | operations |  |
| [scripts/check-duplicate-migrations.mjs](../../../scripts/check-duplicate-migrations.mjs) | 134 | operations |  |
| [scripts/check-duplicate-migrations.test.cjs](../../../scripts/check-duplicate-migrations.test.cjs) | 252 | operations |  |
| [scripts/check-mabrown040.js](../../../scripts/check-mabrown040.js) | 31 | operations |  |
| [scripts/check-supabase-env.mjs](../../../scripts/check-supabase-env.mjs) | 108 | operations |  |
| [scripts/clawpatch-pre-push.sh](../../../scripts/clawpatch-pre-push.sh) | 50 | operations |  |
| [scripts/cleanup-fixtures.ts](../../../scripts/cleanup-fixtures.ts) | 46 | operations |  |
| [scripts/coursera-integration-test.ts](../../../scripts/coursera-integration-test.ts) | 605 | learning-coursera |  |
| [scripts/coursera/generate-curated-collections.ts](../../../scripts/coursera/generate-curated-collections.ts) | 84 | learning-coursera |  |
| [scripts/coursera/ingest-enterprise-export-zips.ts](../../../scripts/coursera/ingest-enterprise-export-zips.ts) | 270 | learning-coursera |  |
| [scripts/coursera/sync-discovered-from-curated.ts](../../../scripts/coursera/sync-discovered-from-curated.ts) | 137 | learning-coursera |  |
| [scripts/crabbox-gate.sh](../../../scripts/crabbox-gate.sh) | 6 | operations |  |
| [scripts/create-chs-partner.ts](../../../scripts/create-chs-partner.ts) | 311 | operations |  |
| [scripts/create-employer-michael-brown.ts](../../../scripts/create-employer-michael-brown.ts) | 165 | operations |  |
| [scripts/cronq.ts](../../../scripts/cronq.ts) | 19 | operations |  |
| [scripts/elevenlabs/agent-patch-utils.mjs](../../../scripts/elevenlabs/agent-patch-utils.mjs) | 196 | ai-voice | findAgentPatchMismatches:99, agentPatchMatches:119, expectedAgentAfterPatch:129, preserveUnspecifiedAgentPlaceholders:139, findAgentTemplateVariableIssues:152, findAgentPostPatchDrift:174, findAgentPreimageDrift:186, isSupportedAgentPatch:193 |
| [scripts/elevenlabs/agent-security-policy.mjs](../../../scripts/elevenlabs/agent-security-policy.mjs) | 114 | ai-voice | REVIEWED_VOICE_AGENT_IDS:5, DISABLED_CLIENT_OVERRIDES:16, VOICE_AGENT_SAFETY_POLICY:49, findVoiceAgentSecurityIssues:87 |
| [scripts/elevenlabs/apply-agent-patches.mjs](../../../scripts/elevenlabs/apply-agent-patches.mjs) | 371 | ai-voice | REQUEST_TIMEOUT_MS:32, GOVERNED_LILLEY_AGENT_ID:33, applyAgentPatch:122, runCli:296 |
| [scripts/elevenlabs/member-agent-tool-sync-utils.mjs](../../../scripts/elevenlabs/member-agent-tool-sync-utils.mjs) | 562 | ai-voice | validateMemberAgentToolManifest:35, buildMemberAgentWebhookToolConfig:83, findPartialMismatches:112, findMemberAgentToolSecurityIssues:153, buildConversationConfigWithToolIds:305, findAgentToolAttachmentMutationIssues:317, findMemberAgentCapabilityIssues:428, indexGovernedTools:526, assertGovernedToolOwnership:544, assertMemberAgentOwnership:556 |
| [scripts/elevenlabs/patches/agent_1101kqfjfm8retm8j6md467wzxdb.patch.json](../../../scripts/elevenlabs/patches/agent_1101kqfjfm8retm8j6md467wzxdb.patch.json) | 86 | ai-voice |  |
| [scripts/elevenlabs/patches/agent_3701kqfjfxxjfm88pgh40h2ca4bs.patch.json](../../../scripts/elevenlabs/patches/agent_3701kqfjfxxjfm88pgh40h2ca4bs.patch.json) | 76 | ai-voice |  |
| [scripts/elevenlabs/patches/agent_4601kqfjaz5rf09bya66s9gg1wvc.patch.json](../../../scripts/elevenlabs/patches/agent_4601kqfjaz5rf09bya66s9gg1wvc.patch.json) | 84 | ai-voice |  |
| [scripts/elevenlabs/patches/agent_5701kqfjg48rf30a8a0gehze8war.patch.json](../../../scripts/elevenlabs/patches/agent_5701kqfjg48rf30a8a0gehze8war.patch.json) | 78 | ai-voice |  |
| [scripts/elevenlabs/patches/agent_6301kqfjfpexew9bnd64vs8nr7ak.patch.json](../../../scripts/elevenlabs/patches/agent_6301kqfjfpexew9bnd64vs8nr7ak.patch.json) | 76 | ai-voice |  |
| [scripts/elevenlabs/patches/agent_7801kqfjg0qwfy68btrqh6jg87kf.patch.json](../../../scripts/elevenlabs/patches/agent_7801kqfjg0qwfy68btrqh6jg87kf.patch.json) | 88 | ai-voice |  |
| [scripts/elevenlabs/patches/agent_9101kqfjg2z8ew5r3ad4fz6323yr.patch.json](../../../scripts/elevenlabs/patches/agent_9101kqfjg2z8ew5r3ad4fz6323yr.patch.json) | 86 | ai-voice |  |
| [scripts/elevenlabs/patches/agent_9201kqfjfrkyex086d2cb706xsb0.patch.json](../../../scripts/elevenlabs/patches/agent_9201kqfjfrkyex086d2cb706xsb0.patch.json) | 79 | ai-voice |  |
| [scripts/elevenlabs/patches/archive/README.md](../../../scripts/elevenlabs/patches/archive/README.md) | 6 | ai-voice |  |
| [scripts/elevenlabs/patches/archive/agent_0001knv003k3ffkb8e13xvzbyxh7.patch.json](../../../scripts/elevenlabs/patches/archive/agent_0001knv003k3ffkb8e13xvzbyxh7.patch.json) | 10 | ai-voice |  |
| [scripts/elevenlabs/state/workforceap-elevenlabs-migration-2026-04-30.json](../../../scripts/elevenlabs/state/workforceap-elevenlabs-migration-2026-04-30.json) | 85 | ai-voice |  |
| [scripts/elevenlabs/state/workforceap-elevenlabs-old-source-recovery-2026-04-30.json](../../../scripts/elevenlabs/state/workforceap-elevenlabs-old-source-recovery-2026-04-30.json) | 3629 | ai-voice |  |
| [scripts/elevenlabs/sync-member-agent-tools.mjs](../../../scripts/elevenlabs/sync-member-agent-tools.mjs) | 885 | ai-voice | ProviderReconciliationError:41, requireReviewedBranchId:91, buildReviewedAgentPath:101, assertReviewedAgentBranch:107, normalizeExpandedAgentTools:121, createProviderClient:144, readCompleteToolDependencies:231, assertToolDependencyBoundary:277, rollbackGovernedToolMutations:455, reconcileGovernedToolMutation:622, attachGovernedToolsWithReconciliation:662, runMemberAgentToolSync:768 |
| [scripts/elevenlabs/voice-agent-security-scenarios.json](../../../scripts/elevenlabs/voice-agent-security-scenarios.json) | 76 | ai-voice |  |
| [scripts/ensure-prisma-env.cjs](../../../scripts/ensure-prisma-env.cjs) | 35 | operations |  |
| [scripts/extract-material-symbol-glyphs.mjs](../../../scripts/extract-material-symbol-glyphs.mjs) | 162 | operations |  |
| [scripts/fix-michael-brown-login.ts](../../../scripts/fix-michael-brown-login.ts) | 209 | operations |  |
| [scripts/fixtures/rippling-portal-chrome-scrape.txt](../../../scripts/fixtures/rippling-portal-chrome-scrape.txt) | 28 | operations |  |
| [scripts/generate-api-docs-data.ts](../../../scripts/generate-api-docs-data.ts) | 183 | operations |  |
| [scripts/generate-quarterly-outcomes.ts](../../../scripts/generate-quarterly-outcomes.ts) | 87 | operations |  |
| [scripts/install-crabbox-hook.sh](../../../scripts/install-crabbox-hook.sh) | 24 | operations |  |
| [scripts/invite-chs-partner-admin.ts](../../../scripts/invite-chs-partner-admin.ts) | 124 | operations |  |
| [scripts/knowledge-index.mjs](../../../scripts/knowledge-index.mjs) | 635 | operations | areaFor:53, domainFor:65, inspectSource:90, resolveReference:183, routeFor:198, inspectPrisma:233, sourceLink:264, matchesDeclaredGlob:308, inspectTestRunners:335, declaredTestOwnership:392, buildIndex:426, main:602 |
| [scripts/knowledge-index.test.mjs](../../../scripts/knowledge-index.test.mjs) | 287 | operations |  |
| [scripts/knowledge-links.py](../../../scripts/knowledge-links.py) | 227 | operations |  |
| [scripts/knowledge-links.test.py](../../../scripts/knowledge-links.test.py) | 134 | operations |  |
| [scripts/knowledge-query.mjs](../../../scripts/knowledge-query.mjs) | 111 | operations | parseQueryArgs:11, queryIndex:40, main:98 |
| [scripts/launch-hardening-audit.mjs](../../../scripts/launch-hardening-audit.mjs) | 264 | operations |  |
| [scripts/lib/coursera-catalog-backfill.cjs](../../../scripts/lib/coursera-catalog-backfill.cjs) | 210 | learning-coursera | stripContentPrefix:203, toSlug:204, indexB4BContents:205, matchCourse:206, resolveProgramCourses:207, isPlaceholderCourseId:208, applyResolutionsToSource:209 |
| [scripts/lib/member-lab-schema-contract.json](../../../scripts/lib/member-lab-schema-contract.json) | 770 | operations |  |
| [scripts/lib/portal-audit-actions.mjs](../../../scripts/lib/portal-audit-actions.mjs) | 391 | operations | dynamicRoutePatternMatches:38, resolveDynamicRouteCandidates:85, navigationTargetMatches:125, resolveRedirectAuditEntry:146, redirectTargetMatches:198, summarizeRedirectCoverage:213, missingRedirectFixtureOutcome:228, summarizeActionCoverage:243, applyBlockedWriteFailure:266, isAllowedReadOnlyNonGetRequest:282, isBlockedAuditTelemetryRequest:293, isSuppressedAuditSideEffectGetRequest:306, classifyReadOnlyAuditRequest:318, dataRequestQuietWindowSatisfied:349, evaluateAccessProbe:363 |
| [scripts/lib/portal-audit-auth.mjs](../../../scripts/lib/portal-audit-auth.mjs) | 157 | operations | PORTAL_AUDIT_ROLES:7, loadPortalAuditEnvFile:36, resolveMemberPortalCredentials:58, hasMemberPortalCredentials:89, resolvePortalRoleCredentials:98, validateDedicatedPortalCredentials:116 |
| [scripts/lib/portal-audit-browser.mjs](../../../scripts/lib/portal-audit-browser.mjs) | 261 | operations | PORTAL_AUDIT_VIEWPORTS:1, PORTAL_AUDIT_NAVIGATION_TIMEOUT_MS:6, PORTAL_AUDIT_READY_TIMEOUT_MS:7, READ_ONLY_AUDIT_ROOT_SUPPRESSION_MARKER:8, isReadOnlyAuditCapabilityActive:11, sanitizeAuditUrl:19, sanitizeAuditDiagnostic:31, redactDynamicHrefPath:91, waitForPortalReady:131, inspectPortalPage:155, pendingDynamicRoutes:255 |
| [scripts/lib/portal-audit-classify.mjs](../../../scripts/lib/portal-audit-classify.mjs) | 152 | operations | canonicalPathname:27, classifyPortalAuditRow:46 |
| [scripts/lib/portal-audit-health-gate.mjs](../../../scripts/lib/portal-audit-health-gate.mjs) | 278 | operations | HEALTH_PATH:28, DEFAULT_HEALTH_GATE_TIMEOUT_MS:29, DEFAULT_HEALTH_GATE_INTERVAL_MS:30, HEALTH_REQUEST_TIMEOUT_MS:31, MIN_VERSION_LENGTH:32, normalizeOriginInput:39, expectedSupabaseRefForMode:45, resolveHealthGateTarget:57, normalizeTrustedSha:66, evaluateHealthPayload:85, formatHealthGateAttempt:158, describeHealthGateFailure:183, waitForTrustedHealth:222, formatPortalAuditTargetErrors:278 |
| [scripts/lib/portal-audit-inventory.mjs](../../../scripts/lib/portal-audit-inventory.mjs) | 237 | operations | PORTAL_ROLE_PREFIXES:4, routeFromPageFile:52, discoverPortalPageRoutes:64, comparePortalRouteInventory:127, formatPortalRouteInventoryDrift:203, auditPortalRouteInventory:225 |
| [scripts/lib/portal-audit-paths.mjs](../../../scripts/lib/portal-audit-paths.mjs) | 543 | operations | STATIC_PATHS:12, DYNAMIC_PATHS:202, REQUIRED_DYNAMIC_PATHS:244, SAFE_ACTION_CONTRACTS:257, ATTENDED_ACTION_GATES:352, REDIRECT_ONLY_PATHS:382, PRODUCTION_CANARY_PATHS:500, PRODUCTION_CANARY_ROLES:506, SECTION_LOGIN_REDIRECT:510, ROLE_ACCESS_MATRIX:522 |
| [scripts/lib/portal-audit-target.mjs](../../../scripts/lib/portal-audit-target.mjs) | 104 | operations | PORTAL_AUDIT_MODES:1, PRODUCTION_PORTAL_ORIGINS:7, normalizePortalAuditMode:13, validatePortalAuditTarget:47, formatPortalAuditTargetErrors:102 |
| [scripts/lib/portal-hub-smoke-paths.mjs](../../../scripts/lib/portal-hub-smoke-paths.mjs) | 46 | operations | PORTAL_HUB_SMOKE_ROLES:8, PORTAL_HUB_SMOKE_PATHS:15, isPortalHubSmokePath:41 |
| [scripts/lib/portal-qa-guard.cjs](../../../scripts/lib/portal-qa-guard.cjs) | 49 | operations | QA_ROLES:49, readPortalQaConfig:49, assertPortalQaOrganization:49 |
| [scripts/lib/portal-qa-guard.test.cjs](../../../scripts/lib/portal-qa-guard.test.cjs) | 59 | operations |  |
| [scripts/lib/prisma-resolve-benign.cjs](../../../scripts/lib/prisma-resolve-benign.cjs) | 36 | operations | isBenignMigrateResolveError:36 |
| [scripts/lib/runtime-pool-contract.cjs](../../../scripts/lib/runtime-pool-contract.cjs) | 35 | operations | inspectRuntimePoolContract:35 |
| [scripts/lib/runtime-pool-contract.test.cjs](../../../scripts/lib/runtime-pool-contract.test.cjs) | 67 | operations |  |
| [scripts/lib/supabase-project-guard.cjs](../../../scripts/lib/supabase-project-guard.cjs) | 261 | operations | DEMO_REF:253, PROD_REF:254, assertSupabaseEnvironment:255, expectedProjectForVercelEnv:256, formatSupabaseEnvGuardFailure:257, inspectSupabaseEnvironment:258, projectForAnonKey:259, projectForUrl:260 |
| [scripts/lint/check-coursera-catalog-placeholders.mjs](../../../scripts/lint/check-coursera-catalog-placeholders.mjs) | 204 | learning-coursera |  |
| [scripts/lint/check-type-floor.mjs](../../../scripts/lint/check-type-floor.mjs) | 302 | operations | FLOOR_PX:39, FLOOR_REM:41, ALLOW_MARKER:42, SCAN_ROOTS:45, SCAN_EXTENSIONS:46, toPx:67, scanSource:172, listSourceFiles:217, runCheck:251 |
| [scripts/lint/check-type-floor.test.cjs](../../../scripts/lint/check-type-floor.test.cjs) | 90 | operations |  |
| [scripts/lint/verify-no-retired-groq-models.mjs](../../../scripts/lint/verify-no-retired-groq-models.mjs) | 81 | operations |  |
| [scripts/locked-stakes/check-i18n-safe-diff.mjs](../../../scripts/locked-stakes/check-i18n-safe-diff.mjs) | 296 | operations | checkI18nSafeDiff:225 |
| [scripts/material-symbol-glyphs.txt](../../../scripts/material-symbol-glyphs.txt) | 217 | operations |  |
| [scripts/migrate-metadata-async.mjs](../../../scripts/migrate-metadata-async.mjs) | 80 | operations |  |
| [scripts/migration-collision-baseline.json](../../../scripts/migration-collision-baseline.json) | 137 | operations |  |
| [scripts/p1/test-force-rls.ts](../../../scripts/p1/test-force-rls.ts) | 1126 | operations |  |
| [scripts/portal-audit-health-gate.mjs](../../../scripts/portal-audit-health-gate.mjs) | 87 | operations |  |
| [scripts/portal-screenshots.mjs](../../../scripts/portal-screenshots.mjs) | 291 | operations |  |
| [scripts/precreate-coursera-tenant-indexes.ts](../../../scripts/precreate-coursera-tenant-indexes.ts) | 225 | learning-coursera |  |
| [scripts/prisma-env.js](../../../scripts/prisma-env.js) | 75 | operations |  |
| [scripts/prisma-resolve-benign.test.cjs](../../../scripts/prisma-resolve-benign.test.cjs) | 43 | operations |  |
| [scripts/prod-paid-funnel-smoke.mjs](../../../scripts/prod-paid-funnel-smoke.mjs) | 176 | operations |  |
| [scripts/prove-b4b-identity-link.ts](../../../scripts/prove-b4b-identity-link.ts) | 173 | operations |  |
| [scripts/resolve-failed-migration-in-db.cjs](../../../scripts/resolve-failed-migration-in-db.cjs) | 72 | operations |  |
| [scripts/resolve-failed-migration.cjs](../../../scripts/resolve-failed-migration.cjs) | 74 | operations |  |
| [scripts/resolve-migration.mjs](../../../scripts/resolve-migration.mjs) | 49 | operations |  |
| [scripts/run-codex-agents.sh](../../../scripts/run-codex-agents.sh) | 52 | operations |  |
| [scripts/run-db-contract-tests.mjs](../../../scripts/run-db-contract-tests.mjs) | 89 | operations |  |
| [scripts/safe-migrate.cjs](../../../scripts/safe-migrate.cjs) | 165 | operations |  |
| [scripts/seed-partner-school.ts](../../../scripts/seed-partner-school.ts) | 188 | operations |  |
| [scripts/seed-test-user.sql](../../../scripts/seed-test-user.sql) | 39 | operations |  |
| [scripts/send-eligibility-campaign.ts](../../../scripts/send-eligibility-campaign.ts) | 96 | operations |  |
| [scripts/snapshot-email-failures.ts](../../../scripts/snapshot-email-failures.ts) | 116 | operations |  |
| [scripts/source-text-tests-baseline.json](../../../scripts/source-text-tests-baseline.json) | 96 | operations |  |
| [scripts/stamp-chs-funding.ts](../../../scripts/stamp-chs-funding.ts) | 92 | operations |  |
| [scripts/subset-material-symbols.py](../../../scripts/subset-material-symbols.py) | 88 | operations |  |
| [scripts/subset-material-symbols.sh](../../../scripts/subset-material-symbols.sh) | 11 | operations |  |
| [scripts/sync-portal-test-auth.ts](../../../scripts/sync-portal-test-auth.ts) | 285 | operations | syncPortalTestAuth:235 |
| [scripts/test-unit.mjs](../../../scripts/test-unit.mjs) | 189 | operations |  |
| [scripts/validate-approved-coursera-catalog.ts](../../../scripts/validate-approved-coursera-catalog.ts) | 44 | learning-coursera |  |
| [scripts/validate-approved-coursera-track.ts](../../../scripts/validate-approved-coursera-track.ts) | 67 | learning-coursera |  |
| [scripts/vercel-build.cjs](../../../scripts/vercel-build.cjs) | 69 | operations | appBuildScriptForEnvironment:65, copyMarketingBuild:66, main:67, runNpm:68 |
| [scripts/vercel-deploy-fix.sh](../../../scripts/vercel-deploy-fix.sh) | 35 | operations |  |
| [scripts/verify-admin-mutation-audit.cjs](../../../scripts/verify-admin-mutation-audit.cjs) | 158 | operations | classify:156, exportedMutatingMethods:156, ALLOWLIST:156, DELEGATED_AUDIT_HELPERS:156 |
| [scripts/verify-admin-mutation-audit.test.cjs](../../../scripts/verify-admin-mutation-audit.test.cjs) | 70 | operations |  |
| [scripts/verify-high-risk-tenant-routes.cjs](../../../scripts/verify-high-risk-tenant-routes.cjs) | 683 | operations |  |
| [scripts/verify-i18n-completeness.cjs](../../../scripts/verify-i18n-completeness.cjs) | 153 | operations |  |
| [scripts/verify-material-symbols-font-size.mjs](../../../scripts/verify-material-symbols-font-size.mjs) | 38 | operations |  |
| [scripts/verify-no-per-query-guc.cjs](../../../scripts/verify-no-per-query-guc.cjs) | 71 | operations | findViolations:56, TARGET:56 |
| [scripts/verify-no-source-text-tests.mjs](../../../scripts/verify-no-source-text-tests.mjs) | 120 | operations | ROOT:27, BASELINE_PATH:28, listTestFiles:43, readsApplicationSource:61, findSourceTextTests:66, loadBaseline:70, evaluate:78 |
| [scripts/verify-no-source-text-tests.test.ts](../../../scripts/verify-no-source-text-tests.test.ts) | 41 | operations |  |
| [scripts/verify-pdf-deployment.mjs](../../../scripts/verify-pdf-deployment.mjs) | 141 | operations | PDF_DEPLOYMENT_RESULT_PREFIX:14, parsePdfDeploymentResult:17, pdfDeploymentAssets:49, verifyPdfDeploymentAssets:64 |
| [scripts/verify-rippling-bulk-import.ts](../../../scripts/verify-rippling-bulk-import.ts) | 194 | operations |  |
| [scripts/verify-rippling-job-sanitizer.ts](../../../scripts/verify-rippling-job-sanitizer.ts) | 75 | operations |  |
| [scripts/verify-rls-staging.mjs](../../../scripts/verify-rls-staging.mjs) | 205 | operations |  |
| [scripts/visual-audit.mjs](../../../scripts/visual-audit.mjs) | 114 | operations |  |
| [scripts/vitest-library-specs.mjs](../../../scripts/vitest-library-specs.mjs) | 36 | operations | VITEST_LIBRARY_SPECS:2 |
| [scripts/wrap-api-routes-with-guc-ts.ts](../../../scripts/wrap-api-routes-with-guc-ts.ts) | 216 | operations |  |
| [scripts/wrap-api-routes-with-guc.ts](../../../scripts/wrap-api-routes-with-guc.ts) | 250 | operations |  |
