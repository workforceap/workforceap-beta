# Portal Kit Guide

> Agent-facing guide to the portal design kit, produced by the Astryx pattern-mining study
> (`docs/ASTRYX_LESSONS.md`). Linked from `AGENTS.md` and from the header of
> `components/portal/kit/index.ts`.

**Audience:** any engineer or AI agent touching portal UI. Read this before writing portal
components — it exists so you don't rediscover the token families, surface modes, and status-color
semantics from scratch.

**Prime directives**
1. Compose from `components/portal/kit/*` — don't rebuild primitives.
2. Semantic tokens over hardcoded values — no raw hex, no raw px for radius/padding/shadow.
   (Enforced by ESLint in `components/portal/kit/**`: warn locally, error in CI.)
3. When starting a page, copy the nearest example in `components/portal/kit/pages/**` rather than
   composing from a blank file.
4. If you change kit behavior, update the file's header comment and this guide in the same change.

The admin Agent Inbox's "Needs review" count includes both unexpired drafts
awaiting approval and approved cascades with incomplete delivery. Delivery
rows stay visible for retry or staff reconciliation; provider acceptance is
not labelled as confirmed inbox delivery.

---

## 1. Token families — which one to use

There are **two** live CSS-variable families in this codebase. Only one is canonical for new work.

| Family | File | Status |
|---|---|---|
| `--wa-*` | `css/portal-tokens.css` | **Canonical.** Use this for all kit/portal work. Its mode-constant brand hues (accent / gold / info / success / danger, hero pairs, soft tints) are defined in `css/wa-brand-tokens.css`, which it `@import`s and which `app/layout.tsx` also loads on every route so `css/astryx-brand-bridge.css` resolves to computed values on the public site (WAP-106). Neutrals, `color-scheme`, density and motion stay portal-only. |
| `--color-*`, `--surface-container-*` | `css/main.css` | Legacy (MD3-style). Do not add new refs; bridge aliases in `portal-tokens.css` map the live names onto `--wa-*`. Caution: its `:root` holds **dark** values with light as the override — the opposite convention from `--wa-*`. |
| `--dm-*` | — | **Deleted** (was `css/dark-mode.css`). Never reintroduce. |

Key `--wa-*` tokens (see `css/portal-tokens.css` for the full set):

- **Brand (constant across modes):** `--wa-accent` (brand magenta) / `--wa-accent-dark` /
  `--wa-accent-soft` / `--wa-on-accent`, `--wa-gold(-dark|-soft)`, `--wa-info(-soft)`,
  `--wa-success(-soft)`, `--wa-danger(-soft)`, `--wa-violet`.
- **Text-bearing hero gradients:** `--wa-hero-crimson(-dark)` and
  `--wa-hero-gold(-dark)` stay dark in both themes and pair with `--wa-on-hero`.
  A white hero action uses `--wa-hero-action-bg` and `--wa-hero-action-text`;
  do not substitute the theme-adaptive solid-control foreground. Categorical
  KPI totals use neutral text; retain semantic color for an actual state
  (the counselors roster colours "At-Risk Owned" only while it is above zero).
- **Neutrals (flip in dark mode):** `--wa-bg`, `--wa-surface`, `--wa-surface-2` (raised
  fill: icon tiles, chips), `--wa-text`, `--wa-muted`, `--wa-border`, `--wa-track`, plus the
  sidebar set (`--wa-sidebar-*`, dark chrome in both modes). `--wa-bg-wave` is the shared
  member canvas (accent/gold wash on `--wa-bg`); `--wa-shell-header-bg` is the translucent
  sticky nav so the wash continues through the header. Member header and mobile
  nav borders stay transparent; `PageOpener` is never recut as a title bar.
  Appearance lives once in the rail/drawer, with its selected segment melting
  into the rail rather than sitting on a second slab. Header text actions sit
  directly on the chrome (`.wa-shell-text-action`) rather than in outline chips.
  Member section controls use `.wa-page-tabs` so Astryx tabs also read as states
  on the wash, not another title bar. Do not paint a second wash on
  `[data-surface]` inside `.workspace-shell-root`. Member navigation and
  `PageOpener` labels use sentence case; keep intentional names such as
  “AI Career Tools” intact.
  **One name per member destination (WAP-102):** `/dashboard/ai-tools` is
  “AI Career Tools” and `/dashboard/jobs` is “Job board” everywhere a member
  can read it — rail (`lib/nav/portalNav.ts`, `MEMBER_TOOLKIT_HUB_LABEL`),
  `nav.careerToolkit` / `nav.jobBoard` and `dashboard.careerToolkit` /
  `dashboard.jobBoard` catalogs, page `<title>`, `PageOpener` title,
  `ToolkitToolChrome` kicker and back link, breadcrumbs, home quick links,
  help/guide CTAs. Do not reintroduce “Career Studio”, “Career Toolkit”,
  “AI Tools” or “Pipeline” as names for those two routes; a kicker above the
  hub uses the rail group noun (“Tools & careers”), never a second name.
  **Member identity (WAP-101):** the member shell shows who is signed in as
  one link — kit `Avatar` (saved profile photo or initials) + full name (+
  email) — to Profile & settings, in the header (avatar only below 769px) and
  again in the drawer footer. It replaces the generic “My account” chip and is
  never the sign-out control; Sign out stays its own button. Data comes from
  `buildMemberShellIdentity` (`lib/member/memberIdentity.ts`) fed by the
  dashboard layout's existing user query; nothing is inferred beyond the
  email fallback.
  Member rails use a 232px budget (208px on smaller laptops, 72px collapsed),
  with Home, My program, Job board, My progress, AI Career Tools, Messages,
  and Skill missions visible and remaining Tools / Training / Account groups
  disclosed on demand.
  The current route opens its group and only the most specific destination
  receives `aria-current`. Staff rails use 240px and the shared desktop header
  uses a 68px minimum height. Destination lists scroll independently so appearance
  and language remain reachable at the foot of the expanded rail. Collapsing any
  rail hides its preference controls; expanding restores them. Appearance options
  stack their icons above labels to fit the rail, with radio-keyboard behavior
  intact. Navigation labels stay readable at 16px with 44px targets; desktop brand
  and public-site link share one header row.
  The portal site footer (`.dashboard-site-footer`) is in-flow at the end of
  `.workspace-shell-main-inner`, after `.workspace-shell-main-body`. Not a
  sticky/fixed sibling of the stack. Do not pin it with `position: sticky` /
  `fixed` or `margin-top: auto` on `.workspace-shell-main--stack` **or** the
  inner column — that paints the legal strip over Save screening and Next steps.
- **Type floors (flip per surface):** `--wa-type-body` (16px warm / 14px dense) and
  `--wa-type-meta` (13px both). Member body copy, form controls, and CTAs use
  `--wa-type-body`. Kickers, tags, table headers, and captions use `--wa-type-meta`.
  Do not set kit metadata below 13px. The floor is enforced repo-wide by
  `scripts/lint/check-type-floor.mjs` (part of `npm run lint`): any literal
  `font-size` / `fontSize` / `wa-text-[…]` that resolves below 13px fails lint,
  `wa-text-xs` is 13px (`tailwind.config.ts`), and `--fix` raises offenders to
  the floor. Prefer the type tokens over any literal; `em`/`%` are not judged.
  Member pills use `.wa-kit-cta` /
  `.wa-kit-cta--ghost` (44px, `--wa-type-body`) instead of a 13–14px inline size.
  Lesson-start and other “must look like a button” member actions use
  `.wa-kit-cta--xl` (52px, full-width on mobile) with `.wa-kit-cta--block`.
  Legacy `.btn` markup that still exists on member routes is retargeted inside
  `.workspace-shell-root[data-workspace-role='member']` (WAP-105, `css/portal-kit.css`):
  `.btn-primary` draws as `.wa-kit-cta`, `.btn-secondary` / `.btn-outline` / `.btn-muted` as
  `.wa-kit-cta--ghost`, `.btn-ghost` / `.btn-tertiary` as `.wa-page-action`, `.btn-large` as
  `.wa-kit-cta--xl`, and `.btn-sm` / `.btn-small` no longer shrink below 44px or
  `--wa-type-body`. Card kickers (`.portal-dash-section-header__title`) share the
  `.wa-kit-stat-label` treatment, card titles share one 1.0625rem/700 size, and member status
  pills use `.wa-kit-tag--ok` / `--warn` / `--muted` rather than hand-colored badges. New member
  work should still compose the kit classes directly; the retargeting is for existing markup.
  Solid accent pills pair `--wa-accent` with `--wa-on-accent-control`; the
  foreground adapts in dark mode. `--wa-on-accent` remains white for existing
  gradient/hero contexts and must not be globally replaced with the control
  foreground. Ghost buttons use `--wa-control-border`, not the low-contrast
  decorative `--wa-border`. Small tinted status labels use
  `--wa-accent-text`, `--wa-info-dark`, `--wa-success-dark`, or
  `--wa-gold-dark` with their matching soft tint.
- **Shape / density / pop (flip per surface, §2):** `--wa-radius`, `--wa-radius-sm`, `--wa-pad`,
  `--wa-pad-sm`, `--wa-pop`, `--wa-shadow`, `--wa-shadow-lg`.
- **Motion (§7):** `--wa-dur-fast` (120ms) / `--wa-dur-base` (200ms) / `--wa-dur-slow` (300ms) +
  `--wa-ease`; all zeroed under `prefers-reduced-motion`.
- **Z-index scale:** `--z-sticky` (10) < `--z-nav-drawer` (100, a 20-unit *band*: overlay/panel/
  toggle) < `--z-modal` (1100) < `--z-tour` (5000) < `--z-toast` (9999). Never invent a z-index
  literal; pick from this scale.

In TSX, prefer the typed helper over raw `var()` strings:

```ts
import { colorVar } from '@/components/portal/kit'; // components/portal/kit/tokens.ts
colorVar('accent'); // -> 'var(--wa-accent)'
// KitColor = 'accent' | 'accentDark' | 'gold' | 'info' | 'success' | 'text' | 'muted'
```

Tailwind is configured with the **`wa-` prefix** (`tailwind.config.ts`) — utilities look like
`wa-flex wa-items-center`. Unprefixed Tailwind classes silently do nothing.

---

## 2. Surface modes: `warm` vs `dense`

The kit has one design language with **two densities**, switched by a `data-surface` attribute
that the token layer reads (`css/portal-tokens.css`). Brand colors are identical in both;
only radius / padding / pop / shadow change.

| Mode | Who | Feel | Values |
|---|---|---|---|
| `warm` | Member-facing routes | Bold + calm: soft corners, generous space, gradient "pop" tiles on | radius 26/16, pad 28/18, `--wa-pop: 1` |
| `dense` | Admin / staff / data / rosters / queues | Compact, sharp, pop off | radius 12/8, pad 16/12, `--wa-pop: 0` |

Wrap the **route-group layout**, not individual components:

```tsx
import { DesignSurface, useSurface } from '@/components/portal/kit';

<DesignSurface surface="warm">{children}</DesignSurface>   // member
<DesignSurface surface="dense">{children}</DesignSurface>  // admin / staff / data
```

`useSurface()` returns `'warm' | 'dense'` for the rare component that must branch in JS
(default is `'dense'` if unwrapped). Components should normally *not* branch — consuming
`--wa-radius`/`--wa-pad`/`--wa-pop` makes them adapt automatically. Spec:
`docs/PORTAL_DESIGN_KIT.md`.

---

## 3. Dark mode

- Every mode-dependent `--wa-*` token is a **single `light-dark(light, dark)` declaration** in
  `css/portal-tokens.css`, resolved natively by the browser via the CSS `color-scheme` property.
  `:root` sets `color-scheme: light`; `html.dark, [data-theme='dark']` flips it to `dark` — that
  one line is the entire dark theme. There is **no duplicated dark variable block**; a token
  cannot exist in light but be missing in dark.
- The theme system (`components/theme/ThemeInitScript.tsx` + `lib/hooks/useTheme.ts`) keeps
  `html.dark` mirroring the effective mode, including "system", so the class is always
  authoritative.
- **Never** hand-write a dark variant of a color. If you consume `--wa-*` tokens, dark mode is
  automatic. If a component needs a tinted background, use
  `color-mix(in srgb, var(--wa-x) 15%, transparent)` — alpha tints work on both modes (this is
  the pattern in `lib/ui/statusColors.ts` and the `.wa-kit-tag--*` classes). If a value genuinely
  needs different colors per mode (rare — e.g. WCAG-tuned tag foregrounds), write one
  `light-dark(a, b)` pair, not an `html.dark` override.
- The canvas **outside** the shell is part of dark mode too. `WorkspaceShell` marks the document
  with `html[data-portal-role]` (inline at parse time and on mount) and `css/portal-kit.css` paints
  `<html>`/`<body>` with solid `--wa-bg` for that document, out-ranking the marketing site's
  `html.dark body` cool grey. The strip below a short page, rubber-band overscroll and the body seen
  through the translucent header therefore continue the shell's warm canvas (WAP-153). Do not paint
  the wave on body — the radial washes fade into `--wa-bg`, so the solid token is the seam-free
  continuation. The member cream `--wa-bg` override in the bridge applies to
  `html[data-portal-role='member']` as well as `[data-surface='warm']`.
- Admin and staff surfaces read semantic state through `--wa-*` only: `--wa-info-dark` /
  `--wa-success-dark` / `--wa-gold-dark` for text, the base hue for icons, fills and `color-mix`
  tints. The legacy `--color-blue` / `--color-green` / `--color-gold` are pinned or only
  scope-aliased and never adapt (gold is the same hex in both themes);
  `lib/ui/adminSemanticTokens.test.ts` fails on any new reference under `app/admin` or
  `components/admin` (WAP-133).
- Elevation in dark mode comes from shadows plus a 1px **inset bezel highlight** baked into
  `--wa-shadow`/`--wa-shadow-lg` (transparent in light) — not from lighter surface tones. Do not
  add new surface-tone variables; `--wa-surface` and `--wa-surface-2` are the whole ladder.

---

## 4. Status colors — two systems, one mapping (read this twice)

There are two status vocabularies. Don't invent a third.

**Kit `KitTone`** (`components/portal/kit/tokens.ts`) — used by `<StatusTag tone=…>` via
`.wa-kit-tag--*` classes in `css/portal-kit.css`:

| tone | color | meaning |
|---|---|---|
| `ok` | green | healthy / complete |
| `warn` | gold | attention soon |
| `alert` | brand magenta (`--wa-accent`) | "needs a look" — brand-colored attention |
| `danger` | true red (`--wa-danger`) | destructive / error / failed / rejected |
| `info` | blue | neutral information |
| `muted` | gray | inactive / default |

**`alert` vs `danger` is deliberate**: a failed/rejected row must not read as just another
brand-magenta highlight — use `danger` there (see the note in `tokens.ts`). When kit tones
feed Astryx `Token` (`astryxMap.toneToTokenColor`), `alert` maps to `pink` and `danger` maps
to `red`. Do not map both to `red`.

**App-wide `StatusTone`** (`lib/ui/statusColors.ts`) — `success | warning | danger | info |
neutral`, returning `{ fg, bg, border }` triples for badges/chips outside the kit. **Gotcha:** its
`danger` intentionally resolves to brand magenta `--color-accent` ("at risk / rejected" *status*),
NOT `--wa-danger`; true red is reserved for destructive *action* affordances (e.g. ConfirmDialog's
confirm button). Rationale is in the file header — don't "fix" it.

Mapping when converting components: `success↔ok`, `warning↔warn`, `danger(status)↔alert`,
`info↔info`, `neutral↔muted`; kit `danger` (true red) has no `StatusTone` equivalent on purpose.

**Tone hooks** (`.wa-kit-tone--<tone>` in css/portal-kit.css) let a card or row declare its tone once;
`.wa-kit-tone-edge`, `.wa-kit-tone-icon` and `.wa-kit-tone-text` then paint from `--wa-kit-tone` /
`--wa-kit-tone-soft`. Use them (with `StatusTag`) instead of `colorVar('gold')`-style inline colours
when the tone is a *state* (a triage bucket, a risk tier); numbers stay neutral `--wa-text`.

Use `lib/ui/statusToneAdapters.ts` at these boundaries instead of copying color triples.
`StatusBadge` reads the same palette as `statusColor`; its `error` and `accent` variants
both preserve the legacy attention meaning. Partner overview pills are `StatusTag` on every
reachable path (kit default and `?ui=legacy`), not `StatusBadge`. Do not infer a reverse conversion for kit
`danger`: keep genuinely destructive/failed kit statuses on their existing red path.

| Legacy StatusTone | StatusBadge variant | KitTone | Astryx Token |
| --- | --- | --- | --- |
| success | success | ok | green |
| warning | warning | warn | yellow |
| danger (attention) | error / accent | alert | pink |
| info | info | info | blue |
| neutral | neutral | muted | gray |
| no equivalent | no equivalent | danger | red |

Legacy `PortalEmptyState` delegates its content to `KitEmptyState`. Set `headingAs="h2"`
when an empty section directly follows the page h1; the default h3 is retained for
empties inside an existing h2 section. Preserve the distinction between a failed load
and a confirmed empty result. Keep existing directory empties on `KitEmptyState`.

---

## 5. The `KitBaseProps` contract

Every kit primitive accepts `className`, `style`, `ref` (plain prop, React 19 style — no
`forwardRef`), and `data-*` passthrough on its root element
(`components/portal/kit/base.ts`). Rules:

- **Consumer overrides always win.** Merge order is internal classes/styles first, consumer
  `className`/`style` last — everywhere, no exceptions.
- Need a margin tweak or a `data-testid`? Pass it to the component. **Do not wrap kit components
  in a div** just to attach a class or test id.
- New kit components must extend `KitBaseProps<RootElement>` (+ `KitDataAttrs`) and use the `cx()`
  helper for class merging. There is intentionally no `asChild`, no polymorphic `as`, and no
  style-slot props.

---

## 6. Component index (`components/portal/kit/index.ts`)

Foundation: `DesignSurface` / `useSurface`, `colorVar` + `KitColor`/`KitTone` types,
`KitBaseProps` / `KitDataAttrs` / `cx` (§5).

| Component | Use for |
|---|---|
| `StatTile`, `KpiStrip` | single stat / row of stats (never hand-roll stat blocks) |
| `StatusTag` | semantic status pill (every table status column, risk tiers) |
| `JobListingRow` | member open-role listing row (live `/dashboard/jobs` + board proof — not `.job-card` mosaics). `MemberJobsKit` lists the live openings itself under `#open-roles` (`openRoles`, each linking to `/dashboard/jobs/<id>`); "Browse openings" / "Browse jobs" jump to that list, never to `?ui=legacy`. An empty list is the honest `JOBS_BOARD_EMPTY` state. |
| `KitEmptyState` | titled empty placeholder for listing and table shells (optional `action` = real next step). Admin directory empties (`MentorsDirectoryKit`, `PartnersDirectoryKit`, `EmployersDirectoryKit`, `SubgroupsDirectoryKit`) use this + sentence-case CTA copy from `lib/member/mentorsEmptyState.ts` / `lib/admin/directoryEmptyState.ts` — not Astryx `EmptyState`. |
| `SectionHeader` | titled section starts |
| `PageOpener` | member page start (kicker + h1 + lede, optional quiet `.wa-page-action`) — not `PageHeader` breadcrumbs or an outlined title-bar chip |
| `ProgressRing`, `ProgressBar` | completion / capacity |
| `Avatar` | people |
| `DataTable` (+ `Column`) | tabular data — never raw `<table>` + manual borders; supports `render`/`cardRender` for custom cells / mobile cards. Row density follows DesignSurface (warm → balanced, dense → compact). |
| `FeatureTile` | member-facing gradient/pop tiles. `headingAs` (default `h3`) follows the surrounding outline — pass `h2` when tiles directly follow the page h1 |
| `QueueRow`, `WorkQueueItem` | staff work queues |
| `KanbanBoard`, `KanbanColumnHeader` | pipeline boards |
| `BarChartMini`, `RankBars` | inline mini charts |
| `FormField`, `Toggle` | form controls |
| `ChatThread` | message threads |
| `Tabs`, `TabPanel` | section tabs around server-rendered panels (WAI-ARIA tabs on `useListFocus`; `?tab=` mirrored with `history.replaceState`; an in-page `#anchor` inside a panel opens that panel). Counselor student detail is the reference. |
| `AppShellSidebar`, `AppShellMember` | shell chrome (dense sidebar / member tabs) |
| `UniversalSearch` | global search affordance |
| `MemberDashboardKit` | composed member dashboard |

`ChatThread` accepts an optional editable `initialText` and `multiline` composer
for server-validated context such as a course feedback request. It never sends
on mount. Async `onSend` handlers return `false` on failure so the draft stays
available for retry; successful sends clear only the submitted revision and
preserve text edited while the request was pending.

**Member request failures (audit 7c):** browser requests from member tools
(AI generation such as `ElevatorPitchClient`, `uploadMemberResumeFile`) go
through `fetchWithTimeout` with `MEMBER_REQUEST_TIMEOUT_MS` and describe any
failure with `lib/portal/memberRequestFailure.ts` (`readMemberRequestFailure`
for a non-2xx `Response`, `describeMemberRequestException` for a thrown
timeout/network error). A 5xx, a non-JSON error page or a hung request must
end in a kit alert (`AiToolError` / `role="alert"`) with the control
re-enabled and the spinner stopped — never an indefinite "Writing…" or an
unchanged page. Keep 4xx validation sentences from the server; replace 5xx
bodies with the plain "temporarily unavailable" copy so retry classifiers
still recognise them.

`SkillMissionChallenge` owns its focus trap and close guard. Callers must not
wrap it in a second Escape handler. Escape, backdrop, and close buttons share
the same discard confirmation for unfinished work; pending evaluation stays
mounted, and successful results close without a discard prompt. The dialog locks
background scrolling and restores the prior document/body scroll styles on close.

`MemberLabWorkspace` is the original practice/evidence workspace. It inherits the
member shell and warm surface; lab sections become a single reading sequence on
phones. Saving keeps a private draft. Explicit sharing creates an immutable
submission containing the exact lab and rubric versions. A later private edit
must never replace that submitted copy. Failed requests and stale revisions keep
the current text; text entered during a save survives the earlier response.

`LabReviewQueue` and `LabEvidenceReview` use the dense counselor surface. They
display only submitted evidence for the actor’s current organization and assigned
members (organization admins can also review unassigned work). Review decisions
belong to one submission. A competing review never hides the local feedback
draft. Revision requests unlock a new member submission; rubric feedback does
not award course completion, attendance, or an external credential. Source briefs
are versioned in `lib/content/itSupportLabs.ts`; never silently edit a published
version after collecting evidence against it.

**A11y behavior hooks** (`components/portal/kit/hooks/` — use these instead of hand-rolling;
any future kit Dialog/Menu/Combobox must be built on them):

| Hook | Use for |
|---|---|
| `useFocusTrap` | overlays (dialogs, drawers, menus). Shared **Escape stack**: nested layers each consume one Escape, top-most first. Visibility-aware tab ring, IME-safe, restores focus to the trigger on close. Prefer native `<dialog>.showModal()` when possible. |
| `useListFocus` | roving tabindex for tablists/menus/result lists — Arrow keys (RTL-aware), Home/End, one tab stop, self-repairing as items mount/unmount. Mark items with `data-kit-list-item`. |
| `useAnnounce` / `announce` | screen-reader announcements ("12 results", "Saved"). Singleton persistent live regions — never mount your own `aria-live` div per component (freshly-mounted regions don't announce). |

Reference compositions ("templates"): `components/portal/kit/pages/{member,admin,admin-subviews}/`
plus `PartnerOverviewKit.tsx`, `VoiceStudioKit.tsx`. **Start new pages by copying the nearest one.**
`VoiceStudioKit` is the canonical AI Career Tools hub (`/dashboard/ai-tools` and
`/dev/member/toolkit`): voice coaches, live practice, Resume Studio, and the AI
toolkit. The All Tools tab is a three-stage path (Resume → Interview → Profile)
with scannable directory rows — not a stacked dump of feature cards. Do not
replace it with `MemberToolkitKit`. Page chrome is `PageOpener` on the shared
`--wa-bg-wave` wash. Live-session panels stay dark (`--wa-sidebar-*`, not raw
hex) — that is session chrome, not a second app header.

`MemberApprovalStatusCard` (home, WAP-91) is the three-stage approval chain
(application → intake review → training approval) built only from saved
facts via `buildMemberApprovalStatus`: each stage shows its saved state, the
stored date for that state (`submittedAt`; `wioaReviewedAt`, which staff
write on every intake status change; `courseraEnrollmentApprovedAt`), who
owns the next move (you / WorkforceAP staff / the assigned counselor by saved
name) and what happens next. The current stage carries `aria-current="step"`
and an info `StatusTag`. A pending stage with no stored start date says so
(“No start date is saved for this step.”) — never derive one from
`updatedAt` or from the previous stage's completion. Provider (Coursera)
acceptance is still never asserted.

Browser reads of `/api/auth/me` go through `lib/auth/currentUserClient.ts`
(`fetchCurrentUser` / `useCurrentUser`, WAP-27): one in-flight request shared
by every consumer, a 60s freshness window, and `resetCurrentUserCache()` on
sign-out. Do not call `fetch('/api/auth/me')` from a component; pass a
server-known `superAdmin` into `useIsSuperAdmin(known)` to skip the read.

`MemberProgressKit` (`/dashboard/readiness`, proof `/dev/member/progress`) shows the weighted readiness score, four area percents, milestones, and a kit-token progress summary. Numbers come from `getScoreBreakdown` via `buildReadinessProgressView` — never invented weekly counters. The summary starts as a factual recap of those same points and may be replaced by an AI rewrite that is rejected if it cites unknown percents. Score-load failure is an explicit empty/error, not a 0% ring. Do not mix Astryx primitives inside this kit page.

`UsersKit` is the staff/admin directory at `/admin/users`. Its loader searches
and counts before pagination; `useDirectoryNavigation` keeps URL search, role,
and page state together while earlier responses cannot overwrite a newer query.
Phone rows show complete names and emails plus an explicit account action.
The full manager (`?ui=legacy`) searches every active account, with a visible
mobile row layout and a collapsed account-creation form. Member lifecycle
filters and search run on the server; health/attention filters remain explicitly
labeled as applying to the loaded page. Do not re-filter server search results
against that page in the client.

`StudentsRosterKit` shows the full account email beneath each student name in
both table rows and mobile cards. Keep that identifier visible and wrapping so
staff can distinguish same-name accounts before opening an account action.

`StudentsRosterKit` is the one admin roster (admin audit 2026-09-20, §7 item 2). It
takes a `view` preset: `roster` (`/admin/students`) shows Program, Progress, Coursera
grade, Readiness, Counselor, Status and Last active; `training`
(`/admin/students?view=training` and `/admin/training-progress`, proof
`/dev/staff/training-progress`) shows Program, Modules, % Complete, Coursera grade,
Pace and Last active with a KPI strip. Presets, chips and search live in
`lib/admin/studentsRosterView.ts`; the training preset sorts through the tested
helpers in `lib/admin/trainingProgressRoster.ts`. Last active is a relative caption
(`2h ago`) from existing login / LMS / progress timestamps (`User.lastLoginAt`,
`CourseProgress.lastActivityAt` / `lastUpdatedAt`) — never a new table. Missing
timestamps sort last in both directions. Do not mix Astryx primitives inside the
kit table cells beyond `Token` for Status / Pace. Legacy tables stay behind
`?ui=legacy` only (`/admin/training-progress?ui=legacy`, `/admin/members/training?ui=legacy`).

---

## 7. Icons, styling, and motion

- **lucide-react only.** No other icon set, no inline SVG paths, no emoji-as-icon in kit surfaces.
  The Material Symbols ligature font is legacy portal-page-only (WAP-110): public routes, the apply
  funnel, the auth screens, the shared error fallbacks and the member shell must not render a
  `.material-symbols-outlined` span, and the root layout no longer preloads the font (the
  `(portal)` and `admin` layouts do, for the pages that still carry ligatures). Data-driven configs
  that still store a historical ligature name (`NAV_TAB_META`, bottom-nav tabs, apply steps,
  metric cards) render it through `components/icons/LegacyGlyph.tsx`; direct call sites import
  the Lucide component. Guard: `tests/app/public-icon-font-free.spec.ts`.
- Size via the `size` prop to match surrounding text (typ. 14–18 in dense, 18–24 in warm); color
  via `currentColor` or `colorVar(...)` — never a hex literal.
- Icon-only interactive elements need an accessible name (`aria-label`).
- CSS lives in `css/portal-kit.css` under the `.wa-kit-*` class namespace (`wa-kit-card`,
  `wa-kit-tag--*`, `wa-kit-table`, `wa-kit-focus`, …). Follow that naming for new kit CSS.
- Focus rings: use the `.wa-kit-focus` / `.wa-kit-focus--on-dark` utilities — don't restyle
  outlines per component.
  There is exactly one ring recipe (WAP-157): `outline: 2px solid transparent;
  outline-offset: 2px; box-shadow: var(--wa-focus-ring)` (or
  `var(--wa-focus-ring-on-dark)` on the dark rail / hero scrims), with a system
  `Highlight` outline under forced-colors. The tokens are defined once in
  `css/main.css`; the global element rule, the portal/marketing fallbacks, shell
  chrome (sidebar, header, tabs), `.btn-*` hero CTAs and inputs all consume them.
  A `:focus` / `:focus-visible` rule that restates a ring with its own colour,
  width or offset fails `tests/lib/focus-ring-recipe.spec.ts`.
- **Motion:** use the `--wa-dur-fast|base|slow` + `--wa-ease` tokens, never literal durations.
  Where motion helps: state feedback (hover/press within `--wa-dur-fast`), entering overlays,
  progress. Where it hurts: table row hovers and list reflows at perceptible durations (the UI
  feels like it's "catching up to the cursor"), decorative movement on data-dense screens, and
  exit animations that delay the user (animate exits only when they orient, e.g. a drawer sliding
  back to its edge). Direction should match the action (drawer from the edge it lives on).
  The tokens zero themselves under `prefers-reduced-motion`; JS-driven animation must still gate
  on `matchMedia('(prefers-reduced-motion: reduce)')` (see `VoiceOrb`).
- Hover-only affordances belong under `@media (hover: hover)`.

---

## 8. Common mistakes (all observed in this repo — don't repeat them)

1. **Inventing another token family** or referencing the deleted `--dm-*`. Use `--wa-*`.
2. **Hardcoding hex/px** in a component instead of `--wa-*` / `colorVar()` — the entire
   `docs/UI-DESIGN-SYSTEM.md` migration exists because ~8.8k inline `style={{}}` blocks did this.
   (ESLint now blocks raw hex inside `components/portal/kit/**`.)
3. **Hand-writing dark-mode overrides** (`html.dark …` blocks) instead of consuming tokens,
   alpha tints, or a single `light-dark()` pair.
4. **Using `alert` for destructive/failed states** (that's `danger`), or "fixing"
   `statusColors.ts`'s magenta `danger` to red (it's intentional — see §4).
5. **Raw `<table>` + manual borders** instead of `DataTable`; ad-hoc stat blocks instead of
   `StatTile`/`KpiStrip`.
6. **Wrapping kit components in a div** to attach a class/test id (they take `className`/`style`/
   `ref`/`data-*` directly, §5) — or wrapping single components in `DesignSurface` (it belongs on
   route-group layouts).
7. **Unprefixed Tailwind classes** (`flex` instead of `wa-flex`) — they compile to nothing.
8. **Z-index literals** — use the `--z-*` scale (§1); PortalTour once rendered *under* the nav
   drawer because of an invented literal.
9. **Per-component `aria-live` regions / hand-rolled focus traps** — use `useAnnounce` /
   `useFocusTrap` from the kit (§6).
10. **Inventing props.** Read the component source in `components/portal/kit/` first; the kit is
    small enough to read.

---

## 9. Astryx coexistence (`@astryxdesign/core`)

The Astryx design system is installed site-wide (`app/layout.tsx` imports `reset.css` +
`astryx.css`). It coexists with the kit, it does not replace it:

- **Cascade safety:** all Astryx CSS lives in `@layer reset` / `@layer astryx-base`; the app's
  unlayered CSS always wins conflicts. The 11 shared token names (notably `--color-accent`,
  `--color-error`, `--color-border`) therefore resolve to the app's values everywhere — that is
  what makes Astryx components render in WorkforceAP crimson instead of Astryx blue. Never wrap
  app CSS in layers and never redefine Astryx's `--color-*` names in `:root`.
- **Dark mode:** Astryx tokens are `light-dark()`-based, same mechanism as `--wa-*` (§3). The
  app's `color-scheme` flip drives both. No `<Theme>` provider needed in production surfaces.
- **Division of labor:** new overlays, command surfaces, confirmation dialogs, and forms →
  Astryx (`Dialog`, `AlertDialog`, `CommandPalette`, `TextInput`, …) — e.g.
  `components/admin/ConfirmDialog.tsx` and `components/portal/GlobalSearch.tsx`. Within
  `components/portal/kit/pages/**`, hand-rolled generic-primitive markup (cards-as-`<div>`,
  buttons/CTA links styled by hand, badges/pills, tab lists, spinners, pagers, empty states,
  status dots, single-value progress bars) should be Astryx (`Card`, `Button`, `Token`,
  `SegmentedControl`, `Spinner`, `Pagination`, `EmptyState`, `StatusDot`, `ProgressBar`, `Link`
  wrapping Next's `Link` for navigational actions — see `VoiceStudioKit.tsx` /
  `member/MemberHomeKit.tsx`) — same brand-token bridge as everywhere else Astryx is used.
  WorkforceAP-specific composites that already encode real layout/business logic —
  `DataTable`, `StageTrack`, `SegmentedProgress`, `QueueRow`, `WorkQueueItem`, `ChatThread`,
  `KpiStrip`, `CardHead`, `Sparkline`/`AreaChartMini`, `ProgressRing`, `FeatureTile`,
  `FormField`, the kit's own `Avatar` and `ChatThread` — stay on the kit; they have no
  1:1 Astryx equivalent and don't need one. The rule is "generic primitive → Astryx, domain
  composite → kit," not "no Astryx in kit/pages."
- **Workflow (mandatory):** `pnpm exec astryx build "<idea>"` → `astryx template <name>` →
  `astryx component <Name>` before writing Astryx UI. Do not invent props — the docs are the
  contract. Reference proofs live at `/dev/astryx` (templates + production overlay demos).

---

*Maintenance: this file is hand-synced. If you touch `components/portal/kit/index.ts` exports,
token names in `css/portal-tokens.css`, or `KitTone`/`StatusTone` semantics, update the matching
section here in the same PR.*

### Stakeholder workflow contracts (2026-09-09)

- Admin Command Center queue counts represent all matching active records in the actor's organization, independent of the eight-row overview. Focused `queue`/`page` URLs show 25 items, retain context, and recover from an emptied last page. Totals are items, and interview rows are opportunities; neither is a unique-person count. “Select this page” acts only on visible application IDs.
- Command Center health accepts `unknown` in addition to `ok`/`warn`. Unmeasured or failed checks show a neutral dot and “Not verified,” never green. Failed core loaders render an explicit error state.
- Partner application links carry the existing attribution token and appear on the default overview/guide. Share tools prepare user-reviewable text; copy or native-share failure stays visible. Attention keeps approved/observed training separate from approval/funding pending.
- Counselor student summaries state funding source separately from the member-level Coursera approval flag. Neither asserts paid grants or working provider access. Member-context links, drafts, and message recipients must remain tied to the selected learner through async work.
- Member “Invite a friend” is a dedicated page in the existing warm portal shell, reusing the sharing component from Points. It shows the member's own aggregate rewards and a share toolkit; no referred learner names or learning progress. A count requires both committed reward receipts.
- Only real trend data receives an arrow/delta chip. Real admin headline counts use four columns for four KPIs, and the work-queue header counts queues rather than learners or pending items.
- Counselor/partner read receipts acknowledge an authorized loaded-message ID and advance monotonically. Timestamp ties remain read-through semantics. Shared partner/employer chat scrolls its conversation log; adding a message must not move the outer page.

### Portal polish contracts (2026-09-09)

- Admin overview uses a compact metric strip and flat queue rows. All-zero measured placement series show a concise zero summary; absent series stay absent and nonzero series retain their chart. Program and system context stays secondary without stretching to the queue height. Actions retain full counts and destinations; bulk selection remains owned by the queue client.
- Sidebar preference controls keep their radio keyboard interaction. The rail scrolls its destinations, with language and appearance visible below. Narrow or collapsed navigation must never expose clipped focusable controls.
- Counselor messages use one neutral inbox workspace. Member metadata appears once per roster row, catalog names resolve on the server, and selected conversations/filter controls expose their state accessibly. Recipient identity, request guards, and draft ownership remain unchanged.
- Partner sharing keeps its primary Copy action visible; URL/code live in a native disclosure that opens on clipboard failure. Member sharing keeps the link/copy action visible and opens invitation preview for manual copying when needed. Privacy and aggregate-reward limits remain visible.
- Partner metrics without supplied trend data use compact StatTile captions; supplied trends retain StatSparkTile. The referral funnel presents the same supplied counts/percentages as named progress bars across a desktop row and a mobile stack. The progress handoff retains its destination as a quiet direct link.
- Staff mobile navigation consumes portal surface tokens in both themes. Staff rails use their server-rendered role for initial styling; short landscape viewports scroll the whole rail so neither destinations nor preferences are clipped.
- Student roster Last active exposes its learner-action source in desktop and mobile tooltips/accessibility labels. Displayed assignment comes from the shared enrollment policy; legacy-only assignment and unresolved assignment remain explicit. Missing grades must not suppress learning activity, and import/database-update timestamps must not be presented as learner activity.
