# Portal C safety net (batch B0)

Credential-free checks that later direction-C batches stack on. Live `/dashboard` pages are unchanged. This batch only adds a mock harness, Playwright coverage, and docs.

## What it covers

- **61 inventory member views** at `/dev/member/v/<slug>?state=full|empty|loading|error|first-time`.
- Shared numbers from `app/dev/member/devMemberFixtures.ts` (Alex Rivera, Dana Reyes, Brightline, score 72, module 8).
- Existing `/dev/member/home`, `/dev/member/jobs`, … proofs stay as they are. The harness is the canonical smoke/visual URL.
- Views that already have a C or tool kit render that kit. The rest render a current-UI stub (PageOpener + card) so later restyles produce a reviewable screenshot diff.
- `notFound()` when `VERCEL_ENV=production` (layout + harness pages).

## Local run

Postgres must be up (root layout reads the default org). Then:

```bash
npm run dev
# other terminal
npx playwright test \
  tests/e2e/dev-member-routes.spec.ts \
  tests/e2e/dev-member-visual.spec.ts \
  tests/e2e/member-unauth-redirects.spec.ts \
  --project=chromium
```

Or `npm run test:e2e:portal-c`.

Update visual baselines after an intentional harness change (Linux, same Playwright Chromium as CI):

```bash
npx playwright test tests/e2e/dev-member-visual.spec.ts --project=chromium --update-snapshots
```

Registry lock (no browser): `npx vitest run tests/app/dev-member-harness-registry.test.ts`.

## What the suites assert

| Spec | Needs login | Viewports | Checks |
|---|---|---|---|
| `dev-member-routes.spec.ts` | no | 1440 and 390 | every view × state: `h1`, EXAMPLE DATA banner, no console errors, no `partner` / `portfolio` / `exam voucher` in the harness root, primary `.wa-kit-cta` is not `--wa-info` blue |
| `dev-member-visual.spec.ts` | no | 1440 and 390 | `toHaveScreenshot` of **full** state (`maxDiffPixelRatio` 0.05; Vercel toolbar masked / skipped) |
| `member-unauth-redirects.spec.ts` | no | n/a | every inventory `/dashboard` path (and `/coach`, `/account/privacy`) redirects to login; aliases redirect to their target or to login when the layout auth-gates first |
| `member-all-routes.spec.ts` | yes (`PLAYWRIGHT_MEMBER_EMAIL` + `PLAYWRIGHT_PORTAL_PASSWORD`) | 1440 and 390 | Every canonical view and alias must reach a healthy exact destination. Dynamic routes require authorized concrete fixtures; a missing fixture or 404 fails. Module links retain their required `program` query. The mentor access gate must finish at `/mentor/apply` before the next navigation. `PORTAL_C_REQUIRED=1` fails if credentials are missing. |
| `portal-c-readiness.spec.ts` | no | desktop | Local disposable HTTP fixtures cover delayed mentor redirects, HTTP-200 streamed not-found refusal, completed staff data, malformed/failed response refusal, and missing-header or stalled-body deadline failures in the actual browser. |
| `staff-portal-protection.spec.ts` | yes, dedicated role fixtures | 1440, 1024, 390 | Same-account candidate/master comparison, including themes and shell states. Required queue and resume responses must complete successfully before screenshots. `maxDiffPixels: 0` and `threshold: 0.02` are unchanged. |
| `member-signed-in-c-routes.spec.ts` | yes (same secrets; CI maps `PREVIEW_E2E_MEMBER_*`) | n/a | After a SHA + DEMO Supabase pre-login guard: Home, Job board, My program, Resume Studio, and AI tools load with `h1`, no console errors, and honest-state rules. Then a profile location edit, a notification toggle, and a counselor-thread mark-read — each reloads, asserts persistence, and restores (mark-read only advances `memberLastReadAt`; it does not send mail). Traces are off so auth bodies are never captured. |

Banned-word and CTA checks are scoped to `[data-dev-member-harness]`. Shell chrome and i18n catalogs are out of scope so “Partner portal” copy elsewhere cannot fail a member screen.

Inventory navigation rejects the application's visible not-found heading even when streaming has already committed HTTP 200. Staff readiness uses one deadline, starting before navigation, for required response headers, JSON bodies and loaded UI. Abandoned navigation disposes the response listeners and timer; late body completion cannot turn a timeout into acceptance. The focused `portal-c-browser-readiness.test.ts` suite also checks deadline sharing and cleanup without hosted services.

## CI

`.github/workflows/dev-member-safety-net.yml` runs on Vercel `deployment_status` (Preview success from `vercel[bot]`), the same trigger shape as Preview smoke. It does **not** cancel Preview smoke.

- Base URL is the preview origin.
- If previews are protected, set repository secret `VERCEL_AUTOMATION_BYPASS_SECRET`.
- **Portal C harness** reports only the credential-free browser lane. **Portal C safety net** aggregates registry, harness, signed-in member/mentor, and master staff comparison for the exact head SHA. Missing, skipped, or in-progress acceptance stays pending; failure, cancellation, or timeout is red. Evidence lookup errors publish an error status. Both the safety-net and staff workflow refresh the aggregate, so whichever finishes last can complete it.
- `workflow_dispatch` supplies a Preview URL and optional exact SHA. Dispatch the workflow from that same commit: if `inputs.sha` targets a different commit from the workflow run's `head_sha`, its results cannot satisfy the exact-head aggregate and acceptance stays pending. The signed-in lane still requires the existing Vercel provenance, branch, and DEMO health guards before exposing credentials.
- **Signed-in member C routes** runs on successful Preview `deployment_status` or explicit `workflow_dispatch`, serialized by the `portal-c-signed-in-e2e-member` concurrency group. It maps `PLAYWRIGHT_MEMBER_EMAIL` / `PLAYWRIGHT_PORTAL_PASSWORD` from `PREVIEW_E2E_MEMBER_*`. Before any credential is sent, the destination must be HTTPS and provenance must show that hostname on project `prj_pfOpwxedCID96oF2hlaE5J7kbNid` / team `team_zTfMkbIIH6ADgy5Hy43MCM5K` for the PR head SHA and branch; `/api/health` must then report that SHA on DEMO `esbdrgaonplpvzmtrdhw`. On `deployment_status`, Vercel sets the deployment ref to the commit SHA, so the branch is the pull request whose head is that SHA. `build:preview` does not write fixture rows. `PREVIEW_POSTGRES_PRISMA_URL` and `PREVIEW_DATABASE_URL` classify as the production pooler and are not read. After the guard, the job presents a GitHub Actions OIDC token to `POST /api/internal/portal-c-member-fixture` on that same preview. The route refuses anything except this workflow, refuses unless `VERCEL_ENV=preview` and the deployment's Prisma URL classifies as DEMO, resets any leftover completion mark, then the job proves the preassessment gate still blocks Job board, temporarily marks only `member-test@workforceap.org` in `portal-qa-september-smoke` complete, and restores that snapshot in `always()`. The read-only `route-fixtures` action then resolves the ungated digital-literacy module, checked-in career brief, existing member-owned counselor session, assigned curriculum lab, and an already approved synthetic mentor in the same QA organization. It never creates enrollments, calls AI, or publishes a mentor. The manifest reaches Playwright through `PORTAL_C_MEMBER_ROUTE_FIXTURES`; absent records remain explicit missing-fixture failures. The job uploads the Playwright HTML report plus PNG screenshots (no traces).
- **Dev member harness on Preview** does not run on the `pull_request` event (that check is skipped until a Preview exists). The same workflow runs it on Preview `deployment_status` and that run is the one that executes the smoke, visual, and logged-out specs.

Pull requests run registry and aggregate reporting. Staff protection additionally requires a `feature/portal-c-` head. Vercel ignores `cook/` heads under the existing `ignoreCommand`, so a review-only successor on that prefix does not trigger the hosted Preview schema bootstraps or fixture adjustments; complete hosted acceptance remains pending. Existing CI (`ci-gate.yml`) is unchanged. Authenticated portal smoke stays nightly / dispatch.

## How later batches use this

1. Stack the batch branch on `feature/portal-c-b0-safety-net` (or the previous batch).
2. Restyle the kit. Point `/dev/member/v/<slug>` full state at the new kit (still fixture-driven). Keep empty / loading / error / first-time honest.
3. Run the smoke. Fix banned copy and blue primary CTAs on the harness surface before updating screenshots.
4. Run `--update-snapshots` for the slugs you changed. The PR diff is the visual review.
5. Do not edit live `/dashboard` loaders unless the batch is explicitly swapping a live kit (B1 hub). B0 never does that.
6. Keep the PR draft. Do not mark ready, merge, or deploy.

## Index

`/dev/member/v` lists every slug and state. Open `/dev/member/v/home?state=empty` (or any other state) without signing in.
