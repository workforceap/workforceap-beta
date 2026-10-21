# Independent review of the WAP standalone portal proposal

## Current result and boundaries

The independent model suite passes **16/16 contracts**, with no failures, on the final inspected model. All concrete findings raised during this targeted integration review are resolved in source: domain dispatch, same-record related navigation, staff job destinations, password/checkbox handling and malformed-parameter fallback. **No blocking source/model findings remain in this scoped review.** Root’s final browser matrix is separate evidence and was still running at this handoff.

This is an offline proposal review, not authenticated application acceptance or production security verification. The review lane made no application, provider, database, credential or live-lab request. Root owns the separate browser matrix, screenshots and final build verification. Historical findings are retained in `prototype-review-initial-snapshot.md`; they must not be confused with failures of corrected files.

## Reviewed source identity

Repository source base: `workforceap/workforceap-beta` at `efc27e4a4ebeba09b5261e7b1c36463d01925017`.

The following hashes identify the exact local files inspected. Concurrent root changes require refreshing this table and the browser evidence before final handoff.

| File | SHA-256 |
| --- | --- |
| `review-model.mjs` | `928fcdbeead6ae7bb3f4e1fdce0a94cc81da58289236b217710303a5c51686f9` |
| `review.js` | `e043127a25ef2127acf33c6f3a53ac26b38c2363e11759003fd1851121173b66` |
| `review.css` | `54dd5033f3cc74e29eb7dac966921610eb1fe7110121f2dba4fbdfcb433e92f3` |
| `build.mjs` | `011d6beb75f7e5d52e3ab170f10fdb402fa314f877c2b8471ad2b51bf2517cc2` |
| `screen-definitions.json` | `f51a80e163316c56a5042c1adfdacf804005d2dbd4a4c05b007efa7481a10e7f` |
| `index.html` | `f5711f6358d63900731b4c3df13f0fcdbe61ceed2e3bee355a50c40851ecf651` |

The final inspected HTML is **820,918 bytes**. A direct content comparison confirms that this HTML embeds the current renderer and current model (with only the builder’s expected `export` removal). Any later edit requires a rebuild and fresh evidence; these hashes identify this artifact only.

## Independent model verification

Command:

```sh
node /workspace/scratch/c906c3590728/wap-portal-delivery/prototype-model-review.mjs
```

Node `v24.19.0`; exit **0**; **16 pass, 0 fail**. The script records the model hash with its results and does not import application clients or contact providers.

| Contract | Result |
| --- | --- |
| all proposed primary navigation destinations resolve | pass |
| all non-not-found fixture paths resolve to their own route template | pass |
| unknown dashboard route is not treated as a loaded page | pass |
| known job detail retains a specific source route | pass |
| identical request key does not duplicate a sample message | pass |
| same key with different payload is rejected as a mismatch | pass |
| stale profile version preserves the saved profile | pass |
| staff cannot review private lab draft before submission | pass |
| submitted lab copy survives subsequent private edits | pass |
| uncertain sample request reconciles without duplicate persistence | pass |
| duplicate application for the same member and job is refused | pass |
| application for an unknown job is refused | pass |
| application for a draft job is refused | pass |
| editing a job preserves its identity and publication state | pass |
| stale job edit does not replace a newer version | pass |
| malformed encoded route parameter does not crash navigation | pass |

These are synthetic model contracts. They do not establish server authorization, database persistence, provider delivery, deployed navigation or React component behavior.

## Domain integration review

The frozen definitions cover **156** generic list/form/detail route contracts using **133** domain schema families, **354** synthetic rows and **382** existing source references. The integrated renderer uses domain-specific forms, cards or tables; it retains the synthetic-data label and source-contract action.

Verified source behavior:

- Domain forms are read-only; consent checkboxes are disabled. They do not have a submit form or mutation action. Select/date examples remain review representations, not an executed backend contract.
- Password examples are blank. The generic submission handler removes every actual password-type control by its name before drafts, confirmations or receipts. Input/change draft handlers exclude password controls.
- Checkbox drafts use `checked` state when captured and restored. Domain checkboxes remain read-only and cannot record consent.
- “Inspect example” looks up the clicked row ID in that route’s own definition and displays its fields in a read-only dialog. It does not invent a server ID or application outcome.
- All 156 schema primary actions resolve to inventoried page routes. None targets an API or a provider. The only cross-group schema action is the documented `/coach` → `/dashboard` handoff.
- Broad generic dispatch was replaced with exact interactive roster, application and member-detail allowlists. Employer work queue, admin enrollment pipeline, personal job tracking, J5/J6 billing, stakeholder summaries and unmatched Coursera identities now reach their appropriate domain definition instead of unrelated member/application fallback content.
- The malformed deep-link decoder no longer throws. Invalid encoded IDs remain nonmatching rather than being converted to a valid sample identity.

## Final navigation corrections verified

### Domain dispatch keeps the correct workflow

The broad old member/application regular expressions no longer intercept domain routes. Interactive rosters and primary member/application fixtures use exact route allowlists. Employer work queue, admin pipeline, member personal applications, J5/J6 billing, stakeholder summaries and unmatched Coursera identities reach the corresponding read-only domain view. An unmatched external Coursera email is no longer presented as the first local member.

### Related navigation retains the selected record

Both `link()` and `relatedLinks()` now use the same contextual resolver. `preserveRouteParams()` carries parameters only when the source and target share the resource prefix and parameter position. It does not globally reuse a generic `[id]` across unrelated domains.

Five focused pure-function checks passed during correction: member-002 → its billing page; billing → the same member; sample-002 job → its edit page; that job → its applicants; and member-002 → an unrelated job route without reusing the member ID. Root added the concrete selected-member handoff to the browser regression lane.

### Job navigation respects the selected workspace

Member job detail retains preparation and application controls. Employer job detail retains employer edit/list/application/message destinations. Admin job detail returns to its existing job-review queue; the admin job list no longer offers employer job creation. These are proposed navigation semantics, not proof of production role authorization.

### Malformed deep links no longer become a valid first record

The guarded decoder now returns the raw malformed value after a decode failure. It stays nonmatching in the isolated job/member fixture and does not activate the former empty-string fallback to sample-001/member-001. The independent model no-throw regression passes, and root added the missing-record browser assertion. No request is made for this route check.

## Earlier findings resolved in current source

| Earlier issue | Current evidence |
| --- | --- |
| “Keep editing” submitted a form | Action helpers emit `type="button"`; intentional submit remains explicit. |
| Roster/job rows all selected the first fixture | Concrete row links, selected-record lookup and contextual related links retain their IDs. |
| Saved résumé showed hardcoded old content | Confirmed fixture text and its version render in the document pane. |
| Form drafts vanished on rerender | Non-password inputs are stored by route; checkbox checked state is handled. |
| Entry confirmation discarded reviewed data | Confirmation retains its reviewed payload after password removal. |
| Skip link changed the workspace | Dedicated skip focus preserves the current route. |
| Icon-only row links were unnamed | Empty-label link helper supplies an accessible name. |
| Same key accepted changed content | Request identity mismatch is rejected; independent model check passes. |
| Unknown/draft jobs accepted applications | Validation rejects both; independent model checks pass. |
| Job edit created another row | Selected job identity/count/publication state are preserved; stale versions are refused. |
| Uncertain requests had no UI recovery | Pending state preserves the original request and exposes reconciliation. |
| Generic application detail mixed unrelated fields | Specific application lookup retains member, job and application context. |
| Saved-state selector implied persistence | A no-receipt state is explicitly labeled a visual example. |
| Invalid tab ARIA and modal trigger replacement | Pressed-button semantics and original modal trigger retention are present. |
| Mobile drawer did not behave as a modal | Workspace menu uses the native dialog path. |
| Domain screens dispatched to generic member/application content | Exact allowlists now protect domain routing. |
| Related templates reset member/job ID | Both link helpers preserve shared resource context. |
| Admin/employer job pages linked into member/employer-only flows | Role-specific job actions now use the relevant existing destinations. |
| Malformed decode became an empty ID and selected the first fixture | The raw invalid parameter remains nonmatching. |

Source inspection is not a substitute for the final keyboard, focus, mobile, reduced-motion and screenshot checks. Root’s browser evidence records those separately.

## Evidence limits retained in the handoff

The 266-route inventory includes redirects, aliases, conditional pages, a role router and a not-found route; it is not a count of 266 independently implemented application pages. The 15 journeys are acceptance specifications whose production assertions require isolated authenticated fixtures or separately authorized hosted acceptance. Local role selection is a review control, not authentication.

In-memory drafts reset on document reload. Query-sensitive application subviews require explicit parity checks beyond parent-route resolution. The prototype chat still scrolls on shell rerender; the separate production-component message-continuity patch has its own mocked component/browser evidence and must not be credited to this HTML.

The source model imports no application client. The builder embeds CSS, JSON and fonts, with `connect-src 'none'`, `form-action 'none'`, `frame-src 'none'` and data-only image/font policies. Deliberate pinned GitHub source links are permitted reviewer navigation. Root’s final browser report must independently establish zero unexpected network requests for the delivered artifact.

The supplied suppression-lookup 401 remains a separate unresolved operational incident. This review establishes neither key permissions nor suppression-webhook and delivery reconciliation in production. Saved, provider accepted, delivered, suppressed, bounced, complained and unknown remain distinct states.

## Handoff artifacts

`portal-review-readme.md` provides the requested repo-ready README content: pinned source identity, exact route-kind counts, build/verify commands, data/journey scope, concurrent PR ownership and explicit live-acceptance boundaries. Root may copy it into the repo after its final source edits. This agent has not changed root repository files or performed external writes.

## Post-review packaging note

After the inspected snapshot above, root reported two final presentation/navigation adjustments: wider-table handling and ordinary Previous/Next navigation excluding the deliberate not-found contract, while retaining all 266 contracts in the catalog and verification matrix. Root reports the rebuilt prototype as 821,344 bytes. The earlier hashes remain the historical reviewed snapshot; this note makes no new functional or browser-verification claim. The final capture manifest and delivered-artifact hashes must identify the later packaged build.
