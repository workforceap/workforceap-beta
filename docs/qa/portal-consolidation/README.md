# Portal consolidation preview review

This change belongs on `feature/portal-consolidation-20261021`. It is a draft review branch, not a production release. The Vercel preview uses the repository's existing preview build and demo-database guard. No production merge or deployment is part of this handoff.

## Start the hand test

Open `/dev/portal-review` on the local build or the matching Vercel deployment. The page is unavailable in production. It starts with **53 member/staff sample screens** and their named scenarios, backed by [the fixture catalog](../../../lib/dev/portalReviewFixtures.ts). Separate signed-in checklists retain **36 focused workflow checks** and **269 page routes**, including compatibility redirects and sign-in/application entry pages. These are source coverage counts, not claims that every route passed a live test. Local changes are not available on an older deployed revision.

The review index is implemented on this branch and ready for preview hand testing. Confirm that its displayed revision matches the intended Vercel preview before recording results; deployment readiness and final validation evidence belong in the release handoff below.

Start with sample screens or a member walkthrough. Filter by portal, screen/scenario text or result; expand a screen to see its scenarios, local interactions, limits and manual notes. The source coverage test requires every member/staff fixture route to appear exactly once. Some sample controls still enter real provider/authenticated handlers, and `/dev/staff/people` is local-development-only; inspect each entry's limits first.

For signed-in acceptance, choose the focused workflows or complete route list and use approved test accounts. Mark light mode, dark mode and phone coverage separately; record Pass, Issue or Blocked with reproduction notes. Opening a screen never marks it passed. The index saves review notes in this browser for the displayed revision. **Export review CSV** downloads the full review for sharing. Keep personal data and credentials out of notes and exports.

Local development compiles routes on first visit, so cold navigation can be much
slower than repeat navigation. Fixture loading feedback makes that wait visible;
it is not a production performance benchmark. The sample shell avoids live chrome
polling and tour writes. Jobs filters, saved controls and application confirmations
operate on local sample state and reset on reload; they do not send an application,
notify a counselor or establish persisted account history.

Record routes such as `/admin/members/[id]` link to their starting list; choose a real record from that list. Invitation, consent and survey routes require valid issued links. The index does not invent record IDs, bypass account access or perform business actions.

The offline starting checklist is [screen-checklist.csv](screen-checklist.csv). The complete source inventory is [route-inventory.json](route-inventory.json). Regenerate both with:

```bash
node scripts/generate-portal-review-map.mjs
```

## What changed and what to exercise

| Area | Primary destination | Acceptance focus |
|---|---|---|
| Member Resume | `/dashboard/resume?view=files` | Files, Score, Rewrite and Coach share one workspace. Keep original/revised downloads, histories, source context and application snapshots. Switch views with an unfinished draft. |
| Career exploration | `/dashboard/learning/interest-profiler` | Carry an occupation into Skill Mapper, save/open the exact owned lookup and continue to Training Bridge with that result. |
| Skill Mapper | `/dashboard/ai-tools/skill-mapper` | Real O*NET search/details, the occupation radar, member-versus-target radar, numeric alternatives, detailed skill list and export remain reachable. Clearly distinguish samples, estimates and occupational evidence. |
| Training | `/dashboard/ai-tools/training-bridge` | Retain selected lookup and owned program context. An invalid or inaccessible lookup must not silently switch to another result. Keep curriculum/provider links and prerequisites. |
| Interview practice | `/dashboard/ai-tools/interviews` | Open each format and confirm written/voice/coaching labels match behavior. Preserve specialized routes and histories. |
| Counselor Today | `/counselor/today` | Needs attention, Awaiting reply, Decisions, Follow-up and Overview retain their original scoped data/actions; attention filters include priorities, at-risk and inactive members. |
| Admin Students | `/admin/students` | Roster, Manage, Training and Readiness retain server filters, bulk actions, CSV, sorting, pagination and role gates. Keep interview readiness separate from training completion. |
| Admin Reporting | `/admin/reporting` | Preserve selected period, population, definitions, tab links and export context. Existing calculations stay in their owning reporting loaders. |
| Employer Jobs | `/employer/jobs` | Full Post, Quick Post, Import, edit and job detail remain accessible on phone and desktop. Work Queue remains the daily action destination. |
| Employer Candidates | `/employer/candidates` | Applicants, Matches and Pipeline reuse the existing separate records/actions. Review application status, matched suggestions, hiring transitions and return filters. |
| Partner Impact | `/partner/impact` | Outcomes, Milestones and Exports retain scope, consent restrictions and date semantics. Verified placements and reported milestones remain distinct. Attention remains separate. |

## Across every portal

1. **Readability:** check light/dark backgrounds, crimson/gold accents, normal and muted text, status labels, disabled controls and focus rings. Appearance belongs to the existing theme system.
2. **Responsive behavior:** use a narrow phone, tablet and desktop. Check form controls, tabs, tables, sticky navigation, dialogs and the final Save/Next action. The member phone strip has the same five daily destinations as desktop; the preassessment remains directly visible and More pages retains the other shortcuts.
3. **Context:** apply a search/filter/sort/page, open a record, change its panel, then use Back to results. Also use browser Back/Forward. Repeat with an explicit locale prefix. Nested detail/edit links should retain the original list.
4. **Existing paths:** open a bookmarked legacy URL for each consolidated view. It should enter the correct workspace with relevant query context intact. Open the guided tour and verify its targets still exist.
5. **Failures and saves:** check pending/success/error states, retry behavior and failed/partial loads. Unavailable data should not become a reassuring zero. Do not mark provider-dependent execution as passed merely because its screen renders.
6. **Role boundaries:** test a member, counselor, employer, partner, organization admin and super-admin where available. Keep restricted actions and details restricted. A missing account or provider configuration is a Blocked test, with the reason recorded.
7. **Human and AI help:** Messages must still open the human conversation. AI Advisor/Resume Coach must remain clearly labeled AI destinations.

Use designated preview records for writes, sends, job-stage changes, bulk actions and exports. Keep the preview's configured provider behavior in mind when testing a real send or external action. The normal application confirmation and authorization controls remain in place.

## Local visual proofs

The `/dev/member/*` and `/dev/staff/*` proof pages render actual components with synthetic data and remain blocked in production. They help verify layout, keyboard interaction, data alternatives and error states without an authenticated database session. They do not certify role authorization, writes or live provider calls.

New proofs include `/dev/staff/counselor-workspace` and `/dev/staff/students-workspace`, with the same `view` query parameters as their real workspaces. `/dev/staff/reporting` exercises the report chrome. The Funder CSV, Program Catalog, Outcomes CSV and Board PDF controls on `/dev/staff/reporting?tab=exports` use real authenticated preview API endpoints, so review those downloads with a designated preview admin account. The real portal and every old compatibility route remain the acceptance targets in the review index.

Employer and partner proofs include:

- `/dev/staff/employer-candidates?view=applicants`, `/dev/staff/employer-candidates?view=matches` and `/dev/staff/employer-candidates?view=pipeline`: the actual Candidates header and existing view clients with empty rows. These cover workspace tabs, mobile/desktop empty states, theme and applicant filter-control layout. They do not validate populated candidate tables/cards, match scores, pipeline transitions, interviews, resumes or employer-scoped access. Exercise those with designated records in the authenticated preview portal.
- `/dev/staff/partner-impact?view=outcomes` and `/dev/staff/partner-impact?view=milestones`: the actual Impact header, empty outcome presentation and synthetic pending/verified/certification milestone records. The fixtures preserve the visible distinction between reported and verified placements; they do not load partner records or verify the authorization and consent rules that produce them.
- `/dev/staff/partner-impact?view=exports` and `/dev/staff/partner-impact?view=exports&tier=restricted`: the actual export presentation, including the restricted export set. Fixture download links return to the explanatory note; they do not generate a CSV or call an export API. Check actual export contents, disclosure scope and minor-consent restrictions through the authenticated partner portal.

Member proofs include:

- `/dev/member/skill-mapper`: the actual occupation and member-versus-target radars, numeric alternatives and skill details, using labeled synthetic values. Search, extraction and export are disabled in the proof.
- `/dev/member/interviews`: the actual interview chooser and role entry. Choosing a format links to its signed-in tool; the proof does not start a microphone, camera, recording or email.
- `/dev/member/resume-studio`: the real Resume workspace with separate original and revised sample files. Use `?view=score&state=filled`, `?view=rewrite&state=filled` and `?view=coach` for the score, rewrite and coach states. Upload, generation, account reads and voice are disabled in the proof.

## Release gate

The handoff must identify the draft PR, the exact ready Vercel preview revision, static/build/test evidence and any outstanding authenticated/provider checks. Keep the PR unmerged during hand testing. A production release requires a separate decision after this review.
