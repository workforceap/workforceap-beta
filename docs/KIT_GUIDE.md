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

The audit page's `AuditLogsKit` displays `MemberEvent` activity, separate from
security audit records. Its Account column identifies the related account, which
can be the affected member rather than the staff actor. Reported IP is optional,
unverified event metadata; an unavailable value does not prove an audit-capture
failure. Keep these labels consistent in the table, mobile cards and legacy view.

Member training Coursera CTAs use `TrackedCourseraLaunchLink` (a native anchor)
for `/api/member/coursera/launch` redirects. Next `Link` would prefetch the launch
as RSC before a click and trigger cross-origin CSP errors. Keep Next `Link` for
in-app modules; preserve the tracked new-tab action and kit CTA classes.

The admin assessments catalog's “Student results & retakes” action opens the
per-student results table, where staff can request the final preassessment attempt.
Both mobile and desktop controls use the existing admin authorization endpoint;
pending requests and the two-attempt limit disable the action.
The member Eligibility tab offers the same action beside the saved assessment
answers. The Overview link uses the Tabs component's native fragment navigation
to open that review block; preserve the attempt count and pending state.

Billing phone fields normalize complete US numbers on blur and before new draft
payloads, including unsigned previews. Keep extensions and international or
incomplete input intact; saved and signed PDF snapshots retain their original text.
Billing case creation shows whether the selected program has approved billing
terms before offering the action. Keep unsigned previews available for missing
terms. For an overnight unsigned draft, the explicit date-refresh action opens
the editor; saving and reviewing the new PDF precede signature review.

Digital Literacy uses the portal locale for lesson copy and provider links. Spanish
catalog links must say that the student selects the topic; provider language-switch
anchors use `referrerPolicy="no-referrer"` so the provider cannot redirect back here.

### Portal workspace consolidation

Workspace views preserve the existing loaders and actions: Resume (`files`, `score`,
`rewrite`, `coach`), counselor Today (`attention`, `replies`, `decisions`, `followup`,
`overview`), admin Students (`roster`, `manage`, `training`, `readiness`), employer
Candidates (`applicants`, `matches`, `pipeline`) and partner Impact (`outcomes`,
`milestones`, `exports`). Server views use native links and load only the selected
view. `LinkTabs` keeps the selected or keyboard-focused link fully visible on
narrow screens without scrolling the document. Existing entry URLs remain valid. Do not collapse distinct application,
match, placement, milestone or readiness definitions when grouping their navigation.

Record links use `PortalRecordLink` and `PortalBackLink` to retain an allowlisted,
same-portal list URL, including filters, page, view and explicit locale. These helpers
do not authorize access. A record-to-edit hop carries an existing safe origin. Client
list refinements must update Next's search-parameter subscribers as well as visible
state; native `history.replaceState(null, '', href)` lets Next copy its internal state.
Passing the router's internal state back into that wrapper can bypass the update.

Member phone navigation retains five daily destinations, an always-visible training
preassessment, the current secondary page and a keyboard-accessible More pages
disclosure. Labels remain visible in the utility/disclosure rows even when the daily
strip compacts. AI Advisor and human Messages remain separate. Skill Mapper's radar
charts retain numeric alternatives bound to the same data; an occupation's O*NET
requirements must not be presented as demonstrated member proficiency.

The preview-only [screen review checklist](qa/portal-consolidation/README.md) inventories
the actual routes and consolidated query views. Its browser-saved review results are
manual acceptance notes, not a production gate bypass.

---

## 1. Token families — which one to use

There are **two** live CSS-variable families in this codebase. Only one is canonical for new work.

| Family | File | Status |
|---|---|---|
| `--wa-*` | `css/portal-tokens.css` | **Canonical.** Use this for all kit/portal work. Its mode-constant brand hues (accent / gold / info / success / danger, hero pairs, soft tints) are defined in `css/wa-brand-tokens.css`, which it `@import`s and which `app/layout.tsx` also loads on every route so `css/astryx-brand-bridge.css` resolves to computed values on the public site (WAP-106). Neutrals, `color-scheme`, density and motion stay portal-only. |
| `--color-*`, `--surface-container-*` | `css/main.css` | Legacy (MD3-style). Do not add new refs; bridge aliases in `portal-tokens.css` map the live names onto `--wa-*`. Caution: its `:root` holds **dark** values with light as the override — the opposite convention from `--wa-*`. |
| `--dm-*` | — | **Deleted** (was `css/dark-mode.css`). Never reintroduce. |

Key `--wa-*` tokens (see `css/portal-tokens.css` for the full set):

- **Brand hues:** `--wa-accent` (the text accent: crimson in light, dusty rose in dark; never
  a fill behind white) / `--wa-accent-fill` (solid fills, crimson in both modes) / `--wa-accent-dark` /
  `--wa-accent-soft` / `--wa-on-accent`, `--wa-gold(-dark|-soft)`, `--wa-info(-soft)`,
  `--wa-success(-soft)`, `--wa-danger(-soft)`, `--wa-violet`.
- **Text-bearing hero gradients:** `--wa-hero-crimson(-dark)`,
  `--wa-hero-gold(-dark)` and `--wa-hero-info` (the employer voice session fill)
  stay dark in both themes and pair with `--wa-on-hero`.
  A white hero action uses `--wa-hero-action-bg` and `--wa-hero-action-text`;
  do not substitute the theme-adaptive solid-control foreground. Categorical
  KPI totals use neutral text; retain semantic color for an actual state
  (the counselors roster colours "At-Risk Owned" only while it is above zero).
- **Neutrals (flip in dark mode):** `--wa-bg`, `--wa-surface`, `--wa-surface-2` (raised
  fill: icon tiles, chips), `--wa-text`, `--wa-muted`, `--wa-border`, `--wa-track`, plus the
  sidebar set (`--wa-sidebar-*`, dark chrome in both modes). `--wa-bg-wave` is the one
  painting hook for the portal canvas and it is flat: it equals `--wa-bg`, with no radial
  wash. On the member surface `--wa-bg`, `--wa-surface-2` and `--wa-border` take the warm
  paper values (§2); muted text keeps 4.5:1 on both ladders (`lib/ui/portalCanvas.test.ts`).
  `--wa-shell-header-bg`
  is a 96% canvas fill that keeps sticky navigation readable as content scrolls
  beneath it, with a slight continuation of the canvas tone. Member header and mobile
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
  with five permanent rows — Home, My program, Job board, AI Career Tools
  and Messages (WAP-189) — plus the single contextual tool row on
  `/dashboard/ai-tools/*` pages, and the Tools & careers /
  Training & progress / Account & support groups disclosed on demand.
  My progress and Skill missions live in Training & progress. The
  collapsed 72px rail has no disclosure: it lists every row as an icon.
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
  decorative `--wa-border`.
  The shared Toggle uses `--wa-control-border` as its unchecked track fill, with
  `--wa-surface` for the thumb; the checked fill stays `--wa-accent`. This keeps
  thumb position visible at 3:1 or better in both themes and surface modes
  (WAP-297). Keep the low-contrast `--wa-track` token for decorative tracks.
  Small tinted status labels use
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
radius / padding / shadow and the LIGHT canvas ladder change. Dark values are shared.

| Mode | Who | Feel | Light canvas (`--wa-bg` / `--wa-surface-2` / `--wa-border`) | Values |
|---|---|---|---|---|
| `warm` | Member-facing routes | Calm: white hairline cards on warm paper, 12px corners, generous space | `#faf8f6` / `#f3efeb` / `#e9e4df` | radius 12/8, pad 24/16, `--wa-pop: 0` |
| `dense` | Admin / staff / data / rosters / queues | Compact and operational, on the cool canvas | `#f7f8fa` / `#f4f4f5` / `#e8e8e8` | radius 12/8, pad 16/12, `--wa-pop: 0` |

Members feel looked after, staff feel operational, and which side you are on reads from across
the room. The warm ladder is declared once, in `css/portal-tokens.css`, on both
`[data-surface='warm']` and `html[data-portal-role='member']` (the shell sets that attribute),
so the header, rail, `<html>`, `<body>` and the page are one canvas. `--wa-surface` stays white on
both. The canvas is flat (`--wa-bg-wave` is `--wa-bg`). Any new neutral on the warm ladder must
clear the pairs in `lib/ui/portalCanvas.test.ts`.

Wrap the **route-group layout**, not individual components:

```tsx
import { DesignSurface } from '@/components/portal/kit';

<DesignSurface surface="warm">{children}</DesignSurface>   // member
<DesignSurface surface="dense">{children}</DesignSurface>  // admin / staff / data
```

`useSurface()` (import it from `@/components/portal/kit/DesignSurface`; it is not in the
barrel) returns `'warm' | 'dense'` for the rare component that must branch in JS
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
  through the translucent header therefore continue the shell's canvas (WAP-153). Do not paint
  a second canvas on body: `--wa-bg-wave` is `--wa-bg` (flat, no wash), so the solid token is the
  seam-free continuation. The member warm paper (`--wa-bg`, `--wa-surface-2`, `--wa-border`) is
  declared in `css/portal-tokens.css` for `html[data-portal-role='member']` as well as
  `[data-surface='warm']`; the Astryx bridge no longer carries a copy.
- **In dark mode the accent is for fills, not text.** A lighter crimson is pink, and pink text
  reads as a beauty brand, so the dark text accents are a dusty rose: `--wa-accent` `#dd9fb0` and
  `--wa-accent-text` `#e6b3bf` (8.3:1 and 9.9:1 on `--wa-surface`, 4.5:1 or better on the whole
  dark ladder and on `--wa-accent-soft`). Solid fills paint `--wa-accent-fill` (crimson, white
  label `--wa-on-accent-control`). Never paint white on `--wa-accent`: it is 2.2:1 in dark.
  Text links in cards (`.wa-kit-card-link`, the staff `cardLink`, and anchors that only paint
  their label with an accent token inline) read `--wa-text` in dark with a 1px accent underline
  (`css/portal-kit.css`, "Dark mode: the accent is for fills"); buttons, tags and anything with
  its own background are excluded. The accent otherwise appears on fills, the active item and
  focus rings. Light mode is unchanged. `lib/ui/brandTokens.test.ts` holds the pairs.
- Admin and staff surfaces read semantic state through `--wa-*` only: `--wa-info-dark` /
  `--wa-success-dark` / `--wa-gold-dark` for text, the base hue for icons, fills and `color-mix`
  tints. The legacy `--color-blue` / `--color-green` / `--color-gold` are pinned or only
  scope-aliased and never adapt (gold is the same hex in both themes);
  `lib/ui/adminSemanticTokens.test.ts` fails on any new reference under `app/admin` or
  `components/admin` (WAP-133).
- Elevation in dark mode comes from shadows plus a 1px **inset bezel highlight** baked into
  `--wa-shadow`/`--wa-shadow-lg` (transparent in light) — not from lighter surface tones. Do not
  add new surface-tone variables; `--wa-surface` and `--wa-surface-2` are the whole ladder.
- Standard kit and Astryx cards use solid `--wa-surface`, `--wa-border` and
  `--wa-shadow` in both themes. Reserve gradients for the existing crimson/gold
  hero variants, using their deep hero pairs and `--wa-on-hero`; dense variants
  retain their semantic tint. Keep generic card selectors below variant
  specificity so dark mode cannot erase a hero gradient or a tinted card.
  Hero elevation uses `--wa-shadow-lg`; dense tinted cards use `--wa-shadow`.
  The Resume Studio banner/coach link and the floating readiness-coach action
  use these same fixed hero pairs. Their normal-size labels remain fully
  opaque; reducing white text opacity can erase the intended contrast margin.

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
`toneClass(tone)` (`components/portal/kit/tokens.ts`) returns the hook class for `cx()`.
Each hook also sets `--wa-kit-tone-text`, the text twin of the fill (the same pairs as
`textColorVar()` / `TEXT_COLOR_VARS`): the gold and success fills are under 4.5:1 as small
text, so toned text (`.wa-kit-tone-text`, `.wa-kit-stat-tile__delta`) reads the twin, never
`--wa-kit-tone`; the edge, icon and bar fills keep the fill hue.

**Stat tiles speak KitTone, not `KitColor`.** `StatTile`, `KpiItem` (`KpiStrip`) and `StatSparkTile`
take `tone?: KitTone` (plus `deltaTone` for the caption line) and paint only through the hooks: the
number is always neutral `--wa-text`; a `StatTile` tone shows as the card's edge accent
(`.wa-kit-tone-edge`), a `StatSparkTile` tone as its icon chip (`.wa-kit-tone-icon`) and trend line.
The old categorical `color` prop is gone — omit `tone` for a total that is not a state
("Signups (7d)", "Total referred"), and gate a state tone on the value
(`tone: failing > 0 ? 'danger' : undefined`). Legacy names map by meaning: `success → ok`,
`gold → warn`, `accent → alert` (`danger` for failed / rejected), `info → info`, `muted → muted`.

The same rule covers the fills: `RankBars` rows (`RankDatum.tone`), `ProgressBar`, `ProgressRing` and
`StageTrack` take `tone?: KitTone` and paint the bar / ring / segments through `.wa-kit-tone--<tone>`;
omit it for the plain accent fill (a progress value is not a state). Their old categorical `color` prop still
works but is deprecated and ignored when `tone` is set — do not add new `color=` callers.

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

**Application / intake status words** (`lib/status/applicationStatusVocabulary.ts`) — one
vocabulary for `Application.status` and `users.wioaReviewStatus`, two audiences, one tone per
value. Never keep a local `{ PENDING: 'Pending' }` map; call `applicationStatusLabel(key, audience)`
/ `intakeStatusLabel(key, audience)` (English) or pass the `status`-scoped translator for a
localized surface, and paint `StatusTag` with `applicationStatusTone(key)` / `intakeStatusTone(key)`.
Keys come from `applicationStatusKey(enum)` / `intakeStatusKey(column)`; messages live under
`status.application.<audience>.*` and `status.intake.<audience>.*` in all four locales.

| value | member word | staff word | tone |
|---|---|---|---|
| no application | No application on file | No application on file | muted |
| `PENDING` | Pending review | Awaiting decision | warn |
| `NEEDS_INFO` | More information requested | Waiting on applicant | alert |
| `APPROVED` | Application approved | Approved | ok |
| `DENIED` | Application closed | Denied | danger |
| intake `null` | Status not recorded | Not reviewed | muted |
| intake `pending` | Review pending | Awaiting review | warn |
| intake `in_review` | In review | In review | info |
| intake `needs_info` | More information requested | Needs more information | alert |
| intake `verified` | Intake verified by staff | Intake verified | ok |
| intake `not_eligible` | Staff recorded not eligible | Not eligible | danger |

Staff intake verification is not a legal WIOA eligibility determination (`lib/wioa/wioaReview.ts`),
so no surface says "Eligible". Action buttons keep their verbs (Approve / Deny / Request info,
admin "Not a fit"); the #2486 queue title "Waiting on your decision" is a title, not a status word.

Legacy `PortalEmptyState` is `KitEmptyState` with `framed`. Set `headingAs="h2"`
when an empty section directly follows the page h1; the default h3 is retained for
empties inside an existing h2 section. Preserve the distinction between a failed load
and a confirmed empty result (`kind="unavailable" tone="danger"` + a Reload action, never
`first`). Keep existing directory empties on `KitEmptyState`.

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

Foundation: `DesignSurface`, `colorVar` + `KitColor`/`KitTone` types, `toneClass`,
`KitBaseProps` / `KitDataAttrs` / `cx` (§5).

The barrel exports what pages compose through it. A kit module that only its kit siblings
use is imported from its own file instead (the way `GuidedTour` already is), and `pnpm knip`
reports any barrel re-export nothing imports — keep that at zero. Direct-import modules today:
`useSurface` (`kit/DesignSurface`), `useListFocus` / `LIST_ITEM_ATTR` (`kit/hooks/useListFocus`),
`announce` / `getFocusable` (`kit/hooks/useAnnounce`, `kit/hooks/useFocusTrap`),
`KitTableToolbar`, `KitRowMenu`, `kitTableUrlState`, `KanbanColumnHeader` (`kit/Kanban`),
`Sparkline` (`kit/Charts`), `DeltaChip` (`kit/CommandCenter`), `AppShellSidebar`,
`UniversalSearch`.

| Component | Use for |
|---|---|
| `StatTile`, `KpiStrip` | single stat / row of stats (never hand-roll stat blocks); `tone?: KitTone` is a *state* painted on the edge accent via the §4 hooks, the number stays neutral; `deltaTone` for the caption |
| `StatSparkTile` | icon-chip stat with optional delta chip + sparkline; same `tone` gate — the chip and trend line paint, the value never does |
| `StatusTag` | semantic status pill (every table status column, risk tiers) |
| `JobListingRow` | member open-role listing row (live `/dashboard/jobs` + board proof — not `.job-card` mosaics). `MemberJobsKit` lists the live openings itself under `#open-roles` (`openRoles`, each linking to `/dashboard/jobs/<id>`); "Browse openings" / "Browse jobs" jump to that list, never to `?ui=legacy`. An empty list is the honest `empty.openings` state (`KitEmptyState kind="unavailable"`, hrefs from `JOBS_BOARD_EMPTY`). |
| `KitEmptyState` | the one empty state for listing and table shells. `kind` names the situation and is emitted as `data-kind`: `first` (nothing yet → the first action), `filtered` (rows exist, none match → "Clear filters"), `unavailable` (not available to this viewer / not loaded / not in this period / failed — `tone="danger"` + Reload for a failure), `clear` (zero is the goal — staff queues, alerts). Tone defaults by kind (muted / muted / warn / ok) and paints the optional `icon` chip and the edge through the §4 hooks. `primaryAction` (`href` or `onClick`) and `secondaryAction` render as `.wa-kit-cta` / `--ghost`; `framed` draws the standalone box (what `PortalEmptyState` is). Inline value fallbacks in a cell ("No program", "—") are not empty states — use `StatusTag` muted or `—`. Admin directory empties (`MentorsDirectoryKit`, `PartnersDirectoryKit`, `EmployersDirectoryKit`, `SubgroupsDirectoryKit`) use this + sentence-case CTA copy from `lib/member/mentorsEmptyState.ts` / `lib/admin/directoryEmptyState.ts` — not Astryx `EmptyState`. Member-surface copy lives in `messages/*.json` under `empty.*` (one sentence pattern per kind; `empty` is a `PORTAL_CLIENT_NAMESPACES` entry), read through the surface's translator — never hardcoded in the component or a `lib/**` constant. The deprecated `action` slot stays until the last caller migrates. |
| `SectionHeader` | titled section starts |
| `PageOpener` | member page start (kicker + h1 + lede, optional quiet `.wa-page-action`) — not `PageHeader` breadcrumbs or an outlined title-bar chip |
| `ProgressRing`, `ProgressBar` | completion / capacity |
| `Avatar` | people; initials read `--wa-accent-text` on `--wa-accent-soft` (the fill hue is under AA in dark) |
| `DataTable` (+ `Column`) | tabular data — never raw `<table>` + manual borders; supports `render`/`cardRender` for custom cells / mobile cards. Empty rows render `KitEmptyState` from the `empty` prop (`DataTableEmpty`: `kind`, `title` — default "No rows yet" — `description`, actions, icon); the legacy `emptyTitle` / `emptyDescription` pair still works. Row density follows DesignSurface (warm → balanced, dense → compact). Opt-in table standard props (§6a): `stickyHeader`, `selectable` + `bulkBar` + `onSelectionChange`, `pagination`, `renderSubRow`, `scrollCue`, `loading`, `errorNotice`, `density`, per-column `stickyLeft`. |
| `KitTableToolbar` (+ `KitTableViewChip`; import from `kit/KitTableToolbar`) | table toolbar: labelled search, saved-view chips with counts, a collapsed "Filters · n on" drawer, right-side actions. URL state through `kitTableUrlState.ts` (`readKitTableUrlState`, `writeKitTableUrlState`, `kitTableHref`, `KIT_TABLE_PAGE_SIZE`; import from `kit/kitTableUrlState`). |
| `KitRowMenu` (+ `KitRowMenuItem`; import from `kit/KitRowMenu`) | one icon trigger per table row, a native `role="menu"` list; disabled items stay visible with a `reason` tooltip (`danger` tone for destructive items). |
| `FeatureTile` | member-facing gradient/pop tiles. `headingAs` (default `h3`) follows the surrounding outline — pass `h2` when tiles directly follow the page h1 |
| `QueueRow`, `WorkQueueItem` | staff work queues; every tone tints from a `--wa-*-soft` token, the flag `Token` sits on `--wa-surface` (not a second tint) and a ghost row action reads `--wa-accent-text` |
| `KanbanBoard` (+ `KanbanColumnHeader` from `kit/Kanban`) | pipeline boards |
| `BarChartMini`, `RankBars`, `AreaChartMini`, `TrendPlaceholder` | inline mini charts (`Sparkline` from `kit/Charts`) |
| `FormField`, `Toggle` | form controls |
| `ChatThread` | message threads. An empty thread renders `KitEmptyState kind="first"` whose action focuses the composer; surfaces pass `empty={{ title, description, action }}` from their `empty.*` translator (`MemberMessagesKit` does), the kit English is the fallback. `PortalTeamChatClient` (employer / partner team threads) takes the same `empty` object. Page-level inbox guards (no member row, no thread in an audit) are `kind="unavailable"` inside `MemberMessagesFrame`, never "No messages yet". |
| `Tabs`, `TabPanel` | section tabs around server-rendered panels (WAI-ARIA tabs on `useListFocus`; `?tab=` mirrored with `history.replaceState`; an in-page `#anchor` inside a panel opens that panel). Counselor student detail is the reference. |
| `AppShellMember` (+ `AppShellSidebar` from `kit/AppShellSidebar`) | shell chrome (member tabs / dense sidebar) |
| `UniversalSearch` (`kit/UniversalSearch`, not in the barrel) | global search affordance |
| `GuidedTour` | guided-tour engine: spotlight ring + step popover over `[data-tour]` anchors, steps from `lib/tours/registry.ts` through `TourContext`, copy from the `tours` i18n namespace, chrome on `--wa-*` and `--z-tour`. Not in the barrel (it depends on `components/onboarding/TourContext`) — import `@/components/portal/kit/GuidedTour` directly; `TourProviderWrapper` already mounts it for every portal. Reopen a tour from the header `PortalHelpMenu`; offer it once with `TourOfferStrip`. |
| `MemberHomeKit` (`kit/pages/member/MemberHomeKit`, not in the barrel) | the member home at `/dashboard`, its one implementation (fed by `lib/member/loadMemberDashboardHome.ts`; the old `MemberDashboardKit` and the `?ui=legacy` home were removed in WAP-195) |

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

Voice startup in `VoiceStudioKit` and `PortalVoiceSession` uses
`requestVoiceSession` with the same deadline and failure copy. Its response
consumer keeps that deadline active through JSON body reads. Leaving the
surface cancels the startup request, stops any camera stream granted later,
and ends a client session that connects after unmount. Microphone permission
denial leaves the start control available and does not request a session URL.

The hub's All Tools overview promotes its three stages only when the toolkit
container has at least 900px, allowing for the portal rail. On wide layouts,
stage numbers and their connector sit above the heading copy. Stage headings
and directory rows use `--wa-pad-sm` spacing; complete descriptions wrap rather
than being clamped. Row overrides stay inside `.wa-kit-toolkit` because Career
brief shares the base row/list classes. The narrow jump strip stacks each number
above its label so Resume, Interview and Profile remain readable and clickable.

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
| `useFocusTrap` | overlays (dialogs, drawers, menus). Shared **Escape stack**: nested layers each consume one Escape, top-most first. Visibility-aware tab ring, IME-safe, restores focus to the trigger on close (pass `returnFocusRef`, or give the container an `id` its trigger names in `aria-controls`, for Safari, which leaves `<body>` focused after a button tap). A container with `tabIndex={-1}` and nothing focusable inside takes focus itself. Prefer native `<dialog>.showModal()` when possible. |
| `useListFocus` (`kit/hooks/useListFocus`, not in the barrel) | roving tabindex for tablists/menus/result lists — Arrow keys (RTL-aware), Home/End, one tab stop, self-repairing as items mount/unmount. Mark items with `data-kit-list-item`. |
| `useAnnounce` (barrel) / `announce` (`kit/hooks/useAnnounce`) | screen-reader announcements ("12 results", "Saved"). Singleton persistent live regions — never mount your own `aria-live` div per component (freshly-mounted regions don't announce). |

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
Phone-width emails prefer breaks after local-part dots and before `@`, with an
emergency break only when a segment cannot fit. A named program with no stored
assignment is marked `(inferred)` in every kit view. The training loader can
produce that state from course progress; the default roster loader uses a
placeholder when it has no assignment, and the dev roster exercises the
named-program case.

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

## 6a. Table standard (admin tables, 2026-09-20)

One primitive: kit `DataTable` + `KitTableShell` (`components/portal/kit/DataTable.tsx`,
`KitTableShell.tsx`). Legacy `components/portal/ui/DataTable` stays only behind `?ui=legacy`
twins and in diagnostics tables that have not been ported yet; do not add new callers.
Reference adopters: `UsersKit` (`/admin/users`) and `components/admin/CourseraCatalogHealthTable.tsx`.

- **Columns**: at most 8 on desktop, the identity column first and `stickyLeft`. A row menu
  (`KitRowMenu`) replaces per-row button rows and `?ui=legacy` hand-offs; it carries the actions the
  page already has server routes for (Users: change role, send password reset, delete — the same
  `/api/admin/users/[id]` routes the legacy manager calls, with the self-row guard from
  `lib/admin/usersSelfGuard.ts`: the signed-in admin's row keeps Delete and Change role visible but
  inert, with the reason as the tooltip).
- **State is `StatusTag`**, never Astryx `Token` colours and never coloured numbers. Counts of problems
  collapse into one `StatusTag` ("5 issues") with the detail in a `renderSubRow` (Coursera catalog
  health: Unmapped / Stale IDs / Wrong type / Additional in one sub-row).
- **Density**: `DesignSurface surface="dense"` (8/12px cells) or `density="compact"`. Rows are at most
  two text lines: `.wa-kit-table-cell--truncate` (with `title`) for names, emails and programs,
  `.wa-kit-table-cell--nowrap` for phones and dates, `.wa-kit-table-cell--num` for numbers. Type never
  goes below `--wa-type-meta` (13px).
- **Toolbar**: `KitTableToolbar` above the table — search (`?search`), saved-view chips with counts
  (`All · 8`, `At risk · 6`), other filters behind "Filters · n on", actions on the right. URL state is
  `?search&sort&page` (`sort` = `key` / `-key`; changing search, sort or a filter drops `page`); page
  size is `KIT_TABLE_PAGE_SIZE` (50). Tables under `ADMIN_SSR_LIST_CAP` sort on the client with
  `useKitTableSort` + `KitSortHeader`; larger ones sort and page on the server from the URL.
- **Wide tables**: `scrollCue` paints a right-edge fade and announces "Scroll for more" while columns
  overflow; `stickyHeader` pins `th` inside a `stickyMaxHeight` (default `70vh`) body.
- **Bulk**: `selectable` + `bulkBar={({ selectedKeys, clear }) => …}`. The bar renders above the table
  with the count and a Clear button; dialogs mount inside the slot. Selection is keyed by `rowKey`,
  optionally controlled through `selectedKeys`.
- **Mobile**: `mobile="cards"` with one card template — identity, one `StatusTag`, two facts, the same
  row menu — and the pager under the cards. Horizontal scroll only for diagnostic tables.
- **Empty / loading / error**: empty = `KitEmptyState` with a real next step (`empty={{ kind, title,
  description, primaryAction }}`; `kind: 'filtered'` while a search / filter is active, the legacy
  `emptyTitle` / `emptyDescription` pair still works); route loading = `app/admin/loading.tsx`, in-table refresh = `loading`
  (`aria-busy` + skeleton rows while there are no rows yet); hard failure =
  `components/admin/AdminDataLoadError.tsx` (kit card, single h1, Admin home / Jobs); soft failure =
  `errorNotice` (an alert row above the data, the rows stay).
- **Specs** are render-based: `tests/components/kit-data-table-primitive.spec.tsx`,
  `kit-table-toolbar.spec.tsx`, `users-kit-row-menu.spec.tsx`, `coursera-catalog-health-table.spec.tsx`.

---

## 6b. Calm card language (C1 + C3, 2026-10-24)

Member and staff screens share one card recipe: white `--wa-surface` on the `--wa-bg` canvas, a 1px
`--wa-border` hairline, 12px radius, no heavy shadow, no gradient feature tile by default (the
`--gradient-*` variants and `FeatureTile` stay opt-in). Warm and dense differ only in density now.
Gold means achievement, green success, blue supporting data, crimson the one primary action or current
state (at most one crimson pill per card). Reusable classes (all in `css/portal-kit.css`, `--wa-*` only):

- Card parts: `.wa-kit-card--flush` (rows/tables), `--accent-edge` (3px crimson "Up next" edge),
  `.wa-kit-card__head` (+ `--ruled`), `.wa-kit-card-title` (17px/700), `.wa-kit-card-sub`,
  `.wa-kit-card-count`, `.wa-kit-card-link`.
- Chips: `.wa-kit-chip--neutral|blue|green|gold|crimson|dark`; `.wa-kit-date-chip` with `--soon` (the
  due-soonest dark pill), `--done`, `--overdue`.
- Task rows: `ul.wa-kit-task-list > li.wa-kit-task-row[data-state=todo|current|done]` with
  `__check`, `__body` (`__title`, `__sub`) and a trailing date chip; `.wa-kit-task-row--link` for anchors.
- `ol.wa-kit-segments` (`--wa-segments: N`) > `li.wa-kit-segment--done|--current|--todo`: segmented
  progress with `__bar`, `__state`, `__name` labels.
- `.wa-kit-status-strip` > `.wa-kit-status-step--done|--current|--todo` (`__dot`, `__text`): the slim approval strip.
- `.wa-kit-people-card` (`__head`, `__avatar`, `__name`, `__role`, `__time`, `__quote`, `__foot`) and
  `.wa-kit-date-tile` (`__mon`, `__day`); `.wa-kit-stat-pair` for streak + points.
- Layout: `.wa-kit-home-grid` (`__head`, `__main`, `__rail`) is one column on phone and main + 352px rail
  from 1100px; `.wa-kit-stack` is a 16px vertical stack.
- `PageOpener` greeting mode: omit `kicker`, pass `meta` (one contextual sentence) and optionally `aside`
  (right-side status, stacked below on phone). Existing `kicker` + `lede` call sites are unchanged.
  `SectionHeader` titles are 18-20px/700 (`.wa-kit-section-header*`). `QueueRow` / `WorkQueueItem` are
  surface rows with a toned edge and soft icon tile (`.wa-kit-queue-row--*`, `.wa-kit-work-item`).

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
- **Rule of thumb: motion helps when it confirms something the member just did or shows what
  just loaded; it never loops, never replays when a component re-renders, and always has a
  reduced-motion twin.** The kit has exactly two orchestrated transitions, both CSS-only, both
  inside `@media (prefers-reduced-motion: no-preference)` and on the `--wa-dur-*` / `--wa-ease`
  tokens (`lib/ui/portalKitMotion.test.ts` holds the rules):
  1. **Certification path fills in once** (`.wa-kit-segments`). Each `.wa-kit-segment__bar > i`
     scales in from the left (`scaleX` 0 to 1, `--wa-dur-slow`), staggered by position with
     `--wa-stagger` (70ms) up to the eighth segment. It is a CSS animation on mount, so a width
     change or a re-render does not restart it.
  2. **A task row strikes through and its check pops** (`.wa-kit-task-row[data-state='done']`).
     The strike is a background strip on the title that draws in left to right over
     `--wa-dur-base` (it follows every wrapped line; the title is inline in this block and the
     body line-height is pinned so the row is the same height with motion off). The check pops
     once, `scale` 0.8 to 1 over `--wa-dur-base`. The strike is a transition (plays when the row
     becomes done); the pop is a keyframe animation whose name only changes when the row becomes
     done, so a re-render of a done row does not replay it. A done row that mounts already done
     pops its check once and shows the strike with no animation.
  Under reduced motion the segments are simply full and the done title keeps the native
  `line-through`. Do not add a third transition without a reason of this kind.
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
  A navigational action that should look like a button is `KitLinkButton`
  (`components/portal/kit/KitLinkButton.tsx`): one Next link with Astryx Button styling and the
  kit focus ring. Its primary label colour comes from `css/astryx-brand-bridge.css`
  (`a.astryx-button[data-variant='primary']`), because the global `a { color: inherit }` would
  otherwise beat Astryx's layered foreground; do not override it per surface.
  The primary fill is the next rule in that file: the org accent (`--org-accent`), else the
  mode-constant `--wa-hero-crimson`, never the dark-lightened `--wa-accent`, so the white label holds
  6.47:1 in both themes (2.2:1 on the dusty-rose dark `--wa-accent`, `#dd9fb0`). Do not retarget the label to
  `--wa-on-accent-control` instead: dark ink on the pinned org accent is 2.78:1.
  Never wrap an Astryx `<Button>` in a `<Link>`: that renders `<a><button>`,
  which is invalid and gives keyboard users two tab stops per action (WAP-252). The lint rule
  `wap-kit/no-button-in-link` (`scripts/lint/eslint-plugin-wap-kit.mjs`) fails `npm run lint` on
  a `Button` placed directly inside a `Link` or `AstryxLink` (WAP-268).
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
- Admin Today (`/admin`, WAP-190) is `CommandCenterKit` with `title="Today"`, `queuesFirst` and a `lead`: the org-wide `CounselorApprovalQueue` (same builder, SLA and tones as the counselor Today; `rowHrefs` send each row to the admin screen that records the decision; `total` + `moreLinks` print "Showing the N oldest of M" instead of silently truncating). The queues precede the KPI strip, placements trend and program / system context; `/admin/command-center` keeps the metrics-first default. `CommandCenterQueueItem.links` names the people behind a count, each with a direct link (new applicants → the record's Counselor assignment card).
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
- Partner share tools (`PartnerShareToolkit`, guide page) are dense edge-to-edge rows — landing page, per-channel UTM links with optional signup counts (counts only) — plus a copyable “About WorkforceAP” blurb (the mission statement, `mission.statement` in `messages/*.json`, passed in by the server page) and a read-only Apply-button snippet textarea; each Copy action is an Astryx `Button` whose failure stays visible. What a partner may see about referred members is decided in `lib/partner/dataAccess.ts`, never in a component (docs/PARTNER_TIERS.md).
- Partner sharing keeps its primary Copy action visible; URL/code live in a native disclosure that opens on clipboard failure. Member sharing keeps the link/copy action visible and opens invitation preview for manual copying when needed. Privacy and aggregate-reward limits remain visible.
- Partner metrics without supplied trend data use compact StatTile captions; supplied trends retain StatSparkTile. Partner KPI tiles carry no categorical colour (a `tone` only for a state such as pending reviews above zero). The referral funnel presents the same supplied counts/percentages as named progress bars across a desktop row and a mobile stack. The progress handoff retains its destination as a quiet direct link.
- Counselor student detail record panels (`CounselorIntakeReviewPanel`, `WioaScreeningReadonly`, `AssessmentAnswersReadonly`, `CounselorNotesPanel`, `AdvisorSessionNotesPanel`) are `.wa-kit-card` sections: section h2 titles and `.wa-kit-stat-label` h3 card heads, `.wa-kit-meta` captions, `StatusTag` / tone hooks for status copy, colocated `*.module.css` for layout (`--wa-*` only, 13px floor, no inline `fontSize`). The page keeps the single h1; heading levels inside the tab panels are unchanged. The notes panels load through `fetchWithTimeout` with the effect's `AbortSignal` and `lib/portal/memberRequestFailure` copy (a cancelled request never reads as a failure).
- Staff mobile navigation consumes portal surface tokens in both themes. Staff rails use their server-rendered role for initial styling; short landscape viewports scroll the whole rail so neither destinations nor preferences are clipped.
- Public inquiry inbox rows show durable receipt and notification state separately, with bounded paging and tenant authorization. The Applications rail owns the nested inbox link. No conversion/approval action is implied; contact/careers/sponsor submit errors preserve entered values and any saved receipt, and a new attempt clears stale success feedback.
- Staff public-screening contacts use a separate source-labelled table with saved-answer disclosures. Public contacts have no member review status; navigation from Admin Today sits outside the member decision queue and its overflow destinations. Saved service requests on Program are read-only records with an explicit provider-access disclaimer, and failed loads must not claim an empty history.
- Partner signup intake is a platform-admin-only, paged read surface linked contextually from Partners. Unassociated submissions retain their submitted organization/contact fields; do not imply tenant membership from matching names/emails. Partner detail uses the saved organization type or “Not recorded.”
- Student roster Last active exposes its learner-action source in desktop and mobile tooltips/accessibility labels. Displayed assignment comes from the shared enrollment policy; legacy-only assignment and unresolved assignment remain explicit. Missing grades must not suppress learning activity, and import/database-update timestamps must not be presented as learner activity.
