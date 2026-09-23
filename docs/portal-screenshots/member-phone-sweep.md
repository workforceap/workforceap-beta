# Member journey at phone width (WAP-192)

Sweep of the member journey at **390×844**, light and dark, on 2026-09-23 against
`master` at `f73aaca`, local dev server with Postgres seeded (`npm run db:push && npm run db:seed`).

- **How:** Playwright (Chromium at `/opt/pw-browsers/chromium`), `isMobile`, `hasTouch`,
  theme set via `localStorage['wap-theme']` plus `prefers-color-scheme`. Cookie banner dismissed
  and the Next.js dev badge hidden so they don't cover content.
- **Checks per screen:**
  - **Overflow:** `documentElement.scrollWidth` against the viewport, plus any visible element
    past the edge that isn't inside a scroll or clip container.
  - **Tap targets:** every visible link, button, input and tab measured against 44×44. A
    checkbox or radio is measured by its label.
  - **Contrast:** axe-core 4.11 `color-contrast`.
  - **Next step:** a human read of the first screen.
- **Screenshots** are full-page captures at 390 CSS px width (DPR 1, 256-colour PNG), named
  `member-<screen>-<light|dark>.png`. The apply screens were recaptured after the fixes below.
  The member screens have no code changes.

## Coverage

| # | Journey step (ticket) | Route captured | Source | Files |
|---|---|---|---|---|
| 1 | apply | `/apply` step 1 (eligibility) | real public route | `member-apply-*` |
| 1 | apply | `/apply/results` step 2 (programs) | real route, reached by filling step 1 | `member-apply-programs-*` |
| 1 | create account | `/apply/create-account` step 3 | real route, reached by completing steps 1–2 | `member-create-account-*` |
| 2 | `/dashboard` home | `/dev/member/home` (`approval=live`, the default) | showcase fixture | `member-home-*` |
| 3 | `/dashboard/program` | `/dev/member/program` | showcase fixture | `member-program-*` |
| 4 | eligibility screening | `/dev/member/wioa-qualification` (same client as `/dashboard/learning/wioa-qualification`) | showcase | `member-eligibility-*` |
| 5 | first lesson | `/dev/member/program?state=lessons` (DigitalLearn lesson list, "Start this lesson") | showcase fixture | `member-lesson-*` |
| 6 | `/dashboard/jobs` | `/dev/member/jobs` | showcase fixture | `member-jobs-*` |
| 7 | `/dashboard/messages` | `/dev/member/messages` | showcase fixture | `member-messages-*` |
| 8 | `/dashboard/ai-tools` | `/dev/member/toolkit` | showcase | `member-ai-tools-*` |
| 8 | one tool | `/dev/member/resume-studio` | showcase | `member-tool-resume-studio-*` |

**Skipped:**
- `/dashboard/eligibility` (the separate `EligibilityForm` intake page) has no `/dev/member`
  showcase and needs a Supabase session. It was not captured.
- The Coursera course player behind "Resume module" is external and was not captured.

## Summary

| Check | Result |
|---|---|
| Horizontal overflow | **Pass on all 11 screens × 2 themes.** Page width is exactly 390 everywhere. The only off-canvas elements are skip links and the closed drawer. The member tab strip scrolls on purpose. |
| Tap targets ≥ 44px | **Member portal: pass** (every control is ≥ 44px, and radio/checkbox labels are 44×44). **Apply funnel: 4 standalone links under 44px, fixed in this PR.** The remaining sub-44px links are inline links inside sentences (WCAG 2.5.8 inline exception). |
| Text contrast | **Member portal: 0 axe violations** in either theme. **Apply funnel: 2 light / 4–9 dark violations per screen, fixed in this PR**, except the program category chips (finding F3). |
| One obvious next step | **Pass:** lesson, eligibility, messages, resume studio, AI Career Tools, create account (end of form). **Findings:** home, apply steps 2–3, program, jobs (below). |

## Findings

"Fixed" means fixed in this PR. "Finding" means it is reported only, with the owning ticket or area named.

| # | Screen | Check | Result | Evidence | Disposition |
|---|---|---|---|---|---|
| 1 | apply, programs, create account (dark) | Contrast | Fail → **pass** | Crimson `--color-accent` (#ad2c4d) text on the dark funnel: trust-bar phone 2.64:1, FAQ link 2.77:1, "Back to …" links 2.69–2.85:1, `#1` saved-choice badge 2.48:1, consent Privacy link 2.69:1, "Log in" 2.77:1. | **Fixed:** these text uses now read `--wa-accent-text` (the `light-dark()` pair, #8c0f37 / #f39ab5). |
| 2 | apply funnel (both) | Contrast | Fail → **pass** | Step kicker `--mdx-muted` #6e6a66 on the grey kicker box: 4.41:1 light, 3.19:1 dark. Footnote 3.35:1 dark. The `--mdx-*` palette is light-only, but `html.dark` paints the funnel dark. | **Fixed:** kicker and dark-mode footnote use the theme-aware `--color-on-surface-variant` (`app/apply/apply-funnel-depth.css`). |
| 3 | every public page footer (both) | Contrast | Fail → **pass** | O*NET attribution at `opacity: 0.6`: #9b8d8f on white 3.18:1, #73676b on #121416 3.41:1 (13px). | **Fixed:** the opacity is removed (`components/Footer.tsx`). |
| 4 | apply step 1 | Tap target | Fail → **pass** | Hero "Questions? Call (512) 777-1808" `tel:` link was 132×21. | **Fixed:** 44px tall inline-flex, matching the existing trust-bar phone link. |
| 5 | apply steps 2–3 | Tap target | Fail → **pass** | "← Back to eligibility" 136×17, "← Back to step 2" 197×39, "View Salary Guide" 124×17. | **Fixed:** `.apply-step-back-nav a` and the salary-guide link are now 44px tall. |
| F1 | apply programs | Contrast | **Fail** | Category chips use white 13px text on `PROGRAM_CATEGORY_COLORS`: gold #a47f38 3.7:1, green #4a9b4f 3.44:1. | **Finding.** The colour map in `lib/content/programs.ts` is shared with the public `/programs` catalog, so changing it is out of scope for a small fix. Candidate: darker chip fills, or `--wa-gold-dark`/`--wa-success-dark` text on a soft tint. |
| F2 | apply steps 2–3 | Next step | **Fail** | At 844px tall, the hero, trust bar, 3-step tracker, time hint and back link fill the first screen. On step 2 the first program card starts below the fold. On step 3 the first field starts below the fold. The trust bar repeats the hero ("No cost to members", phone number). | **Finding** (layout restructure). Owner: follow-up under WAP-192 or the apply-funnel owner. The apply CTA hierarchy is "Approval Required" in `docs/PRODUCT_STAKES.md`. |
| F3 | apply step 1 | Next step | Note | The hero shows a "Start your application" button although the form starts directly below it, which gives two CTAs for one action. The sticky Continue is clear. | **Finding** (CTA hierarchy is Approval Required: Mike's call). |
| F4 | create account | Layout | **Fail** | Inputs render 226px wide (58% of the viewport) and the optional address group 192px, because the form sits inside nested padded cards. A long email is cut off in its field ("test.member@example.c"). The submit button is about 3,100px down the page. | **Finding** (container restructure, more than a trivial fix). |
| F5 | home (pending application) | Next step | **Fail** | With the default `approval=live` fixture, the "Your approval status" card fills the whole first screen (0–844px). "Welcome back", Today and Up next start around y≈870. Today says "Resume module" while the card says training is "Not yet approved", which gives the member two different signals. | **Finding. Owner: WAP-188** (`MemberHomeKit` / `app/(portal)/dashboard/page.tsx` are being changed in that lane). |
| F6 | home | Next step | Note | After Today there are 3 Up next rows, a Recommended tool card, 4 stat tiles, Certification path (a second "Resume module" CTA), weekly activity, points, the pipeline and the badge, for about 5,100px in total. | **Finding. Owner: WAP-188.** |
| F7 | program | Next step | **Fail** | Three filled CTAs compete: "Open Learning Hub" (hero), "Continue" on the active module, and "Add to calendar". | **Finding.** My Program is a locked product-stake area: Mike's call. |
| F8 | jobs | Next step | **Fail** | "Browse openings" is the top primary CTA, but "Open roles" says "No live openings right now" and offers two more CTAs (Update profile, Message your counselor). Meanwhile "Recommended" lists 3 roles with match %. Some of this is the showcase fixture, so it needs checking against the real `/dashboard/jobs` data states. The showcase also logs a React duplicate-`key` warning. | **Finding.** Follow-up (jobs kit, not in a sprint lane). |
| F9 | messages | Honesty | Note | The header shows "Online · Career counselor" whenever a counselor is assigned (`app/(portal)/dashboard/messages/page.tsx:180`, `activeOnline={Boolean(thread.counselorUserId)}`). That is not real presence, which conflicts with the project's "Honesty as the look" direction. | **Finding.** Follow-up. |
| F10 | eligibility (dark) | Contrast | Borderline | The inactive "Voice preparation only" segment is #aaafb5 on a 20% tint, about 4.2:1 by manual measurement. axe could not resolve it. | **Finding** (low). |
| F11 | all member screens | Navigation | Note | The member tab strip (`MemberPortalTopNav`, 12 tabs) shows about 3½ tabs at 390px and scrolls horizontally. The active tab is scrolled into view and every tab is 44px tall. | **Observation for WAP-189** (the rail trim leaves this strip as is). |

**Pass notes:**
- **Lesson:** one 52px "Start this lesson" primary, with later lessons as ghost buttons.
- **Eligibility:** a single "Save screening" primary, radios 44×44, and a "not a final eligibility decision" note up front.
- **Messages:** the composer is pinned at the bottom of the thread.
- **AI Career Tools and resume studio:** a clear first action (coach tabs / "Score").

**Showcase noise:** every `/dev/member/*` page calls `/api/member/notifications` and
`/api/portal/nav-badges`, which return 401 with no session. This is expected and not a defect.

## Changed files (fixes 1–5)

- `components/Footer.tsx`: the O*NET attribution no longer has `opacity: 0.6`.
- `app/apply/OrganicApplyPage.tsx`: the hero phone link has a 44px min height.
- `app/apply/ApplyEligibilityClient.tsx`, `app/apply/results/ApplyResultsClient.tsx`,
  `app/apply/create-account/ApplyCreateAccountForm.tsx`: accent text uses `--wa-accent-text`, and the
  salary-guide link is 44px tall.
- `app/apply/apply-funnel-depth.css`: muted kicker/footnote contrast, and the footnote link uses `--wa-accent-text`.
- `css/main.css`: `.apply-step-back-nav a` has a 44px min height and uses `--wa-accent-text`.
- `css/marketing.css`: `.apply-mobile-trust-bar__phone` uses `--wa-accent-text`.

No copy, flow, data, schema or member-portal files changed.
