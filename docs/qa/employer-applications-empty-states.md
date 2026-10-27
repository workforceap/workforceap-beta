# Employer applicants: English empty states

One server view, [EmployerApplicationsView](../../components/employer/workspace/EmployerApplicationsView.tsx),
serves `/employer/candidates?view=applicants` and `/employer/applications`. After the
existing employer authorization and its two reads (one list, one count, same
`{job: {employerId}, status?}` predicate), it passes `{locale, filteredTotal}` to the
desktop and mobile clients. No read, redirect or navigation rule was added.

## Behavior

| Request | Evidence | Result |
| --- | --- | --- |
| any locale | unfiltered total is zero | Existing translated `employer.noApplicationsYet` / `postRoleToStartReceiving` / `postAJob` (route-owned) |
| `en` | no rows, valid stage, filtered total zero | "No applicants at the {stage} stage" · "Clear the stage filter to see every applicant." · Show all applicants |
| `en` | no rows, filtered total positive (with or without a stage) | "No applicants on this page" · "Return to the first page to see the current list." · Show all applicants |
| `en` | rows present | Existing table and cards |
| `es` / `fr` / `pt`, unknown locale, missing or unusable count, direct client callers without context | — | Existing rendering, unchanged |

Stage words come from the employer audience of
[jobApplicationStatusVocabulary](../../lib/status/jobApplicationStatusVocabulary.ts)
(New, Reviewing, Interviewing, Offer extended, Hired, Not selected). Both actions use
`employerApplicationsListHref({sort})`: status and page are cleared, the sort and the
canonical Applicants view are kept. The page-empty copy does not claim the URL is past
the last page; the count and list reads are not one snapshot, so a list change between
them produces the same state. New inner headings are `h3` under the Candidates `h1` and
Applicants `h2`.

The gate is the request locale from `getLocale()` in the authorized view. Message
presence is not a gate: `i18n/request.ts` deep-merges English into every locale, so the
two new groups would otherwise reach es/fr/pt in English. Query parameters, cookies and
paths do not participate.

## Scoped English catalog (temporary)

[messages/scoped/employer-applications.en.json](../../messages/scoped/employer-applications.en.json)
holds six leaves under `empty.employer.{applicationsFiltered,applicationsPage}.{title,body,action}`
and is read only by [EmployerApplicationsEmptyState](../../components/employer/EmployerApplicationsEmptyState.tsx)
through a dedicated `createTranslator({locale: 'en'})`. It is not registered in
request, root or shared messages, so `tests/lib/empty-copy.spec.ts` key parity and the
four shared dictionaries are unchanged. No parity exemption exists.

When native es/fr/pt review of these two groups is complete, a separate change should
move the reviewed groups into `messages/*.json`, read them through the request
translator for every reviewed locale, and delete the scoped file and its locale gate.

## Held and residual work from PR #2513

PR #2513 (`9bd92314844a365898e90a24afd2675746b9ee4f`) stays open and is not
incorporated. This slice delivers only the English semantics of `applicationsFiltered`
and `applicationsPage` against the current owners (old mobile local-chip reset is
obsolete; the page body is narrowed). Still pending on that PR:

- `applications` first-state body and the View your postings secondary action.
- `postings`, `postingsFiltered` (jobs page, EmployerJobsBoard).
- `pipelineNotLive`, `pipelineNoMatches` and the posting/live/match classifier (pipeline, kanban, match history).
- Match-history defaults and the optional posting-count variant (no tenant-scoped count exists on the matches page).
- `homeCandidates`, `homeOpenRoles` (EmployerHomeKit).
- `workQueueReviewClear`, `workQueueStaleClear`, `workQueueInterviewClear`, `workQueueUnavailable`.
- The shared EmployerEmptyState component, EMPLOYER_EMPTY table and its old spec (source for later slices).
- es/fr/pt copy (38 leaves per locale) and glossary/placeholder tests, held for native-language review.
- The seven legacy employer keys the PR deleted stay; five are still used by the jobs page.

## Evidence and limits

- Render/server behavior: `tests/components/employer-applications-empty.spec.tsx` and
  `tests/app/employer-applications-empty-view.spec.tsx` use real `createTranslator` and
  `NextIntlClientProvider` with the actual catalogs and synthetic auth/Prisma doubles.
- Synthetic visual fixture (non-production only): `/dev/staff/employer-candidates?empty=stage`
  (optional `status`, default Reviewing) and `?empty=page` (positive total), each with an
  optional `sort`. The request locale gates them as in production; without `empty` the
  fixture is unchanged. No reads or writes.
- Not proved here: authenticated employer acceptance, real data, hosted CI, and the
  375/768/1440 light/dark browser pass, which belong to the release owner.
