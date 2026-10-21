# WAP portal route and overlap inventory

Verified against `workforceap/workforceap-beta` master **efc27e4a4ebeba09b5261e7b1c36463d01925017** on October 20, 2026. This lane read source and existing PR changes. It did not change application source, run hosted flows, send messages/emails, or alter accounts or settings.

## Coverage

The inventory contains **266 exact App Router page-file routes**, including **42 dynamic templates**. The route totals count page files, including aliases, conditional pages and the deliberate not-found boundary; they are not a claim that 266 independent screens have shipped or passed browser acceptance.

| Source group | Page-file routes | Dynamic templates | Meaning |
|---|---:|---:|---|
| Member `/dashboard` | 73 | 8 | Includes AI tools, program, applications, résumé, learning, mentor access and legacy aliases |
| Admin `/admin` | 100 | 17 | Includes `/admin/chapters` under the generic portal layout |
| Counselor | 21 | 3 | Includes caseload detail, lab review, and in-office session execution |
| Employer | 21 | 5 | Prefix includes two pages outside the workspace shell plus the public thank-you page |
| Partner | 14 | 2 | Includes legacy member aliases and referral detail |
| Shared portal | 10 | 1 | Account/profile/resources/help aliases, privacy, coach, leader dashboard |
| Authentication and transactional handoffs | 27 | 6 | Login/MFA, applications, invitations, enrollment, survey, consent and sharing entry points |
| **Total** | **266** | **42** | **Zero source files missing** |

The final kinds are **222 page**, **24 redirect**, **9 alias-with-legacy-view**, **9 conditional-page**, **1 role-router**, and **1 not-found**. The manifest retains **117 existing navigation rows**, source-observed links, source and imported-component names, direct and bounded transitive Prisma references, API endpoint strings, layout and local guard names, feature flags, and the established audit manifest's safe-navigation contracts and attended-action gates.

`parentRoute` and `suggestedBack` are structural review navigation. They are deliberately labeled as suggestions, not assertions that those controls already exist in production. Titles taken from English messages, page props, metadata or current navigation identify that basis. A fallback route-derived title is labeled as such. Static import/reference extraction is not a complete data-lineage or authorization proof.

## Access distinctions that the review must preserve

There is **no independent mentor portal role** in current `PortalRole` or the role switcher. Mentorship spans `/dashboard/mentor`, `/dashboard/mentors`, `/dashboard/mentors/[mentorId]`, `/mentor/apply`, and `/admin/mentors`. `/dashboard/mentor` can render the current mentor's sessions after a successful `getUser` and Mentor record lookup; a member without a mentor record is redirected to apply. The route must not always be presented as a redirect or as a newly invented workspace.

The existing middleware requires a validated user for **236 selected route patterns**. This is path coverage, not 236 unique authenticated screens, and additional pages enforce their own guard. Staff MFA is conditional on the existing enforcement setting and must not be changed to make a mockup pass.

| Route | Verified source boundary |
|---|---|
| `/employer/loi` | Marketing-style page outside employer layout, but the middleware's `/employer` prefix requires login. Do not label it publicly accessible. |
| `/employer/outcomes` | Outside employer layout, but middleware plus local `getUser` and `isEmployer` checks apply; read-only audit mode suppresses the view's audit-log effect. |
| `/employer/thank-you` | Explicit public exception in middleware. |
| `/admin/chapters` | Generic portal layout, admin-prefix login and configured staff MFA in middleware; the API separately requires admin and tenant scope. POST checks the proposed leader is in the organization. |
| `/leader/dashboard` | Outside protected page prefixes. Its GET API requires `getUser` and constrains both organization and leader identity. The client shell is not proof of permission to read chapter data. |
| `/dashboard/[...slug]` | Intentional `notFound()` boundary. It must be tested as missing, not rendered as a successful generic screen. |
| `/dashboard/program/coursera-enrollment` | Conditional handoff: the bare route returns to the program with an error; a valid assigned course selection can render. |
| `/pwa-start` | Authenticated role router, not its own workspace. |

Source evidence: [middleware](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/middleware.ts), [navigation](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/lib/nav/portalNav.ts), [leader data API](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/app/api/leader/chapters/route.ts), and [chapters API](https://github.com/workforceap/workforceap-beta/blob/efc27e4a4ebeba09b5261e7b1c36463d01925017/app/api/admin/chapters/route.ts).

## Concurrent work

| PR | Verified head | Existing scope to preserve |
|---|---|---|
| [#2827](https://github.com/workforceap/workforceap-beta/pull/2827) | `ef0783233ce26e602b03f66d405728a58b324942` | Five member screens, compact member navigation, shared mobile KPI/table changes, fixture-only AI hub. Do not replace it with a competing home/program/jobs/resume redesign. |
| [#2829](https://github.com/workforceap/workforceap-beta/pull/2829) | `0e3c7f96cef65a15243ec0fa726ada1e1da383dd` | Portal C safety-net and fixture acceptance, stacked on #2827. |
| [#2833](https://github.com/workforceap/workforceap-beta/pull/2833) | `69627c9de9e22df50583884485f980790a1f0fc5` | Staff protection and Phase 0 acceptance, stacked on #2829. |
| [#2835](https://github.com/workforceap/workforceap-beta/pull/2835) | `f62c4d0a4fb96c5986bc42ab1be89ff7a568860a` | Corrected readiness, fixtures and aggregate gates; still separate from hosted acceptance. |
| [#2831](https://github.com/workforceap/workforceap-beta/pull/2831) | `84f5aa6dc5a9f4babcb4782803c104d177ced262` | Counselor detail allows an authorized dual-role admin to open scoped members beyond their own caseload. Do not reimplement or weaken this boundary. |
| [#2513](https://github.com/workforceap/workforceap-beta/pull/2513) | `9bd92314844a365898e90a24afd2675746b9ee4f` | Employer empty/filter/unavailable states across jobs, applications, pipeline, matches, work queue and home; translated copy and tests. These screens must be coordinated with that existing draft. |

The complete observed changed-file lists for #2827, #2831 and #2513 are saved in `pr-overlap-files.json`. The in-repo source inventory and immutable base take precedence over stale default-branch memory.

## Acceptance boundary

The existing route audit separates safe same-origin GET navigation from attended or mutating actions. Preserve that boundary: résumé upload, voice/microphone sessions, applying for a job, changing enrollment, sending email/messages, posting/editing a job, applicant status changes, invitations and session execution do not become live acceptance passes merely because their mockups are clickable.

This lane proves complete selected page-file coverage and source provenance. It does **not** prove browser rendering, mobile layout, action persistence, staff MFA, tenant isolation, provider delivery, external Coursera behavior, microphone behavior, or production health. Those results need their own actual test receipts.

## Reproduction

`build_inventory.py` rebuilds the review metadata from the immutable base and replaces the JSON atomically. `validate_inventory.py` checks exact selected page coverage, uniqueness, normalized paths, dynamic classification, qualified titles, and hashes of all selected source files against that Git commit. The checked-in app audit harness is retained; this artifact validator does not replace its required tests.
