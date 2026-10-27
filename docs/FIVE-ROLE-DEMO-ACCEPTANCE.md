# Portal DEMO acceptance

This lane consolidates the disposable action acceptance from #2719 and the current-route, readiness and staff-protection contracts from #2829, #2833 and #2835. It uses today's portal screens. It does not install the old prototype UI or alter production schema, provider configuration, shared accounts or curriculum.

## Release and environment gates

The new workflow is deliberately held until the repository variable `DEMO_QA_ENABLED=true` is reviewed and configured. The concrete pending environment proposal requires Mike Brown (`mabrown040`, GitHub ID `225406758`) as the sole manual reviewer, allows him to approve his own dispatch, disables administrator bypass, and permits only the `master` branch. This matches the authorized operator rather than inventing a second reviewer. Before a job references `demo-qa`, a separate job verifies that this environment already exists with those exact controls. Missing or unreadable protection fails the run. Creating the environment and authorizing hosted fixture writes remain parent-held decisions. Only a first-attempt manual master dispatch is accepted.

The parent coordinator supplies two independently verified immutable GitHub Preview deployment IDs and a full baseline SHA. The baseline must differ from the candidate and be its strict ancestor according to GitHub's compare API. The candidate must serve the exact checked-out master SHA. The browser preflight proves deployment provenance, nonproduction origins, application SHA and both DEMO datasource identities before reading account credentials or creating fixtures. Database and Auth secrets are scoped to individual post-preflight steps; installation, plan export and the local companion do not receive them. Only the scoped protection-bypass capability reaches hosted health preflight. Cleanup-only does not require the old application deployment to remain available.

The environment requires dedicated `DEMO_QA_DATABASE_URL`, `DEMO_QA_SUPABASE_URL`, `DEMO_QA_SERVICE_ROLE_KEY`, `DEMO_QA_READ_ONLY_TOKEN` and, where required, `DEMO_QA_VERCEL_BYPASS_SECRET`. Exact synthetic organization ID and slug are environment variables `DEMO_QA_ORGANIZATION_ID` and `DEMO_QA_ORGANIZATION_SLUG`. There is no `PREVIEW_*`, normal application database or production fallback. Use a direct or session PostgreSQL connection; transaction pooling is refused. Management-connection permissions do not prove these runner credentials work.

## Durable ownership and recovery

`scripts/five-role-demo-fixture.ts` supports `plan`, `create`, `readback`, `cleanup`, `recover-cleanup` and the bounded `complete-preassessment` fixture transition. Local JSON files are exports. Existing DEMO `audit_logs` rows with `target_type=PortalQaRun` retain the authoritative claim, immutable identity, exact plan, preimages, intents, observed IDs, owned-row graph and cleanup evidence. Passwords, keys, cookies and tokens never enter that journal.

Each operation takes a transaction advisory lock, validates the complete hash chain and compare-and-set revision/owner, inserts a deterministic event and reads it back. The durable owner lasts across HTTP calls; a transaction lock alone is insufficient. Auth creation and deletion have an intent before the single external call. Unknown outcomes remain quarantined and are never blindly retried. Database fixture changes, preimages, resulting graph and journal receipt commit in the same serializable transaction.

Recovery reads the original journal and proves that its **current owner** is a terminal first-attempt GitHub run before changing ownership under the lock. The original owner must match its control SHA; a later cleanup owner must also be a manual master dispatch of this workflow. Unbound acknowledged/verified proof objects are refused. Exact-email Auth recovery requires the original run flag, role and organization. A positively observed creation or absent deletion can be reconciled. An Auth intent recorded before `dispatch-started` can reconcile exact absence without sending. The SDK fetch boundary also records received HTTP responses, including failures. Once dispatch starts without a recorded response, absent creation remains unknown and is never replayed. A known failed deletion can receive one new cleanup attempt from a later terminal-proven owner; unknown deletion outcomes still block it.

HTTP responses are durable events distinct from successful acceptance. A received response followed by a selector/readback failure records the fresh owned graph as `failed-confirmed`, so acceptance remains red while exact cleanup remains available. After terminal-owner proof, an interrupted application operation can reconcile a recorded response or a positively matching exact postimage. Unknown transport without positive postimage remains quarantined; runner termination alone is not evidence that a remote request stopped. Login attempts for all five roles on both deployments are journaled, and eventual login analytics are bounded by exact-user attempt counts. Staff MFA setup/verification is an explicit held fixture gate.

Cleanup checks every reachable dependent and exact synthetic identity before destruction. Unknown tables, foreign relationships, unexpected notes, changed fields or concurrent changes refuse cleanup. The database cleanup and absence checks are atomic with its journal event. Auth users are then deleted once and absence is checked by exact ID and exact email. The journal remains. A cleanup-only result cannot turn missing acceptance into a pass.

## Required acceptance

The five per-run users exercise member goal creation, counselor note creation, admin note creation, employer profile update and partner profile update. The same disposable member exercises location, notification preferences and message-read timestamp with application and database readback. Incomplete and completed preassessment states are explicit fixtures; setting the fixture is not proof of product assessment scoring. Six canonical synthetic login events establish the incomplete-state gate without repeated sign-ins. The fixture writer validates the event vocabulary and writes through its dedicated journal transaction, without importing the normal application's Prisma client.

The browser contract is documented in [portal-browser-acceptance.md](qa/portal-browser-acceptance.md). Current route inventory, actual content readiness, logged-out routes, the current fixture matrix, member routes and independent staff/mentor comparison are mandatory. The implemented default-disabled phases and exact pre-approval artifact flow are documented in the [activation and recovery runbook](qa/portal-acceptance-activation.md). The [synthetic fixture proposal](qa/portal-acceptance-fixture-proposal.md) explains the source-backed assignment and exposure decisions that remain held. Missing approvals stay incomplete.

The workflow runs `node scripts/run-portal-local-fixtures.mjs` on Ubuntu before creating accounts. This starts a task-owned disconnected Next dev server from the clean exact commit, with a fresh local read-only token and an allowlisted child environment. It runs the real current-registry local fixture browser cases, stops only that server process group, and writes an execution receipt bound to the run, source and browser receipt bytes. Environment files are refused. Logs, capabilities and browser targets are not uploaded. The companion fills only expected local-only omissions; a failed case cannot become green through merging.

Anonymous local fixtures do not receive the authenticated middleware suppression
marker. The local contract instead verifies the listener's Linux process group,
checkout directory, exact source SHA and fresh nonce-bearing environment through
`/proc`; browser checks revalidate that ownership and keep network mutation guards.
Only the nonce digest and process IDs enter receipts. Hosted cases still require
the actual app suppression marker. This is isolated fixture rendering evidence,
not authenticated application acceptance.

`scripts/complete-portal-acceptance.ts` derives expected cases from trusted source, exports `contract.json` and `action-lanes.json`, verifies same-run local execution provenance, and combines browser evidence with the durable mutation verifier. Every receipt must bind the same run, organization, plan hash, trusted control revision, deployed SHA and baseline SHA. All mutations require one durable attempt, successful application readback, matching database evidence and verified cleanup. Missing, skipped, errored or partial evidence cannot become green because the reporter itself ran.

## Local validation

Use Node 22 and the existing dependency lockfile. Focused commands:

```sh
node --test scripts/demo-acceptance.test.cjs
node --import tsx --test scripts/five-role-demo-fixture.test.ts scripts/five-role-acceptance-receipt.test.ts
node scripts/check-portal-browser-source.mjs
pnpm exec playwright test --config five-role-demo-playwright.config.ts --list
TEST_REAL_DB=1 POSTGRES_PRISMA_URL=postgresql://user@127.0.0.1:55427/disposable node scripts/demo-acceptance-journal.realdb.mjs
TEST_REAL_DB=1 POSTGRES_PRISMA_URL=postgresql://user@127.0.0.1:55427/disposable node --import tsx scripts/demo-acceptance-owned-rows.realdb.ts
```

The two PostgreSQL contracts reject remote or ambiguous targets. They require the current schema in a task-owned disposable database. Their proofs cover claim exclusion, CAS, rollback after journal readback failure, atomic creation, compound-key inventories, unexpected dependents, concurrent drift, sensitive-field refusal and atomic cleanup. Mocks and local PostgreSQL prove safety properties, not hosted acceptance. The full release still needs current-head prepush, applicable CI, independent review and authorized exact-SHA DEMO acceptance, including controlled interruption and cleanup-only recovery. Preserve the original proposal branches until the coordinator links their replacement and records the remaining gates.

For a disconnected local runtime contract outside GitHub, the companion accepts
`PORTAL_LOCAL_FIXTURE_OUTPUT=test-results/local.json node scripts/run-portal-local-fixtures.mjs --local-contract-only`.
It builds a fresh local identity with no repository or GitHub run provenance; no
GitHub environment variables or credentials are required. Its execution receipt explicitly records that mode and is
rejected by the hosted finalizer even if all browser cases pass. This can verify
the Linux process and browser path without representing a local simulation as a
protected workflow execution.
