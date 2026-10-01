# Portal Reskin — Review Guide & Sign-off

**Branch:** `feature/portal-design-system` · **PR #2068** · **Preview (demo Supabase):**
`https://workforceap-beta-git-feature-p-793c79-mabrown040-5207s-projects.vercel.app`
Login: `mabrown040@gmail.com` (demo super-admin). **Not merged — awaiting sign-off.**

## Sign-off summary (what I verified)

Every portal is reskinned to the design kit and renders clean — swept live on the preview:

| Portal | Coverage | Result |
|---|---|---|
| **Admin** | 49 routes (Tier 1/2/3) | all render kit, 0 error boundaries; command rail matches `admin-full.html` (branded header, in-rail search, flat groups, **crimson active**, badge pills) |
| **Member** | 24 key routes | all render; Progress / Profile / Certs / Voice Studio match the fire mockups |
| **Counselor** | overview + nav | dark rail, KPI strip, triage list, crimson active |
| **Employer** | overview + nav | dark rail, 6-stat KPI, Voice Assistant card, crimson/gold quick actions |
| **Partner** | overview | renders branded ("Workforce Solutions Capital Area") |

**Voice sessions** now all use the brand palette (was a rainbow of off-brand colors):
- Member counselor orb (historical #2068 label): pink `#db2777` → **crimson** `#ad2c4d`
- Resume coach: blue → crimson · Interview coach: purple → crimson (action coaches = crimson)
- Readiness coach: teal → **gold** `#a47f38` (achievement) · WIOA: teal → **blue** `#2b7bb9` (support)
- Active "CONNECTED" voice session (`PortalVoiceSession`) default → brand crimson
- In-office sessions (dad's flow): **rich Walk-in / Existing-member operator flow restored as default** (my earlier reskin had wrongly buried it behind a thin table).

**Current state (2026-08-28):** the member surface is Lilley, the AI career coach, and uses the support-blue voice lane. The palette bullets above record the historical #2068 review.

Build gates green every push: `tsc` + Material-Symbols glyph check + `next build`.

## What to review (in priority order)

1. **Admin command rail** — `/admin`. Confirm: branded shield header, in-rail search, flat groups, the current page's row is **solid crimson**. Click through Students/Employers/Partners/Counselors/Mentors/Board/Jobs/Programs — each should be a KPI strip + kit table/cards.
2. **In-office sessions** (dad's flow) — `/admin/sessions`. Confirm the **Walk-in / Existing member** cards + session history are the default (not a bare table). Run one (`Start walk-in`) end-to-end.
3. **Voice sessions** — `/dashboard/ai-tools/studio` (the coach cards), `/dashboard/counselor` (the crimson orb), and start a Resume/Interview voice session — confirm the active "CONNECTED" screen pops **crimson** (no more pink/purple/teal).
4. **Member fire pages** — `/dashboard/readiness`, `/dashboard/profile`, `/dashboard/certifications`. Match the mockups; data is sparse on this account (see judgment).
5. **Persona portals** — `/employer`, `/counselor`, `/partner` overviews. Dark rail + KPI + lists.
6. **Dark mode + mobile** — toggle the moon icon; resize to phone. Rail → drawer, tables → cards.

## My judgment

- **Solid / done:** the reskin is consistent and brand-accurate across all five portals; the command rail matches the mockup; voice is on-palette; in-office sessions flow is the rich operator experience; **the member nav is the warm left rail on desktop plus sticky top tabs on mobile** (the #2069 flat single-level top-nav is a historical target, not live — see `docs/PORTAL_NAV_SPEC.md`); the **demo account is seeded** (readiness 75, 2 certs, course progress, applications) so member pages render populated like the mockups.
- **Member nav (live):** warm left command rail on desktop (`MEMBER_PORTAL_NAV_ITEMS` via `WorkspaceShell`; Home · My program · Job board · AI Career Tools · Messages are the five permanent rows, plus one contextual tool row on `/dashboard/ai-tools/*` pages, with My progress and Skill missions under Training & progress — WAP-189) and sticky horizontal top tabs on mobile (`MemberPortalTopNav`, 12 tabs: Home · My program · Job board · My progress · Messages · AI Career Tools · Skill missions · Job applications · Resume · Learning hub · My certificates · Profile — the table in `docs/PORTAL_NAV_SPEC.md` §1 Mobile). Full IA stays in the rail/drawer — do not CSS-hide the member sidebar alone. Staff portals keep the dense left rail; see `docs/PORTAL_NAV_SPEC.md`.
- **Minor polish (non-blocking):** Lilley's AI career-coach surface uses a couple emoji (🎙️/🔊) in the active state where the design rubric prefers SVG; the rail footer has no user-identity block (needs a user-name prop threaded into the shell).
- **Note (not mine):** a 20h-old git stash `loose-non-kit-changes` (coursera B4B client + a 1-line nav tweak) sits on the branch — left untouched; looks like another session's in-progress coursera work. Reconcile or drop before merge.

## Architecture reference
`docs/ADMIN_PORTAL.md` (kit pattern, nav/rail, APIs, build gates). gbrain: `projects/workforceap/admin-portal-reskin`.
