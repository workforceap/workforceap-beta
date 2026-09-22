# AGENTS.md

## Repository knowledge and navigation

Start with [the Workforce AP knowledge base](docs/knowledge-base/README.md) and its
[compact agent context](docs/knowledge-base/agent-context.md). It connects every
tracked area to routes, models, dependencies, tests, architecture diagrams and
evidence-backed technical debt. The index under `docs/knowledge-base/generated/` is
build output and is not tracked in Git: run `npm run kb:generate` once per clone before
`npm run kb:query -- "symbol or feature"`. Update the relevant guide and regenerate after
staging source changes, but never stage the generated directory; `npm run kb:test` and
`npm run kb:check` validate the tools, the index and links, and `npm run kb:verify`
runs generation and validation together the way CI does. The existing domain,
deployment and database rules below remain authoritative; static indexes do not
prove live behavior.

## Cursor Cloud specific instructions

This is the production **WorkforceAP Next.js 15 (App Router)** application at [workforceap.org](https://workforceap.org). It includes the public website plus authenticated member, counselor, employer, partner, and admin portals; the former Squarespace site is historical reference material, not the deployment target.

### Running the dev server

```bash
npm run dev
```

Or for production build + serve:

```bash
npm run build && npm start
```

Open `http://localhost:3000` in a browser.

### Project structure

- `app/` — full Next.js App Router application: public/apply journeys, member and staff portals, admin tools, and API routes
  - `layout.tsx` — root layout and tenant-aware application shell
  - `(portal)/` — authenticated member, counselor, employer, and partner surfaces
  - `admin/` — staff administration surfaces
  - `api/` — application, integration, health, and cron route handlers
- `components/` — shared React components (MainNav, MobileBottomNav, Footer, PageHero, CookieConsentBanner, ScrollAnimations)
- `css/main.css` — all styles (imported globally via layout.tsx)
- `public/images/` — static image assets
- `next.config.ts` — Next.js configuration including redirects for old `.html` URLs
- `Caddyfile` — legacy self-hosted reverse-proxy artifact; use the Vercel checklist below for production
- `docs/DEPLOYMENT-CHECKLIST.md` — current Vercel production deployment and rollback instructions
- `DEPLOY.md` — historical homelab static-site deployment notes only
- `docs/COMPLETED-WORK-LOG.md` — shipped tasks (backlog hygiene: `docs/BACKLOG-MAINTENANCE.md`)
- `docs/KIT_GUIDE.md` — **read before touching portal UI**: canonical `--wa-*` tokens (`light-dark()` based), warm/dense surfaces, `KitTone`/`StatusTone` semantics, the `KitBaseProps` contract, kit a11y hooks, and the anti-pattern list

### Blast-radius audit (graph, not a chat)

Playbook: `repo → map → 4 auditors → rank → fix → verify → report → back into the map`.
Skill: `.agents/skills/blast-radius-audit/SKILL.md`. On-disk graph: `graph/`. Rank is `node scripts/audit-rank.mjs` (not an agent). One human step: which fixes ship.

### Lint / Test / Build

```bash
npm run lint          # ESLint (~~5 known errors~~ — Burned down 2026-05-20, gate flipped)
npm run typecheck     # TypeScript type-checking (tsc --noEmit)
npm run test:unit     # Node.js library tests; logs explicit skips/delegations
npm run test:vitest   # Vitest component/API suites + registered library suites
npm run build         # Full production build (Prisma generate + next build)
```

Note: `npm run build` runs ESLint at build time (gate flipped 2026-05-20 — `eslint.ignoreDuringBuilds: false`). Use `npm run typecheck` and `npm run lint` separately for faster feedback during development.

#### OpenClaw Pilot production-build lane

On the 16 GiB OpenClaw Pilot host, run at most one heavy application job at a time. The validated local production-build command is:

```bash
NODE_OPTIONS=--max-old-space-size=6144 npm run build
```

This is a scoped local heap allowance for the Next.js build, not a change to CI, generic preflight commands, other workers, or global memory settings.

Register library suites importing Vitest in `scripts/vitest-library-specs.mjs`.
Both runners share that registry; `tests/test-runner-coverage.test.ts` guards
ownership and collection. Run both test lanes, not just `npm test` (Node only).

### Environment notes

- Dependencies are restored on startup by the update script (`corepack pnpm@10 install --frozen-lockfile`), whose `postinstall` runs `prisma generate`. No manual install step is needed before running the app.
- Prisma generates with a placeholder DB URL when no `DATABASE_URL` / `POSTGRES_PRISMA_URL` is set, so install and `npm run build` succeed without credentials (the build does not execute runtime DB queries).
- The homepage redirects from `/` to `/en` (i18n locale prefix). Use `curl -L http://localhost:3000/` to follow the redirect.

#### A running Postgres is required to serve pages (not just portal/auth)

The root layout (`app/layout.tsx` → `lib/tenant/organization.ts`) queries `prisma.organization` for the default org on **every** request, so even the public marketing pages (`/en`, `/en/programs`, `/en/faq`, …) return **HTTP 500** at runtime unless a Postgres DB is reachable and the default org (slug `workforceap`) is seeded. (This supersedes any older note claiming marketing pages run with no external services.)

#### Local Postgres setup (Cursor Cloud)

A local PostgreSQL 16 server is installed in the VM for development. After a fresh VM boot, start it and verify the DB before running the app:

```bash
sudo pg_ctlcluster 16 main start   # start the cluster (idempotent; ignore "already running")
pg_lsclusters                      # should show 16/main online on port 5432
```

DB connection is configured via gitignored `.env.local` and `.env` (Next reads `.env.local`; the Prisma wrapper `scripts/prisma-env.js` reads `.env`), both pointing at:
`postgresql://wap:wap@127.0.0.1:5432/workforceap` (role `wap` / db `workforceap`).

If the DB/schema/seed is missing (e.g. fresh DB), create the schema and seed the default org + demo data with:

```bash
npm run db:push    # syncs schema.prisma directly (NOT migrate — see below)
npm run db:seed    # upserts default org `workforceap`, roles, programs, demo jobs, blog
```

**Clean migration replay is unsupported.** A disposable-database audit on 2026-09-09 reproduced both the duplicate `partner_users` migration (`P3018` / PostgreSQL `42P07`) and, after verifying and resolving only that duplicate locally, an invitations foreign key referencing `subgroups` before its later creation (`42P01`). Production's `build:with-migrate` recovery runners do not make fresh replay supported. Use `db:push` only for disposable development fixtures; it omits migration-only security DDL such as RLS policies and SQL triggers and is not a production recovery procedure. Preserve historical migration files/checksums and follow [docs/DATABASE-RECOVERY.md](docs/DATABASE-RECOVERY.md) for preflight and recovery limits.

#### Features that still need external credentials (degrade gracefully)

These render their UI but fail at the action step without the listed secrets:
- **Career quiz / find-your-path / interest profiler** — need `ONET_API_KEY` (scoring returns "Career matching tools are not configured").
- **Contact form** (`/api/contact`) — needs `RESEND_API_KEY` (returns 503 otherwise).
- **Apply / signup + all portal/auth pages** (`/dashboard/*`, `/admin/*`, `/employer/*`, …) — need Supabase creds (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
- **Donate** — needs Stripe keys.

A good credential-free smoke test of core functionality is the interactive program comparison tool at `/en/program-comparison` (select 2+ programs → side-by-side matrix; fully client-side over the seeded catalog).

## Stitch MCP (designs)

Use the **Google Stitch MCP** from Cursor when you need authoritative UI reference or new screens before coding. Cursor should use the **hosted MCP tools** (not the shell CLI) unless you are outside Cursor.

### Project and docs

- **Stitch project ID:** `18255988866302206897`
- **CLI / Bearer token / screen ID table:** [.stitch/STITCH-MCP-PROTOCOL.md](.stitch/STITCH-MCP-PROTOCOL.md)
- **Refreshing API access / canvas workflow:** [.stitch/STITCH-REFRESH-PROTOCOL.md](.stitch/STITCH-REFRESH-PROTOCOL.md)
- **Dark Stitch reference HTML (layout/shell only):** [.stitch/golden-screens-stitch-dark.json](.stitch/golden-screens-stitch-dark.json) — replace fictional “Civic Bridge” copy with WorkforceAP in product.

### Auth (do not commit keys)

- **Cursor MCP:** configured with `X-Goog-Api-Key` — set environment variable `GOOGLE_STITCH_API_KEY` (see your user `mcp.json`).
- **CLI `stitch-mcp`:** uses `STITCH_API_KEY` Bearer flow as documented under `.stitch/`.

### When to call Stitch MCP

**Use it when:**

- Building or refactoring **marketing or portal UI** that must **match Stitch mocks** (mobile/desktop parity, spacing, components).
- There is **no local spec** and you need a **first design** or variant before implementation.
- You need **design system** tokens (fonts, colors, roundness) to align `tailwind.config.ts` and `css/main.css` with Stitch.

**Skip it when:**

- The work is **logic, API, or database only** with no visual contract.
- The page already matches production and the change is a **small copy or bugfix** with no design ambiguity.

### Recommended MCP tool order (in Cursor)

1. **`mcp_stitch_list_projects`** (optional) — confirm access and discover project IDs if needed.
2. **`mcp_stitch_list_screens`** with `projectId: "18255988866302206897"` — find screens by title or id.
3. **`mcp_stitch_get_screen`** — use resource name `projects/18255988866302206897/screens/<screenId>` (see screen ID table in `STITCH-MCP-PROTOCOL.md`).
4. **`mcp_stitch_generate_screen_from_text`** or **`mcp_stitch_edit_screens`** — new screens or iterations from a precise prompt.
5. **`mcp_stitch_list_design_systems`** then **`mcp_stitch_apply_design_system`** — align multiple screens to one design system.

Implement the resulting layout and copy in `app/` and `components/`; treat Stitch output as the design source of truth when the task says to match Stitch.

## Design intelligence & review skills (use with all UI work)

Two skill packs are wired into this repo — pair them with the kit guide, Astryx workflow, and Stitch MCP on every UI task:

- **UI/UX Pro Max** (`.cursor/skills/ui-ux-pro-max/`, from [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill), installed via `npx -y ui-ux-pro-max-cli init --ai cursor`): searchable design database (67 styles, 161 palettes, 57 font pairings, 99 UX guidelines, 25 chart types). Query it BEFORE building new surfaces, e.g.
  `python3 .cursor/skills/ui-ux-pro-max/scripts/search.py "<what you're building>" --design-system -s nextjs` (domain searches: `-d style|ux|chart|typography`). **Guardrail:** its palette/font output is advisory inspiration only — production colors/typography still come from the `--wa-*` tokens (`docs/KIT_GUIDE.md`) and the Astryx token layer; never paste its hex palettes into components. Its UX guidelines and chart-type/a11y recommendations apply directly.
- **Design review** (`.agents/skills/design-review/SKILL.md`, adapted from [garrytan/gstack](https://github.com/garrytan/gstack), MIT): designer's-eye QA → fix → verify loop — UX laws, an 80-item checklist, landing vs app-UI hard rules, and the AI-slop blacklist. Run it before shipping significant UI and whenever asked to "polish"/"audit" design. The full gstack suite (23 skills: /review, /qa, /ship, …) targets Claude Code and is NOT vendored; clone `https://github.com/garrytan/gstack` to /tmp if you need its other playbooks for reference.
- **Blast-radius audit** (`.agents/skills/blast-radius-audit/SKILL.md`): repo → map → 4 isolated auditors → rank-as-code → fix top slice → verify per patch → report → accepted findings become `graph/rules.json`. Cut by blast radius, not folders. Human gate: which fixes ship. Schema/ranker/check are frozen nodes (`graph/SCHEMA.md`).

## Astryx design system (site-wide, coexistence rules)

The Astryx packages (`@astryxdesign/core`, `@astryxdesign/theme-neutral`, `@astryxdesign/cli`) are installed and loaded site-wide, superseding the earlier non-adoption note in `docs/ASTRYX_LESSONS.md`. How the two systems coexist (full policy: `docs/KIT_GUIDE.md` §9):

- `@astryxdesign/core/reset.css` + `astryx.css` are imported once in `app/layout.tsx`. Both ship inside CSS cascade **layers**, and layered styles always lose to the app's unlayered CSS — so the 11 token names shared with the legacy family (`--color-accent`, `--color-error`, `--color-border`, …) keep the app's values, which brand-aligns Astryx components (crimson accent) automatically. Do NOT re-import these files elsewhere or wrap them in different layer names.
- Astryx dark mode needs no provider: components resolve `light-dark()` via `color-scheme`, which the existing theme system (`ThemeInitScript` / `useTheme`) already flips. Mount `<Theme>` only to demo alternate themes (see `app/dev/astryx/theme-provider.tsx`).
- **Which system for what:** new overlay/command/form surfaces → Astryx components (`Dialog`/`AlertDialog`, `CommandPalette`, `Banner`, `Toast`, form inputs). Domain composites stay in the `--wa-*` kit; generic Astryx primitives may be composed inside kit pages under the boundaries in `docs/KIT_GUIDE.md` §9. Preserve the guide's specific directory-empty and table-cell contracts. Shipped Astryx surfaces: `components/admin/ConfirmDialog.tsx`, `components/portal/GlobalSearch.tsx`, `app/dev/astryx/**` lab (templates: dashboard, grouped table, settings).
- Before writing any Astryx UI, use the CLI discovery workflow in the generated block below — do not invent props.

<!-- ASTRYX:START -->
Astryx v0.1.3 · 149 components
CLI: run every command as `pnpm exec astryx <cmd>` (shown below as `astryx ...`).

SETUP (once, in your app entry e.g. main.tsx) — without these, components render unstyled:
  import "@astryxdesign/core/reset.css";
  import "@astryxdesign/core/astryx.css";

WORKFLOW — discover, don't guess. Before writing UI:
1. `astryx build "<idea>"` — START HERE: returns a kit (closest [page] + [block]s + [component]s). No args = full playbook.
2. `astryx template <name> [--skeleton]` — scaffold the [page]/[block]s it named, or study their layout. Templates are reference code.
3. `astryx component <Name>` — props + examples for every component you use.

RULES:
- No <div> — components do all layout/spacing. Full page → AppShell; sidebar nav → SideNav.
- Frame first: pick the shell (AppShell / Layout+LayoutPanel) and budget regions in px BEFORE writing content (`astryx docs layout`).
- Dense data = rows (Table, List/Item) edge-to-edge — never Card-wrapped list items. Card = dashboard widgets, galleries, settings groups only.
- Status → StatusDot/Token; Badge only for counts and enumerated states, never decoration.
- Custom styling: component props first; else Tailwind utilities backed by tokens (bg-surface, text-primary, rounded-lg) via tailwind-theme.css. No raw hex/px.
- Tokens for every value (`astryx docs tokens`). Brand/accent via `astryx theme` — never override --color-* in :root.

MORE CLI:
  search "<query>"   find any component / hook / doc / template / block
  component --list   149 components by category
  template --list    page + block recipes
  docs <topic>       color, elevation, icons, illustrations, layout, migration, motion, principles, shape, spacing, styling, theme, tokens, typography
  swizzle <Name>     eject component source for deep customization
  upgrade --apply    run after any @astryxdesign/core bump
<!-- ASTRYX:END -->

## Shared operating lanes

Read `docs/two-lanes.md` for provider-independent execution, ownership, release records and lab handoff. Existing app-specific deployment and database recovery rules above remain authoritative.
