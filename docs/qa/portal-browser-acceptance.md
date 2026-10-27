# Current portal browser acceptance

This lane preserves Portal C's readiness, current member-route, state-render and
staff comparison requirements without importing its old product UI. Its source
is the current `portal-audit-paths.mjs` and `PORTAL_REVIEW_FIXTURES` registries.
The disposable action runner remains responsible for five-role/member writes,
database readback and cleanup. Browser success alone cannot complete acceptance.

Run only from the clean, reviewed control commit after the protected environment
and synthetic identity plan have been approved:

```sh
node scripts/portal-browser-acceptance.mjs --input /private/browser-input.json --output test-results/portal-browser-receipts.json
```

Add `--preflight-only` before fixture creation to prove both destinations without
reading account credentials or launching Playwright. The optional Preview bypass
secret is used only for the already verified origin's health request. Its output
is destination evidence and cannot substitute for a browser lane receipt.

The input contains `identity` with `runId`, `projectRef`, `organizationId`,
`controlSha`, `deployedSha`, `baselineSha` and `planHash`; positive GitHub
`baselineDeploymentId` and `candidateDeploymentId`; the run-owned `memberId`;
and approved `dynamicRoutes` entries shaped `{pattern,path}`. Module routes
must retain `?program=`. `mentorApproved` defaults to false and must remain false
until the durable fixture plan and database readback establish the approved
mentor fixture. The browser runner does not create or approve mentors.

Before reading account credentials the entry point reads GitHub's exact
deployment records and latest statuses, requires a Vercel-owned successful
Preview for each full SHA, rejects moving aliases, then probes both origins'
health SHA and DEMO Auth/Prisma identity. It rechecks health immediately before
login and each staff comparison. The current immutable-host matcher is pinned
to this WAP Vercel project and team; a provider naming change must be reviewed,
never handled by accepting arbitrary hosts or branch aliases.

Credential inputs are explicit `FIVE_ROLE_QA_<ROLE>_EMAIL`, `_PASSWORD`, `_ID`,
plus matching `FIVE_ROLE_QA_RUN_ID`, for the exact
`wap6-qa-<runId>-<role>@example.com` fixture. Read-only existing fixture use may
instead supply `DEMO_QA_<ROLE>_EMAIL`, `_PASSWORD`, `_ID`, with exact
`<role>-test@workforceap.org` identities. There is no `E2E_*` or `PREVIEW_*`
fallback. Identity IDs/emails/roles are read back from the application, and
super-admin identities are refused. The fixture coordinator must independently
bind these IDs to the approved DEMO organization; these endpoints do not expose
organization identity and cannot establish that database fact.

Also provide `DEMO_QA_READ_ONLY_TOKEN` and, only when needed,
`DEMO_QA_VERCEL_BYPASS_SECRET`. No credential or storage state is exported. The
bypass header is scoped to requests on the independently proven origin. The
browser has no global extra headers; cross-origin requests, WebSockets and
unapproved writes are blocked. One explicit login POST is allowed, followed by
the existing read-only request classification. Capability cookies are installed
before login and the rendered server capability marker is required. Expected
telemetry and MFA capacity-consuming reads are fulfilled locally.

Staff comparisons use current canonical pages plus the existing admin Students
alias as an exact redirect. Every selected screen covers widths 1440, 1024 and
390, light/dark, expanded/collapsed desktop and open/closed mobile navigation.
Screenshots are captured separately from the verified baseline; comparison
keeps `maxDiffPixels: 0` and `threshold: 0.02`. Candidate-generated baselines are
never accepted. Snapshot output belongs in ignored test results, not the source
fixture directory. Time labels are the only masked elements.

The runner checkpoints every case atomically. Missing dynamic fixtures,
unapproved mentor scenarios, unavailable local-development-only fixtures and
unimplemented placeholder screens cannot pass. A hosted run alone cannot cover
local-only fixtures; the full orchestrator must supply independently reviewed
local render evidence with the same identity/case contract before closeout.
Assessment fixture setup remains distinct from completing the real assessment.

The executable companion mode covers only registry entries explicitly marked
`availability: local-development`. Start the candidate's development server
from its clean exact commit on loopback, with `VERCEL_GIT_COMMIT_SHA` set to that
full candidate SHA and a fresh local read-only audit capability configured in
the server. Use only disconnected or independently verified DEMO wiring; the
runner refuses production or unknown database identity. Supply that same fresh
capability as `PORTAL_ACCEPTANCE_LOCAL_AUDIT_TOKEN` to the companion:

```sh
node scripts/portal-browser-acceptance.mjs --input /private/browser-input.json --output test-results/local-fixture-receipts.json --local-fixtures-only --local-origin http://127.0.0.1:3107
```

This mode requires `controlSha === deployedSha`, validates the local health SHA,
does not query GitHub or read account/bypass credentials, never logs in, and
retains the same network/write guards. It does not start a server or copy any
hosted credentials into one. Its output is a distinct local companion receipt.
Add its path to the final status command. The trusted contract must also contain
`localFixtureCaseIds` derived from the current browser plan's
`local_development_only_fixture` cases. The reporter replaces only those exact
hosted omissions; it cannot replace a failed case, errored lane, different run,
or a different commit. Other hosted browser evidence remains unchanged.

The versioned lane manifest is `scripts/lib/portal-acceptance-lanes.mjs`.
Its identity contract also preserves and compares optional `repository`,
`workflowRunId` and `workflowAttempt` provenance when present.
The coordinator constructs the trusted expected-case contract from the current
browser plan and the action runner's checked-in contract, then evaluates all
receipts together:

```sh
node scripts/portal-acceptance-status.mjs /private/expected-contract.json test-results/acceptance.json browser-receipts.json action-receipts.json
```

The expected contract contains `identity` and `expectedCases` for every required
lane. Receipt-owned expected cases are ignored. Duplicate/unknown lanes,
mismatched SHA/run/plan, evidence read errors and duplicate or unexpected cases
are errors. Skipped, missing and running cases remain incomplete; failed actions
or cleanup remain failures. A cleanup-only recovery does not reconstruct missing
browser/action evidence. The status CLI exits nonzero unless every mandatory
case in every lane passes.

No hosted run or pixel comparison was performed during implementation. These
contracts require independently verified preview deployments, approved fixtures
and configured credentials before they can produce end-to-end evidence.

The Playwright suite is `.mts` so it can load the existing native ESM audit
guards without CommonJS transformation. Current repository TS/lint globs do
not cover that extension. Run `node scripts/check-portal-browser-source.mjs`
as an explicit source gate; it typechecks the suite and applies the unchanged
TypeScript lint rules to its exact source. The protected workflow must include
this command before its credential-bearing steps.
