# Resume Build DEMO acceptance

This is a provider-backed acceptance lane for member Resume Build
(`POST /api/member/resume/generate`) on the isolated DEMO Preview. It is the only
lane that makes a real provider call. The unit and route tests mock the provider.

| Piece | File |
| --- | --- |
| Workflow: manual dispatch, `master` only | [`.github/workflows/resume-demo-acceptance.yml`](../.github/workflows/resume-demo-acceptance.yml) |
| Per-run disposable member (`create` / `cleanup`) | [`scripts/resume-demo-member.ts`](../scripts/resume-demo-member.ts) |
| Member helper tests (**mocked**, offline) | [`scripts/resume-demo-member.test.ts`](../scripts/resume-demo-member.test.ts) |
| Acceptance spec (real provider, DEMO Preview) | [`tests/e2e/resume-demo-acceptance.spec.ts`](../tests/e2e/resume-demo-acceptance.spec.ts) |
| Synthetic two-page PDF, with the checked facts on page 2 | [`tests/fixtures/resumeDemoAcceptance.ts`](../tests/fixtures/resumeDemoAcceptance.ts) |
| Fixture check (local extractor, no provider) | [`tests/resume-demo-acceptance-fixture.test.ts`](../tests/resume-demo-acceptance-fixture.test.ts) |
| Exact production hostnames and receipt check, shared by the workflow and the spec | [`scripts/lib/resume-acceptance-receipt.mjs`](../scripts/lib/resume-acceptance-receipt.mjs), with CLI [`scripts/verify-resume-acceptance-receipt.mjs`](../scripts/verify-resume-acceptance-receipt.mjs) and **mocked** tests |

## What a run does

The workflow runs these steps in order. It fails closed at each gate.

0. **Policy:** an ungated first job with no secrets and no token permissions. It fails the run visibly unless it is a `workflow_dispatch` on `refs/heads/master` of `workforceap/workforceap-beta`, so a `--ref <branch>` dispatch is red instead of an all-skipped green. Every other job depends on it (static test `scripts/resume-demo-acceptance-workflow.test.ts`).
1. **Mirror:** points `preview` at `master`, using the same reusable workflow as the portal smoke.
2. **Wait:** waits for the Vercel Preview build of the dispatched commit.
3. **Gate 0:** the target must not be an exact production hostname (`workforceap.org`, `www.workforceap.org`). The spec applies the same list. Other `*.workforceap.org` hosts are not assumed to be production.
4. **Gate 1:** `scripts/portal-audit-health-gate.mjs` (`isolated_preview`) proves `PREVIEW_SITE_URL` serves this exact commit and reports the DEMO Supabase project. No credential is read before this gate.
5. **Gate 2 and create:** `scripts/resume-demo-member.ts create`.
   - It first runs `readPortalQaTarget`, before any client exists. This refuses a Supabase URL or database URL that is not the DEMO project, and refuses `VERCEL_ENV=production`.
   - It then checks the organization given as dispatch inputs. An organization with exactly that ID must exist, its slug must match exactly, and it must be active (`assertPortalQaOrganization`). It must also be the only active `portal-qa-*` organization. Any mismatch fails closed before anything is created.
   - The organization itself is only read, never changed.
   - It then creates **one** member, `resume-qa-<run id>-<attempt>@example.com`, with the member role and a password generated for this run. The password is masked in the log and never printed.
   - It writes a creation marker before the Auth create call. The marker holds the run ID and synthetic email, and no secrets. It then records the exact Auth ID before the database write.
6. **Spec:** `tests/e2e/resume-demo-acceptance.spec.ts` signs in as that member and does the following:
   - uploads the synthetic PDF, expecting 200;
   - makes exactly **one** Build request with the real provider and never retries it, expecting 200;
   - checks that the saved draft equals the returned draft;
   - checks that the four page-two facts (employer, title, school, program) are retained in the saved draft;
   - checks that `findUnsupportedResumeClaims` flags no claim kinds against the fixture text. It is a narrow fail-closed validator: prose claims are not assessed, so this does not prove the draft free of unsupported claims. The contact kind comes from the profile, so it is recorded but not asserted.

   Right after sign-in, and before any upload or Build, the spec proves it is the disposable member (`checkMemberIdentity`). All of these must hold:
   - The Supabase session cookie carries **both** `user.id` and the access token's `sub`, and they are equal.
   - Both equal the member ID `create` recorded (`RESUME_ACCEPTANCE_MEMBER_ID`).
   - The app's own `GET /api/member/profile` returns that same ID and the member's email. That endpoint resolves the user server-side through Supabase `auth.getUser()`, so the token is verified, not just decoded.

   Anything missing or malformed fails as `identity_unproven`; anything present but different fails as `member_mismatch`. The spec then records `member: {runId, userId, email}` in the receipt.

   The spec refuses any account that is not a `resume-qa-*@example.com` member, an email not built from this run's `RESUME_ACCEPTANCE_RUN_ID`, the shared `PREVIEW_E2E_MEMBER_EMAIL` account, and exact production hostnames. The workflow sets `RESUME_ACCEPTANCE_MODE=workflow`. In that mode a refusal **fails** the spec instead of skipping it, and a receipt with `pass: false` is always written. Without the flag, locally, the spec stays inert and skips.
7. **Cleanup:** runs always. `scripts/resume-demo-member.ts cleanup` works only on the recorded ID, in this order:
   0. **Inputs.** `create` first writes a stage file (`RESUME_QA_STAGE_FILE`) saying `target-guard`, before anything else and before any client or Auth call is possible. Once the target guard passes, it rewrites the file as `clients` (with the synthetic email), still before any client is built. Cleanup decides from the local marker, state and stage files, **before** its own target guard, so this step needs no DEMO URL or client:
   - **No marker, no state, stage still `target-guard`:** create stopped at the guard in this run. Cleanup writes an **informational** receipt: `memberCreated: false` (meaning "no marker found", not "proven absent"), `markerFound: false`, `memberCreationAttempted: "not-observed"`, `informationalOnly: true`, `failedStage: "target-guard"`. It touches nothing. The combined verifier rejects this receipt, so the run stays red.
   - **No marker once create was past the guard, or no readable stage file:** cleanup **fails closed** with manual recovery steps keyed to the exact synthetic email. It writes `memberCreated: "unknown"`.
   - **A marker without a readable state:** cleanup fails closed the same way, using the email in the marker.
   - **A recorded state, but the guard refuses the target:** cleanup touches nothing and writes `success: false` with the recorded IDs.

   Recovery means: look up by the exact synthetic email, then delete by the returned exact ID. Cleanup never deletes by pattern.
   1. It looks up the Prisma and Auth users. Auth lookups fail closed. Only the explicit Supabase Auth code `user_not_found` counts as absent. A bare 404 or any other error stops cleanup.
   2. It removes the member's own storage objects through `deleteUserStorageObjects` (`lib/gdpr/deleteUserStorage.ts`). That helper only lists that ID's prefixes: `member-resumes/<id>/`, `member-files/cert-files/<id>/` and the profile-photo prefix. It only keeps extra paths owned by that ID, and it fails closed on any list or remove error. Cleanup then checks that those prefixes count 0.
   3. It deletes the Auth user, then checks that the Auth user is gone (explicit not-found).
   4. Only after that does it delete the Prisma user, whose profile and member rows cascade. It then looks the user up again by the exact ID to check that the row is gone.

   Lookups and deletes get a bounded retry: 3 attempts, with 1 s and 3 s backoff. Any failure fails the job, keeps the Prisma row so that rerunning cleanup can finish, and prints the exact recorded IDs for manual cleanup. Cleanup refuses if the recorded ID resolves to anything other than that synthetic email in the exact fixture organization. Cleanup does not require the organization to be the only active one, so a second organization appearing mid-run cannot strand the member. It never touches the organization.

Guarded-422 preservation is **not** exercised on the live provider, because there is only one call. It is proven deterministically, with a **mocked provider**, by `tests/api/resume-generate-pdf-factuality.spec.ts:297-318` › *keeps the prior good draft untouched when a new draft is rejected*. That test uses a real synthetic PDF, prior draft bytes and an invented employer, and checks for a 422 with the stored bytes untouched. If the one live Build returns a guard 422, it is recorded as a possible false rejection.

## Dispatch

**Shared quota.** `DEMO_SETUP.md:65` documents the Preview `GROQ_API_KEY` as the production key, so a Build request may consume production Groq quota. Authorized by Mike in the Slack thread (2026-09-27 19:08 UTC) for one Build call from the exact-SHA Preview app with a synthetic disposable DEMO member. The boundary is: no production deployment endpoint and no real member data. The following rules apply:

- **Exactly one Build request per dispatch.** `singleBuildBudget` enforces this, and a mocked test covers it.
  - The request is never retried. That includes 429, 5xx and timeouts, which the Playwright request makes with `maxRetries: 0`.
  - The spec and workflow both run with `--retries=0`.
  - A failed Build is recorded and the run ends, then cleanup runs.
- **Never repeat a dispatch without reviewing the previous receipt.** The `resume-demo-acceptance` concurrency group stops two runs from overlapping.
- The target must be the Preview serving the exact SHA. The job fails closed on an exact production hostname (gate 0) and unless `/api/health` on `PREVIEW_SITE_URL` reports the dispatched commit on the DEMO project (gate 1).
- A green job requires **both** receipts, read **together** by one verifier (`verifyAcceptanceRun`, the *Verify the acceptance and cleanup receipts together* step). It passes only when all of these hold:
  - the acceptance receipt says `pass: true`, `outcome: success` and `buildRequestsMade: 1`, and records the `member` it ran as;
  - the cleanup receipt says `success: true` **and** `memberCreated: true`, with Auth and Prisma absence verified and every `storage.after` count 0;
  - both receipts name the same `runId`, `userId` and `email`.

  A no-op cleanup receipt (`memberCreated: false`, a pre-create failure) never passes. Each receipt also has its own upload step with `if-no-files-found: error`.
  - `resume-demo-acceptance.json` must hold `pass: true`, `outcome: success` and `buildRequestsMade: 1`.
  - `resume-demo-cleanup.json` must hold `success: true`, `authAbsenceVerified: true`, `prismaUserAbsenceVerified: true`, and a count of 0 for every member-prefix bucket in `storage.after`.
- Dispatch stays stopped until Mike has reviewed and merged this workflow and verified the guards. Do not change any environment variables or keys.

A workflow file cannot be dispatched from a branch with secrets, so dispatch happens only from `master`.

The organization ID and slug are required dispatch inputs, not source constants. The current candidate, confirmed read-only by the owner on 2026-09-27 as the only active `portal-qa-*` organization in DEMO, is ID `008064ba-6be0-4d24-b1a5-87e4824204d3` with slug `portal-qa-september-smoke`. Re-check this before each dispatch; the job re-checks it too.

```bash
gh workflow run resume-demo-acceptance.yml --ref master \
  -f qa_organization_id=008064ba-6be0-4d24-b1a5-87e4824204d3 \
  -f qa_organization_slug=portal-qa-september-smoke
gh run watch "$(gh run list --workflow resume-demo-acceptance.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
gh run download <run id> -n resume-demo-acceptance-<run id>
gh run download <run id> -n resume-demo-cleanup-<run id>
```

## Provider path

Vercel metadata (owner, 2026-09-27, names only):
- `GROQ_API_KEY` is set for all environments.
- `ANTHROPIC_API_KEY` is not set.

Resume Build is allowed on Groq:
- `lib/ai/resumeBuildProviders.ts` treats Build as configured when Anthropic **or** Groq is configured.
- It calls `claudeChat` with `allowGeminiFallback: false`.
- `claudeChat` (`lib/ai/anthropicChat.ts`) skips Anthropic when it has no key, then calls Groq.

So a run on Preview is served by the **Groq fallback**. The receipt labels it that way. The route returns neither the provider nor the model, and the harness cannot read Vercel logs, so the receipt records the provider path from configuration, not from the response.

## Receipt (`resume-demo-acceptance-<run id>` artifact)

The receipt never contains resume text, cookies, tokens or passwords. It records:
- `member`: the `runId`, Auth `userId` (read from the signed-in session and checked against the created member) and synthetic `example.com` email, for the cross-check with the cleanup receipt;
- `providerPath` and `model` (`not exposed by the route`);
- `groqQuota`, a static disclosure: "Preview GROQ_API_KEY shares production quota (DEMO_SETUP.md:65); a Build request may consume it";
- `buildRequestLimit` (always 1) and `buildRequestsMade`, which is 0 or 1 and says what was actually attempted;
- `pass` (boolean) and `outcome`, which is the Build outcome below, or `refused` / `identity_unproven` / `member_mismatch` / `upload_failed` / `not_run`;
- `validatorScope`: `findUnsupportedResumeClaims` is a narrow fail-closed validator, and prose claims are not assessed;
- `upload.status` and `upload.extractionWarning`;
- `firstBuild`, the only Build, with `status`, `outcome`, `latencyMs`, `error`, and `draft.length` / `draft.sha256`;
- `savedDraftMatchesResponse`;
- `firstBuildReview.pageTwoFacts`, as `{employer,title,school,program}` booleans ("page-two facts retained");
- `firstBuildReview.unsupportedClaimKindsFlagged`, meaning claim kinds flagged by `findUnsupportedResumeClaims`, and `contactKindFlaggedNotAsserted`;
- `possibleFalseRejection`, `prerequisiteMissing` and `refusal`.

`outcome` is classified from the route's status and message:

| Outcome | Meaning |
| --- | --- |
| `success` | 200 and the draft was saved |
| `request_failed` | The request timed out or failed at the network level. It is not retried. |
| `provider_unconfigured` | 503: no approved provider is configured. This is a missing prerequisite. |
| `provider_error_or_empty_output` | 422 "not readable". `claudeChat` returns nothing when every configured provider fails (auth, quota, outage), so this is a provider problem, not a guard. |
| `provider_threw` | 502 |
| `app_rate_limited` | 429 from the app's own AI rate limit |
| `guard_factuality_422` / `guard_missing_section_422` | The draft was rejected by a guard. This is a **possible false rejection** to report. The rejection kinds are only in the server log line `draft rejected by factuality check: <kinds>`. |
| `source_unreadable_422` | The stored original has no readable text |

**Pass** (`pass: true`) requires all three of these on the one Build:
- the outcome is `success`;
- the page-two facts are retained;
- no claim kinds are flagged by `findUnsupportedResumeClaims`. This is a narrow fail-closed validator; prose claims are not assessed.

## Cleanup verification

The cleanup receipt is `test-results/resume-demo-cleanup.json`, in the `resume-demo-cleanup-<run id>` artifact. It holds:
- `storage.before` and `storage.after`, as per-bucket object counts for the member's prefixes (counts only, no paths);
- `storage.removed`;
- `success` and `memberCreated`;
- `authAbsenceVerified` and `prismaUserAbsenceVerified`;
- `authUserDeleted` and `databaseUserDeleted`;
- `userId`, `email` and `runId`, which must match the acceptance receipt's `member`;
- `auditRowsRetained: true`.

On failure the receipt holds `success: false` and the error.

`success: true` is written only when the prefix counts in `storage.after` are 0 and both absence checks passed. The step log prints the same summary. To check it independently, use read-only DEMO queries:
- `member-resumes/<id>/` is empty;
- no `users` row with that ID;
- no Auth user with that ID.

If the run was cancelled before cleanup, or cleanup failed, re-run only the cleanup step against that exact ID. Use the same helper with `RESUME_QA_STATE_FILE` pointing at a JSON file holding `{userId, email, organizationId, runId}`. Never delete by pattern.

Audit rows (`audit_logs`, `audit_events`) that name the synthetic actor are **kept by design**. Cleanup is not a full erasure.

## Prerequisites

| Prerequisite | Status |
| --- | --- |
| Workflow merged to `master` | Needed before any dispatch |
| `PREVIEW_SITE_URL`, `PREVIEW_SUPABASE_URL`, `PREVIEW_SUPABASE_SERVICE_ROLE_KEY`, `PREVIEW_POSTGRES_PRISMA_URL`, `PREVIEW_E2E_MEMBER_EMAIL` repository secrets | Names confirmed present. Values unverified. The job's gates prove at runtime that they point at DEMO. |
| `PREVIEW_POSTGRES_PRISMA_URL` identifies the DEMO project | **Failed** in run 36347160066 (2026-09-27). `create` stopped at the target guard ("Portal QA database URL must identify the approved demo project") before any marker, member, upload or Build, so no Build request was made. Replace it and confirm it with the secret check below before any rerun. |
| Exactly one active DEMO `portal-qa-*` organization, whose ID and slug are dispatch inputs | Present: `portal-qa-september-smoke`, confirmed read-only by the owner on 2026-09-27. The job re-checks it at dispatch. |
| `member-resumes` and `member-files` storage buckets in DEMO | Both exist and are private. The owner checked this read-only on 2026-09-27. Contents were not listed; cleanup counts only the member's own prefixes. |
| A provider key for Resume Build in the Vercel **Preview** environment | `GROQ_API_KEY` is present for all environments; `ANTHROPIC_API_KEY` is absent (owner, Vercel metadata, 2026-09-27). The Groq key's validity and quota are **unverified until a run**. `DEMO_SETUP.md` says the Preview Groq key is the same key as production, so a Build request may consume production Groq quota. |

`scripts/sync-portal-test-auth.ts` is **not** used. It is fixed to the five standing QA accounts (including `member-test@workforceap.org`) and refuses reruns.

## Replacing the Preview database secret

The acceptance lane reads exactly one database secret: `PREVIEW_POSTGRES_PRISMA_URL`, which it passes to the helper as `POSTGRES_PRISMA_URL`. It does not set `DATABASE_URL` or `POSTGRES_URL_NON_POOLING`, so the lane itself does not use `PREVIEW_DATABASE_URL`. The secret check below still classifies **both** secrets and fails unless both are DEMO. If only `PREVIEW_DATABASE_URL` fails, replace it the same way from the DEMO project's **Direct connection** string (port 5432, no pooler parameters).

The value must never appear in a log, a chat, a file or shell history.

1. **Open the DEMO project.** In the Supabase dashboard, open the project whose URL contains the DEMO ref `esbdrgaonplpvzmtrdhw`. Stop if the ref is anything else; the production ref is `jqddnyuszufndwwezdwp`.
2. **Copy the transaction pooler string.** Go to **Connect** → **Transaction pooler** (port **6543**) and copy the URI. It has the form `postgres://postgres.<ref>:[YOUR-PASSWORD]@aws-<n>-<region>.pooler.supabase.com:6543/postgres`.
   - Replace `[YOUR-PASSWORD]` with the DEMO database password, percent-encoded if it contains characters such as `#`, `/`, `?` or `@`.
   - **Do not reset the DEMO database password** to get one. The Vercel Preview `POSTGRES_PRISMA_URL` (Sensitive, unreadable) uses the current password, and a reset would break the Preview deployment. If the password is not known, stop and ask.
3. **Append the runtime parameters.** Add `?pgbouncer=true&connection_limit=1`, using `&` instead of `?` if the string already has a query. The helper does not require `pool_timeout`; the Vercel runtime contract (`scripts/lib/runtime-pool-contract.cjs`) additionally requires it, so `&pool_timeout=10` is harmless to add.
4. **Set the secret from the clipboard or a hidden prompt, never as an argument.** Either:
   ```bash
   pbpaste | gh secret set PREVIEW_POSTGRES_PRISMA_URL --repo workforceap/workforceap-beta
   ```
   or run `gh secret set PREVIEW_POSTGRES_PRISMA_URL --repo workforceap/workforceap-beta` with no `--body` and paste at its hidden prompt. Neither puts the value in shell history or on screen. Clear the clipboard afterwards.
5. **Check it without revealing it.** Dispatch the read-only secret check from `master`:
   ```bash
   gh workflow run preview-db-secret-check.yml --ref master --repo workforceap/workforceap-beta
   ```
   Its one parse-only step runs `node scripts/classify-preview-db-url.mjs PREVIEW_POSTGRES_PRISMA_URL PREVIEW_DATABASE_URL`, with both secrets exposed to that step only. The classifier uses the same `projectForUrl` as the guard and prints one JSON line per variable with only `name`, `classification`, `hostClass`, `refPresent`, `pgbouncer` and `connectionLimit1`. It opens no database connection and makes no network call. It must end green with `classification: "demo"` for both. `classification` is authoritative. `refPresent` is true only when the URL carries an `options=reference` marker, so a direct or `postgres.<ref>` pooler URL shows `refPresent: false` even when it names the DEMO project. Reading a failure:
   - `prod`: the value names the production project.
   - `unknown` with `hostClass` `direct` or `pooler`: a Supabase host that the guard does not approve as DEMO, for example another project or a stale value.
   - `unknown` with `hostClass: "other"`: the value isn't a recognized DEMO Supabase URL. This can be an unapproved but parseable host, a wrong scheme, a quoted value, or a malformed or unencoded value. Don't infer a single cause from this category; re-copy the string from the DEMO dashboard.
6. **Only then ask Mike to authorize the single acceptance rerun.** That rerun is still one Build request and needs his explicit go.

The Vercel Preview environment variable `POSTGRES_PRISMA_URL` is a separate value, used by the deployed app. The health gate already reports it as DEMO (`prismaProject demo`). This procedure does not touch it, so do not change it.

