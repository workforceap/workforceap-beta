# Admin Portal — Architecture & API Reference

**Branch:** `feature/portal-design-system` · **PR:** #2068 · **Design source of truth:** `docs/mockups/workforceap-admin-full.html`

How the reskinned admin portal is built so you can extend it without rediscovering the
patterns. Companion docs: `PORTAL_DESIGN_KIT.md` (component contracts), `PORTAL_REDESIGN_PLAN.md`
(rollout), `HANDOFF.md` (infra/staging), `PORTAL_NAV_SPEC.md` (member nav).

---

## 1. Big picture

```
app/admin/layout.tsx                 ← auth guard + org branding; renders the shell
  └─ components/portal/AdminPortalShell.tsx   ← admin-specific props
       └─ components/portal/WorkspaceShell.tsx  ← THE shared chrome (header, rail, drawer, footer)
            ├─ left command rail   ← driven by lib/nav/portalNav.ts (ADMIN_PORTAL_NAV_ITEMS)
            └─ {children}          ← the page (app/admin/<route>/page.tsx)
```

- **One shell for every portal** (`WorkspaceShell`): member, employer, partner, counselor, admin.
  Per-portal wrappers (`AdminPortalShell`, `EmployerPortalShell`, …) just pass `portalRole`,
  `navItems`, labels. The shell owns auth-aware chrome: top header, left rail, mobile drawer,
  collapse, role/impersonation switchers, theme toggle, sign-out, data-driven nav badges.
- **Design kit** lives in `components/portal/kit/` (primitives + page subviews). Pages compose it.
- **Tokens + dark rail** are CSS: `css/portal-tokens.css` (the `--wa-*` design tokens) and
  `css/portal-main-extracted.css` (the staff dark `#161616` command rail, ~line 9346).

---

## 2. The per-page pattern (how every admin page is built)

Each `app/admin/<route>/page.tsx` follows the same shape (template: `app/admin/students/page.tsx`,
`app/admin/jobs/page.tsx`, `app/admin/counselors/page.tsx`):

```tsx
export default async function AdminXPage({ searchParams }: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {                                   // ⚠️ NO `= {}` default — breaks Next's PageProps type-check
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/x');
  if (!(await isAdmin(user.id))) redirect('/dashboard');

  const params = (await searchParams) ?? {};
  if (params.ui === 'legacy') return <LegacyX … />;   // escape hatch: prior workspace, unchanged

  // DEFAULT: lean real data → kit. Promise.allSettled, findMany take:N, count, groupBy.
  // NEVER prisma.$transaction(async tx => …) — it hangs over the Supabase pooler (see HANDOFF §6.3).
  const [rowsR, countR] = await Promise.allSettled([ … ]);
  if (rowsR.status === 'rejected') return <LegacyX … />;   // degrade, don't fabricate

  return (
    <DesignSurface surface="dense">
      <XKit … />
    </DesignSurface>
  );
}
```

Rules:
- **Auth guard stays**, **prior UI preserved behind `?ui=legacy`** (no functionality lost; destructive
  actions — purge, toggles, force-sync — live only in the legacy branch).
- **Lean Prisma only** — `Promise.allSettled`, capped `findMany`, `count`, `groupBy`. No interactive
  transactions, no heavy HTTP at render. Aggregate failures degrade to `0`/`—`, never fabricate.
- **Honest empty states** — empty data renders an empty-state, not sample numbers.
- **Import kit components by path** (`@/components/portal/kit/pages/admin-subviews/XKit`), **not** via
  the barrel `components/portal/kit/index.ts` (parallel edits to the barrel collide). Primitives come
  from the barrel `@/components/portal/kit`.

---

## 3. The design kit (`components/portal/kit/`)

**Primitives** (barrel `@/components/portal/kit`):
| Component | Key props |
|---|---|
| `DesignSurface` | `surface: 'warm' \| 'dense'` — sets `data-surface`; member=warm, staff=dense |
| `SectionHeader` | `title, goal?(subtitle), kicker?(eyebrow), action?` |
| `KpiStrip` / `StatTile` | `items: KpiItem[]` `{label,value,delta?,color?:KitColor,deltaColor?}`, `cols?: 4\|5\|6` |
| `StatusTag` | `children, tone?: 'ok'\|'warn'\|'alert'\|'info'\|'muted'` |
| `DataTable<T>` | `columns: Column<T>[]`, `rows`, `rowKey`, `mobile?: 'cards'\|'scroll'`, `cardRender?`, `emptyTitle?/emptyDescription?` (dense table → stacked cards on mobile) |
| `Avatar` | `initials, size?, gradient?` |
| `BarChartMini` / `RankBars` | `data: ChartDatum[]` / `RankDatum[]` |
| `FeatureTile` | `icon?(ReactNode), title, body?, badge?, tone?, href?` |
| `colorVar(KitColor)` | maps semantic color → `var(--wa-*)`. `KitColor = accent\|accentDark\|gold\|info\|success\|text\|muted` |

**Page subviews** (`components/portal/kit/pages/`):
- `admin/CommandCenterKit` (the `/admin` home, titled **Today**: `title="Today"`, `queuesFirst`, and the
  org-wide `CounselorApprovalQueue` in its `lead` slot — see §4a; `/admin/command-center` keeps the default
  metrics-first layout), `admin/AdminSidebarNav` (a standalone rail — **unused**; the live rail is
  `WorkspaceShell` + CSS, see §5).
- `admin-subviews/`: one `*Kit.tsx` per admin view — `StudentsRosterKit`, `BoardOutcomesKit`,
  `MessagesKit`, `CertificationsQueueKit`, `EmployersDirectoryKit`, `PartnersDirectoryKit`,
  `CounselorsRosterKit`, `MentorsDirectoryKit`, `SubgroupsDirectoryKit`, `ProgramsCatalogKit`,
  `JobsBoardKit`, `AssessmentsKit`, `TrainingProgressKit`, `PlacementsKit`, `PlacementSurveysKit`,
  `AnalyticsKit`, `InvitesKit`, `ProgramChangeRequestsKit`, `SessionsKit`, `PipelineFunnelKit`,
  `WioaScreeningKit`, `CareerMappingsKit`, `ScreeningPacksKit`, `BlogKit`, `UsersKit`, `DuplicatesKit`,
  `CronsMonitorKit`, `AuditLogsKit`, `SystemHealthKit`, `DiagnosticsKit`, `ExportsKit`, `MetricsKit`,
  `WeeklyRecapKit`, `AiEfficacyKit`, `AiToolsAdminKit`, `FeatureFlagsKit`, `EmailCronsKit`,
  `EmailTemplatesKit`, `DataRetentionKit`, `FeedbackKit`, `AgentInboxKit`, `GrowthKit`, `CourseraSyncKit`,
  `AdminDashboardKit`.

**Tokens** (`css/portal-tokens.css`): `--wa-accent` crimson `#ad2c4d`, `--wa-gold`, `--wa-info` blue,
`--wa-success` green; neutrals `--wa-bg/surface/surface-2/text/muted/border`; dark mode flips neutrals
on `html.dark, [data-theme='dark']`. Use `var(--wa-*)` — **never hardcode hex** (dark mode flips tokens).

---

## 4. Navigation data (`lib/nav/portalNav.ts`)

- `ADMIN_PORTAL_NAV_ITEMS: PortalNavItem[]` — the admin rail. Each item:
  `{ href, label, group: NavGroup, Icon?, badgeKey?/badgeKeys?, requiresSuperAdminContext?, parentHref? }`.
  `parentHref` nests the row under a top-level row in the same group (see docs/PORTALS.md, "Sidebar
  sections", for the full table). `navTopLevelItems()` / `navChildrenOf()` read that structure.
- `NavGroup` taxonomy is shared; **admin-only groups** = `dailyWork, runTheOrg, students, programs,
  partnersEmployers, reporting, system` (relabel/reorder these freely without touching other portals;
  `content` is admin-only in practice, `outcomes` is also used by the counselor rail; `students` has no
  admin rows since WAP-190).
- `NAV_GROUP_LABELS` (group → header text), `GROUP_ORDER` (render order; a group renders only if it
  has items), `NAV_GROUP_COLLAPSED_BY_DEFAULT` (sections that start closed — every admin section except
  Daily work) and `NAV_GROUP_ALWAYS_OPEN` (sections with a plain label instead of a disclosure — Daily work).
  Admin sections (queue-first rail, WAP-190): **Daily work** (always open) · Run the org · Programs ·
  Partners & Employers · Reporting · Content · Security & system. Daily work holds the queue-clearing rows:
  Today (`/admin`, exact, `tour-command-center`) · Applications (`/admin/command-center?queue=applications`,
  alias `/admin/command-center`, badge `admin_applications_pending`) · Funding eligibility · Certificates ·
  Program requests · Students (`tour-students`; Subgroups, In-office sessions ⚿, Applications funnel ⚿,
  Find duplicate students ⚿ and Invites nest under it) · Messages ⚿ (Feedback ⚿). Run the org keeps
  Detailed overview. Reporting is one row → `/admin/reporting` with the analytics/outcomes/board pages
  as children. A running guided tour opens every section, so collapsed tour anchors still light.
- `requiresSuperAdminContext: true` items are filtered out for non-super-admins in `AdminPortalShell`.
- Active-route: `lib/nav/activeRoute.ts` (`isActiveRoute`, `getBestActiveHref` = longest matching
  prefix). **WorkspaceShell strips the locale prefix** (`/en`) off `usePathname()` before matching —
  without that, nothing highlights (hrefs are locale-less). Matching is pathname-only: a query-string
  href (Applications) never matches by itself, so it carries a pathname alias.

### 4a. The admin home, Today (`/admin`)

- Kit default, top to bottom (WAP-190): **Waiting on your decision** — every PENDING application and
  every WIOA intake in `pending` / `in_review` with a screening on file, in the actor's org, members only
  (`MEMBER_ONLY_WHERE`), oldest first, the 50 oldest shown with "Showing the 50 oldest of N" and links to
  the rest (`lib/admin/adminApprovalQueue.ts` + `loadAdminApprovalQueue.ts`, same builder and SLA as the
  counselor Today). No `enrolledProgram` condition: applicants are not enrolled yet. Application rows open
  their card on the Applications workbench page they sit on (`?queue=applications&page=N#application-<id>`);
  intake rows open the member record's Eligibility tab (WIOA review panel).
- Then **What needs you today**: applications (waiting on your decision vs waiting on the applicant, the
  oldest age, urgent past the SLA), certificates, new applicants with no counselor (named, each linking to
  the record's Counselor assignment card), replies owed, risk alerts, quiet 30+ days, interview prep.
- Then the KPI strip, placements trend and program / system context. `?ui=legacy` is unchanged.
- The Applications workbench's own count (`getAdminCommandCenter`) is not member-filtered, so it can be
  higher than Today's by the staff / QA accounts with open applications.
- Landing: super_admin sign-in keeps `/admin/*` deep links (`lib/auth/postLoginRedirect.ts`); the weekly
  applicant-aging digest links `/admin/command-center?queue=applications`; `/pwa-start` sends admin before
  counselor. Phone tabs: Today · Students · Messages for super-admins, Today · Students · Applications for
  org admins (`components/MobileBottomNav.tsx`).

---

## 5. The command rail (`WorkspaceShell.tsx` + CSS)

- Rail markup: `.workspace-sidebar` → `.workspace-sidebar-toolbar` (brand/label + collapse) →
  optional `.workspace-sidebar-search` → `.workspace-sidebar-nav` (groups → `.workspace-sidebar-group`
  → `.workspace-sidebar-link` items with `.workspace-sidebar-icon` + `.workspace-nav-badge`) →
  `.workspace-sidebar-footer`.
- **Admin sections** (`components/portal/WorkspaceSidebarSections.tsx`, mounted by WorkspaceShell for
  `portalRole === 'admin'` when the desktop rail is not collapsed): each group header is a
  `<button.workspace-sidebar-section-btn aria-expanded>` (an always-open group gets a plain
  `.workspace-sidebar-section-label` and its list is never hidden); rows with children get a
  `.workspace-sidebar-children-toggle` that opens `.workspace-sidebar-list--children`. Collapsed lists
  stay in the DOM under `[hidden]` (tour anchors and hrefs are always present). State persists in
  `localStorage` (`wa_nav_sections_admin`); the current page's section/parent opens on arrival; every
  section opens while a guided tour runs (`useTour().isOpen`). ArrowRight/ArrowLeft open/close.
  The collapsed icon rail falls back to the flat list (every row, icons only).
- **Staff dark treatment** (`css/portal-main-extracted.css`, block headed `STAFF DARK RAIL`, ~line 9346):
  scoped to `html[data-portal-role]:not([data-portal-role='member'])`. Flat groups (no card chrome),
  **active row = solid crimson** `var(--wa-accent)` + white, hover `#242424`, group labels `#6b6b6b`
  uppercase, **count badges = crimson pills** (white-on-translucent on an active row), section dividers
  `#2a2a2a`. Member portal stays light/warm.
- **Admin-only chrome** (`portalRole === 'admin'`): branded rail header (`.workspace-sidebar-brand` =
  crimson shield tile + "WorkforceAP" + workspace label) and the in-rail `GlobalSearch`
  (`.workspace-sidebar-search`, styled as the mockup's "Search admin…" field). Other staff keep the
  plain label.
- `html[data-portal-role]` is set on `<html>` by WorkspaceShell; that's the hook all the above CSS uses.

---

## 6. APIs the rail/pages depend on

- **`GET /api/portal/nav-badges?role=<role>`** → `Partial<Record<NavBadgeKey, number>>`. WorkspaceShell
  fetches it on mount + on a `wa-nav-badges-refresh` window event; `badgeTotalForItem()` sums an item's
  `badgeKey`/`badgeKeys` to the pill count. Badges are **real counts** (0 ⇒ hidden) — do not hardcode.
  `admin_applications_pending` (Applications row) is the PENDING count Today prints, for an admin of the
  actor's org (or a super-admin) only.
- **`GlobalSearch`** (`components/portal/GlobalSearch.tsx`) — command-palette over members/employers/
  partners/jobs; rendered in the admin rail.
- **Per-page data** comes straight from `lib/db/prisma` in each page's loader (lean queries). A few pages
  reuse helpers: `getBoardSnapshot` (board/outcomes), `lib/admin/cohortAnalytics` (weekly-recap, ai-tools),
  `lib/analytics/aiToolEfficacy` (ai-efficacy), `lib/admin/metrics` (analytics/metrics). Coursera B4B is
  **off in preview** (prod-only creds) — those pages handle it gracefully (no fabricated latency).

---

## 7. Build gates (run these before every push)

`npm run build` = `check-supabase-env.mjs && verify-material-symbols-font-size.mjs && prisma generate && next build`.
Local `tsc --noEmit` is **not** enough — it misses two Vercel-only failures:

1. **Material Symbols verifier** (`scripts/extract-material-symbol-glyphs.mjs --check`): scans source for
   `icon: 'x'` / `icon="x"` string literals and treats them as Material Symbols glyph names. If you use a
   **string `icon` prop as an internal key** (e.g. selecting a lucide icon), name it **`iconKey`** instead —
   otherwise the build fails on a non-glyph token. Run `node scripts/extract-material-symbol-glyphs.mjs --check`.
2. **PageProps type-check**: a Page component's props must satisfy Next's generated `PageProps` — do **not**
   give the props object a `= {}` default (makes it `… | undefined` → build fails). Tests call pages with `{}`.

**Pre-push gate (what actually catches everything):** `npx tsc --noEmit` + `node scripts/extract-material-symbol-glyphs.mjs --check` + `npx next build`.

---

## 8. Staging / safety

- Preview (branch `feature/portal-design-system`) → **demo** Supabase `esbdrgaonplpvzmtrdhw`.
  Production (master) → prod Supabase `jqddnyuszufndwwezdwp`. Guard: `scripts/check-supabase-env.mjs`.
- Preview alias: `https://workforceap-beta-git-feature-p-793c79-mabrown040-5207s-projects.vercel.app`.
  Demo super-admin login: `mabrown040@gmail.com` / (demo password in Vercel env).
- **Never merge to prod without sign-off.** All work is additive / behind `?ui=legacy`; the default
  (no flag) prod-member UI is unchanged.

---

## 9. Status (as of this branch)

- All ~49 plan-scoped admin routes (Tier 1/2/3) render the kit, no error boundary (verified by sweep).
- `/admin/certifications` renders (issue #2070 resolved — demo DB has the columns; client regenerated at build).
- Nav "Students" → kit roster `/admin/students`; legacy `/admin/members` kept as the management hub
  (reachable via `/admin/students?ui=legacy` + Advanced nav).
- Nav "Training progress" → the same kit with `view="training"` (`/admin/training-progress`, also
  `/admin/students?view=training`). `/admin/members/training` redirects there; both legacy tables stay
  behind `?ui=legacy` only.
- Command rail matches `admin-full.html`: branded header, in-rail search, flat groups, crimson active, pills.
- **Out of scope:** member top-nav flatten (#2069). Footer user-identity block (mockup's "Dad (Owner)")
  needs a user-name prop threaded into WorkspaceShell — not yet wired.

---

## 10. Applicant intake triage (auto-review aid)

`lib/admin/applicantTriage.ts` pre-sorts open applications (`PENDING` / `NEEDS_INFO`) into four
buckets from data the applicant already gave us — apply-funnel quick screen
(`apply_eligibility_screenings`), portal WIOA self-screening (`users.wioa_qualification_json`),
profile work-authorization / minor flags, program choice, partner referral, and the staff WIOA
review status. `lib/admin/applicantTriageLoad.ts` is the read-only loader (one `findMany` over the
page's member ids); nothing is written and no columns were added.

| Bucket | Meaning |
| --- | --- |
| **Ready to review** | Contact, program, intake screening and work authorization ("yes") are all on file and the intake answers indicate a funding fit. Reason reads "Intake complete", never "eligible". |
| **Missing information** | Staff already requested info, or name/phone, program, screening answers or the work-authorization answer are missing. |
| **Needs a human look** | Ambiguous: only work authorization was "yes" on the quick screen (the apply screen marks `qualifies` on any one of three yeses, which is not a fit signal), conflicting work-auth answers, program not in catalog, unclear WIOA signal, under-18 applicant, or a staff WIOA review still in progress. |
| **Concern flagged** | Applicant explicitly answered "no" to work authorization, or staff already marked the WIOA review not eligible. |

Precedence: concern > missing > human > ready. Every bucket carries plain-language reasons and a
seven-item checklist (`{key, label, ok}`), all resolved through `admin.applicantTriage.*` in
`messages/{en,fr,pt}.json`.

Where it shows: the Command Center "Applications Pending" queue (chip on each card; the loaded page is
sorted ready → missing info → needs a human → concern, oldest-first inside each bucket), a chip (reasons in
the tooltip) in the **Priority** column of `/admin/members` plus an "Intake triage" page-scoped filter, an
"Intake triage" column on the legacy `/admin/wioa-screening?ui=legacy` table, and a pre-filled checklist
panel on `/admin/members/[id]` above the WIOA self-screening panel.

What it does **not** do: it never approves, denies or changes an application or WIOA status, does not
change who may approve (admins only today), does not touch enrolment gating or dashboard progress
semantics, and does not look for duplicate accounts (use `/admin/members/duplicates`). Tests:
`tests/lib/applicant-triage.spec.ts`.
