# Portal Nav Spec — Live IA + Reachability

**Status (2026-09-23):** Document the **live** member + staff navigation. Do not “restore”
a flat-only member shell from older #2069 notes — that claim drifted from production.

**Naming:** the member toolkit hub (`/dashboard/ai-tools`) is **AI Career Tools**
everywhere — rail (`MEMBER_TOOLKIT_HUB_LABEL`), mobile tab strip (`nav.careerToolkit`),
mobile header band, page `<title>`, `PageOpener`, the `ToolkitToolChrome` kicker and
“Back to AI Career Tools” link, and the `public/manifest.json` shortcut. This follows the
one-name rule in `docs/KIT_GUIDE.md` (WAP-102): do not reintroduce “Career Studio”,
“Career Toolkit” or “AI Tools” as names for that route.

**Design references:** `docs/mockups/wa-v2-member.html` (aspirational flat top-nav),
`docs/mockups/workforceap-admin-full.html` (staff). **Live code** wins over mockups when
they disagree: `WorkspaceShell.tsx`, `MemberPortalTopNav.tsx`, `lib/nav/portalNav.ts`,
`docs/KIT_GUIDE.md`.

**Rule of thumb:** **members = warm left rail (desktop) + sticky top tabs (mobile) ·
staff = dense left sidebar (+ role mobile bottom tabs).**

---

## 1. Member nav — what ships today

### Desktop (≥769px)

`WorkspaceShell` with `portalRole="member"` renders the full `MEMBER_PORTAL_NAV_ITEMS`
command rail. Five permanent rows stay visible without opening a group: **Home**,
**My program**, **Job board**, **AI Career Tools** and **Messages**, plus the single
contextual tool row on `/dashboard/ai-tools/*` pages (see below). Everything else sits
in the disclosed **Tools & careers** (`workflows`), **Training & progress** (`insights`)
and **Account & support** (`manage`) groups — including **My progress**
(`/dashboard/readiness`) and **Skill missions** (`/dashboard/missions`), which live in
Training & progress. A group opens by itself when the current route is one of its rows,
so a member on My progress or Skill missions still sees that row, marked current. The
collapsed 72px rail has no disclosure: it lists every row as an icon. Kit
tokens: warm surface, ~232px rail (208 laptop / 72 collapsed), sentence-case labels,
16px / 44px targets, `aria-current` on the most specific destination only.
Each destination appears once in the rail: Home owns `/dashboard`, while Profile &
settings owns `/dashboard/profile`. The former duplicate "My account" row had the
same home href and added no destination.

Primary order (`lib/nav/portalNav.ts`, pinned by `lib/nav/portalNav.test.ts`,
`lib/nav/memberToolRoutes.test.ts` and `tests/components/workspace-sidebar.test.tsx`):
`/dashboard` · `/dashboard/program` · `/dashboard/jobs` · `/dashboard/ai-tools` ·
`/dashboard/messages`.

> **Superseded 2026-09-23 by WAP-189 with owner approval.** The earlier rule — “Primary
> order is fixed by PR #2322 and must not be changed” (seven rows, with
> `/dashboard/readiness` after Job board and `/dashboard/missions` after the hub) — no
> longer applies. The five-row order above is the new baseline; change it only with the
> same owner sign-off. Keep AI Career Tools in primary (the member tour anchors
> `tour-ai-tools` on it), and do not move My progress or Skill missions into Account &
> support (the e2e tab-order pin in `tests/e2e/workspace-shell-layout.spec.ts` covers that
> group). The mobile `MemberPortalTopNav` order is unchanged and still pinned by
> `lib/marketing-public-ui-regressions.test.ts`.

#### Contextual AI Career Tools tool row

AI Career Tools has ~22 tool routes under `/dashboard/ai-tools/*` and none of them owns a
permanent rail entry. Before this change the rail highlighted the hub — or nothing — on
every one of them (16 of 28 member routes marked the wrong page).

The rail now grows **exactly one** extra row: the tool the member is currently inside,
nested under the AI Career Tools entry and marked `aria-current="page"`. It disappears
again the moment they leave.

- **On a tool page:** 6 rows visible without opening a group (5 + the tool).
- **On the hub (`/dashboard/ai-tools`) and everywhere else:** 5 rows, zero tool rows.
- **Never** more than one tool row, whatever the route depth
  (`/dashboard/ai-tools/interview-practice/session/42` still shows one).

A row-per-tool alternative was rejected: 18 permanent rows pushed “My program” and
“Job board” off the bottom of a phone screen.

Implementation: `lib/nav/memberToolRoutes.ts` (`withContextualToolRow`), consumed by
`WorkspaceShell`. Routes a permanent entry already claims keep their own row — Job
applications owns `/dashboard/ai-tools/application-tracker`, the hub owns
`/dashboard/ai-tools/studio` — so no duplicate appears. A tool slug with no entry in
`MEMBER_TOOL_LABELS` still gets a humanized row, so a new tool route highlights correctly
on the day it ships without a nav change.

### Mobile (≤768px)

`MemberPortalTopNav` sticky horizontal tabs (daily destinations). The sidebar becomes the
hamburger drawer for the full IA. `MobileBottomNav variant="portal"` is a **no-op**.

The strip carries **12** destinations (was 7, of which only ~3 fit on a phone):

| Tab label (i18n) | href |
|---|---|
| Home | `/dashboard` |
| My program | `/dashboard/program` |
| Job board | `/dashboard/jobs` |
| My progress | `/dashboard/readiness` |
| Messages | `/dashboard/messages` |
| AI Career Tools | `/dashboard/ai-tools` |
| Skill missions | `/dashboard/missions` |
| Job applications | `/dashboard/job-applications` |
| Resume | `/dashboard/resume` |
| Learning hub | `/dashboard/learning` |
| My certificates | `/dashboard/certifications` |
| Profile | `/dashboard/profile` |

Profile replaced a duplicate Lilley/AI Advisor tab (AI Advisor stays under Tools & careers
in the rail/drawer).

Because 12 tabs no longer fit, `MemberPortalTopNav` **scrolls the current tab into the
centre of the strip** on every navigation. It scrolls the list element, not the page, so
the document never jumps. Only the longest-matching tab reads as current, so a tool route
lights AI Career Tools and nothing else.

**Mobile header band.** Below 769px the member tagline is hidden, which left the header
band empty. `WorkspaceShell` now renders the resolved current-page name there
(`.workspace-shell-current-page`) — including the AI Career Tools tool you are inside, e.g.
“Salary negotiation”.

### Historical flat-nav target (not live)

An earlier plan (#2069 / `wa-v2-member.html`) aimed at a single flat top-nav with **no**
member left rail. That is **not** the current shell. Treat the table in older revisions as
an aspirational mockup only. Do not hide the member rail with CSS alone — that previously
orphaned destinations and was reverted.

---

## 2. Reachability requirement (do NOT orphan)

Secondary member routes must stay reachable from the rail/drawer or an in-page home.
Examples: certificates, career brief, job applications, resume, readiness, weekly recap,
missions, learning hub, help, guide, Lilley (`/dashboard/counselor`), AI Career Tools.

**Acceptance:** every `MEMBER_PORTAL_NAV_ITEMS` href is either a top tab or one click from
the rail/drawer (or a documented in-page link). QA = signed-in member session.

---

## 3. Staff nav — dense sidebar (unchanged)

Employer / Partner / Counselor / Admin keep the dense left rail. **Do not flatten staff
portals.**

### Staff mobile bottom tabs (subset of the rail)

| Role | Tabs |
|---|---|
| Employer | Overview · Jobs · Pipeline · Messages |
| Counselor | Overview · Inbox · Members · Messages |
| Partner | Overview · Members · Messages · Milestones · Outcomes |
| Admin (super-admin) | Today (`/admin`) · Students · Messages |
| Admin (org admin) | Today (`/admin`) · Students · Applications (`/admin/command-center?queue=applications`) |

Admin and counselor mobile destinations must stay aligned with rail hrefs when labels
rename (e.g. Today, Students, Inbox zero). Admin tabs follow the rail's role gate: `/admin/messages`
is super-admin only, so an org admin gets the Applications workbench in that slot (WAP-190).

---

## 4. Implementation notes

- Compose new chrome from kit shells (`AppShellMember` / `AppShellSidebar`) when swapping
  shells; until then preserve `WorkspaceShell` features (resume hint, role switcher,
  impersonation banner, footer, theme, account menu).
- `html[data-portal-role="member"]` is set in `WorkspaceShell` for member-scoped CSS.
- Dark mode: `--wa-*` tokens via `light-dark()`; no new token families.
- Nav data: `lib/nav/portalNav.ts` (+ i18n twin). Public marketing chrome is separate
  (`MainNav`, `MobileBottomNav` marketing variant, Astro `Layout.astro`).

---

## 5. Out of scope here

- Full AI Career Tools consolidation / rail rewrite. The contextual row above is **nav
  only**; tool pages keep their own titles and chrome.
- The separate “Job board” / “Job search” / “Pipeline” naming inconsistency
- New public `/membership` page (Membership noun currently → `/apply` in About)
- Merging Astro vs Next dual public renderers
