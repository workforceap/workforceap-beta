# Funded cohort follow-up receipt — October 15, 2026

The source changes below extend audit-fix release `6010786abe90a2af007825fcb6c29774a59f5c37`. This preparation receipt distinguishes source validation from the completed production counselor cleanup; final CI and deployment evidence belongs on the release pull request.

## Preassessment retake access

Admins can open `/admin/assessments` → **Student results & retakes**, which leads to `/admin/assessments?ui=legacy`. The per-student **Request final retake** action uses the existing authorized admin endpoint. Filters and pagination retain that results view. The member assessment page explains how to request authorization and links to counselor messaging.

The limit remains **two completed attempts total**. Staff can authorize the second attempt only after the first is complete; a pending authorization is shown as pending rather than creating another attempt. The previous result and history remain saved, and the member receives the existing final-attempt prompt. No third attempt or automatic intake/training approval is introduced.

An independent production read at 21:36 UTC confirmed migration
`20261015120000_assessment_two_attempts` is applied and not rolled back.

## Digital Literacy in English and Spanish

The existing English/Español portal switch now controls the module title, summary, practice topics, lesson labels, completion controls and learning destinations. The ten course keys, local completion records, points and counselor-visible progress remain the same in either language.

English retains its existing lesson/material links. Spanish actions explicitly open a Spanish course catalog and ask the member to choose the topic. AT&T's curated catalog serves its covered topics; file management, cloud storage, Word and job-search modules use the full DigitalLearn catalog. The AT&T catalog entry uses the provider's documented `home_language_toggle?lang=en|es` contract with no referrer. These actions do not claim to start a verified individual Spanish lesson or synchronize provider progress.

Provider source inspection supports the language-entry contract, but **live language/session redirects and browser playback remain unverified** because direct provider requests were blocked in this environment. Before release, verify both catalog actions in a fresh browser and an existing provider session, confirm language, and open a relevant course. See the [provider evidence and language-routing guide](../knowledge-base/digital-literacy-language-links.md).

## J5/J6 counselor-phone display

New billing edits, editor previews and newly built document content normalize recognizable US phone numbers to `(512) 555-0123` style. The formatter accepts a ten-digit number or an eleven-digit number with US country code `1`; it preserves extensions, explicitly international numbers and incomplete input rather than truncating them. Blank input remains blank and still triggers the existing required-field gate.

Saved draft and frozen snapshot displays retain their recorded phone values; stored PDF bytes and historical signed/sent documents are not rewritten. Opening an editor or rendering a preview does not replace an archived PDF. Billing contacts remain staff-entered case data; this change does not enable billing mail or change funding, signing or archive gates.

## Completed production counselor cleanup

Operation **`2026-10-15-retire-portal-qa-counselor-2803`** completed the scoped cleanup of the exact **Portal QA Counselor** fixture:

- One fixture account was deactivated, its Auth identity banned, and its counselor privilege removed.
- Twenty real members and their counselor routes were transferred to Michael.
- Two fixture/staff assignments were retired.
- All 23 old assignment rows and their history were retained. No messages or notes were deleted.

This is an aggregate operational receipt. It contains no member identifiers, account addresses, credentials or casework content.

An independent read at 21:36 UTC confirmed no active fixture assignments or routed
threads, no counselor role or live Auth sessions, and a banned Auth identity.
The retained user has no deletion timestamp, preventing the retention purge from
removing case history. Michael remains active with 29 active assignments.

## Validation status

Coordinated focused results: **78 retake tests**, **21 Digital Literacy Vitest tests plus 14 Node tests**, and **60 billing-phone Node tests** passed. The pre-rebase local Node lane passed **2,906 tests**. These are preparation receipts, not proof of deployed UI or external playback. Final integrated checks, the reviewed immutable release revision and applicable live acceptance are recorded on the release pull request.
