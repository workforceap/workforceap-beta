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

## What a run does

The workflow runs these steps in order. It fails closed at each gate.

1. **Mirror:** points `preview` at `master`, using the same reusable workflow as the portal smoke.
2. **Wait:** waits for the Vercel Preview build of the dispatched commit.
3. **Gate 1:** `scripts/portal-audit-health-gate.mjs` (`isolated_preview`) proves `PREVIEW_SITE_URL` serves this exact commit and reports the DEMO Supabase project. No credential is read before this gate.
4. **Gate 2 and create:** `scripts/resume-demo-member.ts create`.
   - It first runs `readPortalQaTarget`, before any client exists. This refuses a Supabase URL or database URL that is not the DEMO project, and refuses `VERCEL_ENV=production`.
   - It then checks the organization given as dispatch inputs. An organization with exactly that ID must exist, its slug must match exactly, and it must be active (`assertPortalQaOrganization`). It must also be the only active `portal-qa-*` organization. Any mismatch fails closed before anything is created.
   - The organization itself is only read, never changed.
   - It then creates **one** member, `resume-qa-<run id>-<attempt>@example.com`, with the member role and a password generated for this run. The password is masked in the log and never printed.
   - It records the Auth ID before the database write.
5. **Spec:** `tests/e2e/resume-demo-acceptance.spec.ts` signs in as that member and does the following:
   - uploads the synthetic PDF, expecting 200;
   - runs Build with the real provider, expecting 200;
   - checks that the saved draft equals the returned draft;
   - checks that the saved draft contains the four page-2 facts (employer, title, school, program);
   - runs `findUnsupportedResumeClaims` against the fixture text and expects no unsupported history claim. Contact values come from the profile, so they are recorded but not asserted.
   - runs a second Build and records its result.

   The spec refuses any account that is not a `resume-qa-*@example.com` member, the shared `PREVIEW_E2E_MEMBER_EMAIL` account, and production hosts.
6. **Cleanup:** runs always. `scripts/resume-demo-member.ts cleanup` removes, by the recorded ID only:
   - the member's own storage objects, through `deleteUserStorageObjects` (`lib/gdpr/deleteUserStorage.ts`). That helper only lists that ID's prefixes: `member-resumes/<id>/`, `member-files/cert-files/<id>/` and the profile-photo prefix. It only keeps extra paths owned by that ID, and it fails closed on any list or remove error;
   - then its Prisma user, whose profile and member rows cascade;
   - then its Auth user.

   Any storage error stops cleanup before the database and Auth deletes, and the error is surfaced, so a retry can finish the job. Cleanup refuses if the recorded ID resolves to anything other than that synthetic email in the exact fixture organization. Cleanup does not require the organization to be the only active one, so a second organization appearing mid-run cannot strand the member. It never touches the organization.

Guarded-422 preservation is **not** forced on the live provider. It is proven deterministically, with a **mocked provider**, by `tests/api/resume-generate-pdf-factuality.spec.ts` › *keeps the prior good draft untouched when a new draft is rejected*. That test uses a real synthetic PDF, prior draft bytes and an invented employer, and checks for a 422 with the stored bytes untouched. If the live second Build returns 422 anyway, the spec requires the first draft to still be saved and records the result as a possible false rejection.

## Dispatch

Dispatch only after this workflow is on `master`. A workflow file cannot be dispatched from a branch with secrets.

The organization ID and slug are required dispatch inputs, not source constants. The current candidate, confirmed read-only by the owner on 2026-09-27 as the only active `portal-qa-*` organization in DEMO, is ID `008064ba-6be0-4d24-b1a5-87e4824204d3` with slug `portal-qa-september-smoke`. Re-check this before each dispatch; the job re-checks it too.

```bash
gh workflow run resume-demo-acceptance.yml --ref master \
  -f qa_organization_id=008064ba-6be0-4d24-b1a5-87e4824204d3 \
  -f qa_organization_slug=portal-qa-september-smoke
gh run watch "$(gh run list --workflow resume-demo-acceptance.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
gh run download <run id> -n resume-demo-acceptance-<run id>
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

The receipt never contains resume text, cookies, tokens, passwords or member emails. It records:
- `providerPath` and `model` (`not exposed by the route`);
- `acceptance`, which is `pass` or `fail`;
- `upload.status` and `upload.extractionWarning`;
- `firstBuild` and `secondBuild`, each with `status`, `outcome`, `latencyMs`, `error`, and `draft.length` / `draft.sha256`;
- `firstBuildReview.pageTwoFacts`, as `{employer,title,school,program}` booleans;
- `firstBuildReview.unsupportedClaims` and `contactClaimsNotAsserted`;
- `guarded422Exercised`, `possibleFalseRejection` and `prerequisiteMissing`.

`outcome` is classified from the route's status and message:

| Outcome | Meaning |
| --- | --- |
| `success` | 200 and the draft was saved |
| `provider_unconfigured` | 503: no approved provider is configured. This is a missing prerequisite. |
| `provider_error_or_empty_output` | 422 "not readable". `claudeChat` returns nothing when every configured provider fails (auth, quota, outage), so this is a provider problem, not a guard. |
| `provider_threw` | 502 |
| `app_rate_limited` | 429 from the app's own AI rate limit |
| `guard_factuality_422` / `guard_missing_section_422` | The draft was rejected by a guard. This is a **possible false rejection** to report. The rejection kinds are only in the server log line `draft rejected by factuality check: <kinds>`. |
| `source_unreadable_422` | The stored original has no readable text |

**Pass** requires all three of these on the first Build:
- the outcome is `success`;
- all four page-2 facts are present in the saved draft;
- `findUnsupportedResumeClaims` finds nothing.

The second Build is informational. If it does not succeed, the first draft must still be the saved one.

## Cleanup verification

The cleanup receipt is `test-results/resume-demo-cleanup.json`, in the same artifact. It holds:
- `storage.before` and `storage.after`, as per-bucket object counts for the member's prefixes (counts only, no paths);
- `storage.removed`;
- `databaseUserDeleted` and `authUserDeleted`;
- `auditRowsRetained: true`.

`storage.after` must be all zeros. The step log prints the same summary. To check it independently, use read-only DEMO queries:
- `member-resumes/<id>/` is empty;
- no `users` row with that ID;
- no Auth user with that ID.

If the run was cancelled before cleanup, re-run only the cleanup step against that exact ID. Use the same helper with `RESUME_QA_STATE_FILE` pointing at a JSON file holding `{userId, email, organizationId, runId}`. Never delete by pattern.

Audit rows (`audit_logs`, `audit_events`) that name the synthetic actor are **kept by design**. Cleanup is not a full erasure.

## Prerequisites

| Prerequisite | Status |
| --- | --- |
| Workflow merged to `master` | Needed before any dispatch |
| `PREVIEW_SITE_URL`, `PREVIEW_SUPABASE_URL`, `PREVIEW_SUPABASE_SERVICE_ROLE_KEY`, `PREVIEW_POSTGRES_PRISMA_URL`, `PREVIEW_E2E_MEMBER_EMAIL` repository secrets | Names confirmed present. Values unverified. The job's gates prove at runtime that they point at DEMO. |
| Exactly one active DEMO `portal-qa-*` organization, whose ID and slug are dispatch inputs | Present: `portal-qa-september-smoke`, confirmed read-only by the owner on 2026-09-27. The job re-checks it at dispatch. |
| `member-resumes` storage bucket in DEMO | Present (private). The owner checked this read-only on 2026-09-27. |
| A provider key for Resume Build in the Vercel **Preview** environment | `GROQ_API_KEY` is present for all environments; `ANTHROPIC_API_KEY` is absent (owner, Vercel metadata, 2026-09-27). The Groq key's validity and quota are **unverified until a run**. `DEMO_SETUP.md` says the Preview Groq key is the same key as production, so a run spends production Groq quota. |

`scripts/sync-portal-test-auth.ts` is **not** used. It is fixed to the five standing QA accounts (including `member-test@workforceap.org`) and refuses reruns.
