# E2E Smoke Tests

Fast, stable smoke tests for critical public user flows. Run these before deploying or after any change that touches routing, auth, or core page layouts.

## What’s Covered

| Spec | What it checks |
|------|---------------|
| `smoke/homepage.spec.ts` | Homepage loads, hero + program cards + footer visible |
| `smoke/login.spec.ts` | Login page loads, form fields render, links to signup/recovery |
| `smoke/programs.spec.ts` | Programs catalog loads, cards visible, apply CTA present |
| `smoke/apply.spec.ts` | Apply page loads, form area + sidebar render |
| `partner-signup-viewports.spec.ts` | `/partner-signup` lands on `/partners#partner-signup` by document navigation at 390, 768 and 1280 wide, no aborted navigation (WAP-118) |

These are **unauthenticated** smoke tests — no credentials required.

### Authenticated portal hub smoke (optional)

`portal-hub-smoke.spec.ts` covers **login → hub → one deep link** for member
(`/dashboard` → `/dashboard/jobs`), counselor (`/counselor` → `/counselor/inbox`),
and employer (`/employer` → `/employer/applications`). Each role soft-skips when
its `E2E_<ROLE>_EMAIL` / `E2E_<ROLE>_PASSWORD` pair is missing.

```bash
# Against the trusted isolated preview (DEMO Supabase; same origin as PREVIEW_SITE_URL)
PLAYWRIGHT_BASE_URL=https://<exact-preview-origin> \
E2E_MEMBER_EMAIL=… E2E_MEMBER_PASSWORD=… \
E2E_COUNSELOR_EMAIL=… E2E_COUNSELOR_PASSWORD=… \
E2E_EMPLOYER_EMAIL=… E2E_EMPLOYER_PASSWORD=… \
npm run test:e2e:portal-hubs
```

Or dispatch **Authenticated Portal Smoke** → `hub_smoke` on trusted `master`
(WAP-66 / `.github/workflows/authenticated-portal-smoke.yml`). Not part of PR
`ci-gate`. Prefer the full five-role `audit:portal` matrix for release evidence.

## Requirements

- Node.js 20+
- Dev server running on `http://localhost:3000` **or** set `PLAYWRIGHT_BASE_URL`

## Run

```bash
# Run all e2e tests (Playwright will start dev server automatically if local)
npm run test:e2e

# Run only smoke tests
npx playwright test tests/e2e/smoke

# Run with UI mode for debugging
npm run test:e2e:ui

# Run against staging/prod
PLAYWRIGHT_BASE_URL=https://www.workforceap.org npx playwright test tests/e2e/smoke
```

## Viewports

- **Desktop**: 1280×720 (Chrome)
- **Mobile**: Pixel 5 emulation (393×851, touch-enabled)

## CI

In CI, the config disables the local web server, runs with 1 worker, and retries 2×.

`.github/workflows/nightly-e2e.yml` (manual dispatch today; nightly once WAP-66 lands) runs the credential-free, read-only specs (`tests/e2e/smoke/**` and `partner-signup-viewports.spec.ts`) against production, and once scheduled opens a `Nightly: Public E2E failing` issue when a scheduled run fails (WAP-204; see `docs/SLO-AND-STATUS.md`, "Nightly heavy suites"). Only add a spec there if it signs in to nothing and creates no data.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Error: page.goto: net::ERR_CONNECTION_REFUSED` | Start dev server with `npm run dev` or let Playwright start it |
| Tests fail on first run | Playwright browsers may need install: `npx playwright install` |
| Screenshots missing | Screenshots are captured only on failure; check `test-results/` |
