# Portal DEMO acceptance

This lane consolidates the disposable action acceptance from #2719 and the current-route, readiness and staff-protection contracts from #2829, #2833 and #2835. It uses today's portal screens. It does not install the old prototype UI or alter production schema, provider configuration, shared accounts or curriculum.

## Release and environment gates

The new workflow is deliberately held until the repository variable `DEMO_QA_ENABLED=true` is reviewed and configured. Before a job references `demo-qa`, a separate job verifies that the environment already exists, has independent required reviewers with self-review prevented, and permits only the `master` branch. Missing or unreadable protection fails the run. Only a first-attempt manual dispatch of this repository's master source is accepted. No schedules or candidate-branch code receive credentials.

The parent coordinator supplies two independently verified immutable GitHub Preview deployment IDs and a full baseline SHA. The candidate must serve the exact checked-out master SHA. The browser preflight proves deployment provenance, nonproduction origins, application SHA and both DEMO datasource identities before reading account credentials or creating fixtures. It repeats health checks before login. Cleanup-only does not require the old application deployment to remain available.

The environment requires dedicated `DEMO_QA_DATABASE_URL`, `DEMO_QA_SUPABASE_URL`, `DEMO_QA_SERVICE_ROLE_KEY`, `DEMO_QA_READ_ONLY_TOKEN` and, where required, `DEMO_QA_VERCEL_BYPASS_SECRET`. Exact synthetic organization ID and slug are environment variables `DEMO_QA_ORGANIZATION_ID` and `DEMO_QA_ORGANIZATION_SLUG`. There is no `PREVIEW_*`, normal application database or production fallback. Use a direct or session PostgreSQL connection; transaction pooling is refused. Management-connection permissions do not prove these runner credentials work.

## Durable ownership and recovery

`scripts/five-role-demo-fixture.ts` supports `plan`, `create`, `readback`, `cleanup`, `recover-cleanup` and the bounded `complete-preassessment` fixture transition. Local JSON files are exports. Existing DEMO `audit_logs` rows with `target_type=PortalQaRun` retain the authoritative claim, immutable identity, exact plan, preimages, intents, observed IDs, owned-row graph and cleanup evidence. Passwords, keys, cookies and tokens never enter that journal.

Each operation takes a transaction advisory lock, validates the complete hash chain and compare-and-set revision/owner, inserts a deterministic event and reads it back. The durable owner lasts across HTTP calls; a transaction lock alone is insufficient. Auth creation and deletion have an intent before the single external call. Unknown outcomes remain quarantined and are never blindly retried. Database fixture changes, preimages, resulting graph and journal receipt commit in the same serializable transaction.

Recovery reads the original journal, verifies the original GitHub run ID, repository, attempt, control SHA and terminal status, then changes ownership under the lock. Exact-email Auth recovery requires the original run flag, role and organization. A positively observed completed creation or verified deletion can be reconciled. An absent creation, present deletion, or unresolved application request remains quarantined: a stopped runner does not prove a remote request stopped. No elapsed-time takeover, arbitrary ID input, SQL input, local snapshot authority or password reset exists.

Cleanup checks every reachable dependent and exact synthetic identity before destruction. Unknown tables, foreign relationships, unexpected notes, changed fields or concurrent changes refuse cleanup. The database cleanup and absence checks are atomic with its journal event. Auth users are then deleted once and absence is checked by exact ID and exact email. The journal remains. A cleanup-only result cannot turn missing acceptance into a pass.

## Required acceptance

The five per-run users exercise member goal creation, counselor note creation, admin note creation, employer profile update and partner profile update. The same disposable member exercises location, notification preferences and message-read timestamp with application and database readback. Incomplete and completed preassessment states are explicit fixtures; setting the fixture is not proof of product assessment scoring. Six canonical synthetic login events establish the incomplete-state gate without repeated sign-ins. The fixture writer validates the event vocabulary and writes through its dedicated journal transaction, without importing the normal application's Prisma client.

The browser contract is documented in [portal-browser-acceptance.md](qa/portal-browser-acceptance.md). Current route inventory, actual content readiness, logged-out routes, the current fixture matrix, member routes and independent staff/mentor comparison are mandatory. Missing dynamic program/session fixtures and unapproved mentor fixtures stay incomplete. They are not replaced by invented assignments or mentor approvals. The local-development fixture companion is required for proof routes unavailable on hosted Preview; its case IDs come from the checked-out current registry. The hosted workflow does not launch an unconfigured application server or claim local fixture coverage it did not run.

`scripts/complete-portal-acceptance.ts` derives expected cases from trusted source and combines browser evidence with the durable mutation verifier. Every receipt must bind the same run, organization, plan hash, trusted control revision, deployed SHA and baseline SHA. All mutations require one durable attempt, successful application readback, matching database evidence and verified cleanup. Missing, skipped, errored or partial evidence cannot become green because the reporter itself ran.

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
