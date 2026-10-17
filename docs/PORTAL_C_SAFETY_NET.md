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
| `dev-member-visual.spec.ts` | no | 1440 and 390 | `toHaveScreenshot` of **full** state (`maxDiffPixelRatio` 0.03; Vercel toolbar masked / skipped) |
| `member-unauth-redirects.spec.ts` | no | n/a | every inventory `/dashboard` path (and `/coach`, `/account/privacy`) redirects to login; aliases redirect to their target or to login when the layout auth-gates first |
| `member-all-routes.spec.ts` | yes (`PLAYWRIGHT_MEMBER_EMAIL` + `PLAYWRIGHT_PORTAL_PASSWORD`) | n/a | logged-in visit of canonical paths plus the ~30 that were missing, plus inventory aliases. Skips without those secrets. Dynamic `[id]` placeholders may 404 after login; that is OK as long as the member does not bounce to `/login`. |

Banned-word and CTA checks are scoped to `[data-dev-member-harness]`. Shell chrome and i18n catalogs are out of scope so “Partner portal” copy elsewhere cannot fail a member screen.

## CI

`.github/workflows/dev-member-safety-net.yml` runs on Vercel `deployment_status` (Preview success from `vercel[bot]`), the same trigger shape as Preview smoke. It does **not** cancel Preview smoke.

- Base URL is the preview origin.
- If previews are protected, set repository secret `VERCEL_AUTOMATION_BYPASS_SECRET`.
- Posts a commit status **Portal C safety net**.
- `workflow_dispatch` can point the same specs at any https origin.

Existing CI (`ci-gate.yml`) is unchanged. Authenticated portal smoke stays nightly / dispatch.

## How later batches use this

1. Stack the batch branch on `feature/portal-c-b0-safety-net` (or the previous batch).
2. Restyle the kit. Point `/dev/member/v/<slug>` full state at the new kit (still fixture-driven). Keep empty / loading / error / first-time honest.
3. Run the smoke. Fix banned copy and blue primary CTAs on the harness surface before updating screenshots.
4. Run `--update-snapshots` for the slugs you changed. The PR diff is the visual review.
5. Do not edit live `/dashboard` loaders unless the batch is explicitly swapping a live kit (B1 hub). B0 never does that.
6. Keep the PR draft. Do not mark ready, merge, or deploy.

## Index

`/dev/member/v` lists every slug and state. Open `/dev/member/v/home?state=empty` (or any other state) without signing in.
