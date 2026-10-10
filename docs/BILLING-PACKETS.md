# J5 Training Invoice + J6 Cover Letter packets

**Retired for new work (2026-09-28).** The combined packet does not match the
current WorkforceAP process. Authorized POST requests to create or send one now
return `410 LEGACY_BILLING_FLOW_RETIRED`; the admin page shows existing records
only. GET history and protected PDF downloads remain available. The separate
J5 Quote/Voucher Request and later J6 Invoice/Voucher Cover Letter with the
received signed board voucher are under development; neither action is live
through this legacy route.

> **Legacy.** Everything above "Two-stage J5/J6" describes the original
> combined packet (`training_billing_packets`, one signed row with a J5
> invoice and a J6 letter). Its rows stay unchanged and readable. New billing
> will use the two-stage flow described below, which is not live yet.

Ops request (9/3/26): "Need a J5 invoice and J6 cover letter system that creates a
signed [document] with the classes and breakdown of prices. Then have a button
that automatically emails to counselor and the student."

## Read-only Admin mock preview

Open **Admin → Students → J5 / J6 preview** (`/admin/billing/preview`) to review
fictional, unsigned samples without opening a member's billing case. The page
switches between J5 and J6 PDFs, offers a new-tab fallback for browsers without
an inline PDF viewer, and includes the existing workbench as a read-only disclosure.
All creation actions are disabled; no signer, send, upload, or archive action is wired.

The page and `GET /api/admin/billing/preview/[stage]` each require authenticated
Admin access. Only `j5` and `j6` are accepted. Document facts come solely from
`lib/billing/twoStage/mockPreview.ts`, not a request or member record. The PDFs
use the existing draft renderer, a conspicuous MOCK title, fictional contacts,
and the draft/signature-required marker. They cannot serve as issued documents.
Responses are private/no-store. This does not open signing or delivery gates,
verify any real student's readiness, or create a billing record.

## Retired workflow (historical reference)

- **Admin signing desk**: `/admin/members/[id]/billing` (button "J5 / J6 billing"
  on the member page). Prefilled from the member's enrolled program:
  - one J5 line per class in the member's assigned curriculum, contact hours from
    the program catalog, tuition spread across the classes by hours (whole cents,
    always sums to the total);
  - tuition source, in order: the organization's program catalog cost
    (`/admin/programs`), the approved TWC syllabus `tuitionAndFees`, then the
    price-list default of $7,500;
  - catalog exam/book/misc fees become their own rows;
  - a J6 cover letter draft (editable; "- " starts a bullet);
  - "Bill to" and signer defaults from `BILLING_*` env vars (see ENV-VARIABLES.md).
- **Signature**: draw on a canvas (PNG embedded in both PDFs) or type the name
  with an explicit acknowledgement (rendered in italics, marked "typed signature").
- **Create** stores one `TrainingBillingPacket` row (status `signed`) with an
  invoice number `WAP-YYYY-NNNN` unique per organization. PDFs are rendered on
  demand from the row (`lib/billing/packetPdf.ts`), so the two documents can
  never disagree with each other or with what was signed.
- **Email to counselor and student** (`POST /api/billing-packets/[id]/send`):
  two branded emails with both PDFs attached. The student copy is plain and says
  "no cost to you"; the counselor copy has the amounts and a link to the student
  record. The admin who pressed the button is cc'd on the counselor copy. If no
  counselor is assigned, only the student receives it and the UI says so.
  Status moves to `sent`; re-sending is allowed and counted.
- **Downloads**: every surface offers "Download both (PDF)" — the J6 cover
  letter and J5 invoice merged into one file, in that order, so the whole packet
  prints or saves as a set — plus separate "Download J5" / "Download J6" buttons
  and inline "View" links.
- **Where people see it**:
  - member: `/dashboard/documents` ("My documents" in the nav);
  - counselor: student page section "Training invoice & cover letter (J5 / J6)";
  - admin: the billing page list.
- **PDF access** (`GET /api/billing-packets/[id]/pdf?doc=j5|j6|both`): org
  admin, the member's active assigned counselor, or the member. Anyone else gets
  404. Single documents render inline unless `download=1`; `doc=both` downloads
  by default (`download=0` to preview it inline).

## Page layout

Each document is laid out so the closing never orphans: the J5 remit terms +
certification + signature are reserved as one unit, and the J6 closing +
signature + enclosure/cc likewise. A 10-class program (the largest in the
current catalog bar one) fits on a single page per document — guarded by a
regression test in `lib/billing/packetPdf.test.ts`. A 13-class program
legitimately runs to two pages, with real content on the second.

## Files

- `prisma/schema.prisma` `TrainingBillingPacket` + migration
  `20260904020000_training_billing_packets`; registered in
  `lib/tenant/scopeProxy.ts` as tenant-scoped.
- `lib/billing/`: `providerIdentity.ts` (letterhead + env overrides),
  `packetSchema.ts` (zod), `packetText.ts` (client-safe helpers, default letter),
  `packetDefaults.ts` (pricing + default rows), `packetNumber.ts`,
  `packetPdf.ts` (J5/J6 renderers), `packetAccess.ts` (authorization +
  serializer), `sendPacket.ts` (emails).
- `emails/billing-packet.ts`, `components/admin/SignaturePad.tsx`,
  `components/billing/BillingPacketList.tsx`.
- Routes: `app/api/admin/members/[id]/billing-packets` (GET/POST),
  `app/api/billing-packets/[packetId]/pdf`, `app/api/billing-packets/[packetId]/send`.

## Not in scope (yet)

- Board-specific J5/J6 templates. The layout follows the official price list
  letterhead; if a workforce board publishes its own required form, map the
  fields in `packetPdf.ts`.
- Payment tracking (paid / partially paid). Status is `signed` or `sent`.

## Two-stage J5/J6 (in progress, draft PR)

Requested by Mike Brown on 2026-09-27. Two separate stages, each with its own
primary action, signature and send:

1. **J5 Quote / Voucher Request**, before any voucher exists. It goes to the
   counselor and the student (exactly 2 recipients) and is archived in the
   student's file.
2. **J6 Invoice / Voucher Cover Letter**, only after the board-signed voucher
   has been received and the class has begun. It goes to board finance, the
   counselor and the student (exactly 3), with the voucher attached exactly as
   uploaded, plus the board invoice if one was uploaded.

### Fixed terms (`lib/billing/twoStage/constants.ts`)

- One line only: `Tuition & Fees $7,500.00`, stored as `750000` cents. There is
  no class/syllabus itemization. This supersedes the legacy "$7,500 is a cap"
  and empty-row behavior, for two-stage documents only.
- Hours: `canonicalizeProgramSlug(programSlug)`, then the approved syllabus
  `totalHours` (`shared/programSyllabi.ts`). The only 200-hour program is
  `software-developer-professional-certificate-ibm` (legacy alias
  `ai-and-software-development-professional-certificate-ibm`); every other
  approved program is 160. The `ai-software` catalog category is not used,
  because the AWS AI Practitioner shares it and is 160. An unknown program, a
  program without an approved syllabus, or a syllabus that disagrees with
  160/200 fails closed (`hours.ts`).
- End date: class start plus 6 calendar months, clamped to the month's end
  (Sep 30 → Mar 30, Oct 31 → Apr 30, Jan 31 → Jul 31, Aug 31 → Feb 28/29). See `dates.ts`.
  "Today" is the calendar date in America/Chicago.
  New content version 2 documents use this fixed six-month rule. Readiness and
  actual-start forms show the calculated end as read-only, and the server rejects
  a different end date on new class-start attestations. Existing version 1 drafts
  still preview with their original five-month dates; explicitly save a draft again
  to review the new six-month terms before signing. For a J6, record corrected
  class-start evidence first. Signed, sent and superseded snapshots and their
  archived PDFs are never rewritten; use the existing correction workflow if an
  issued document needs different terms. The database migration must land before
  the app writes version 2 documents.

- Payment: once the J6 is sent it is `pending`, with an *expected follow-up*
  window of send + 10 to + 14 days. That is a follow-up expectation, not a due
  date or a Net term, and there is no overdue state. It becomes `received`
  only when staff record the date and evidence.
- Printed wording frozen in content matches the approved reference layouts:
  titles `Quote / Voucher Request` and `Invoice / Voucher Cover Letter`; the J6
  payment sentences `Please arrange payment by check or wire to Workforce
  Advancement Project and confirm the expected remittance date.` and `We will
  follow up in 10 to 14 days if payment has not been recorded.`; the
  voucher/PO reference is at most 80 characters (attestation, DB CHECK and
  renderer).
- Letterhead (`letterhead.ts`): `public/images/wap_logo.png` (its sha256 is
  frozen; the tagline "Empowering People. Advancing Futures" is part of that
  image, so it is not a separate frozen field), the printed text lines
  `Workforce Advancement Project` and `www.WorkforceAP.org`, and the confirmed footer facts from the blank WAP letterhead
  (`www.WorkforceAP.org`, `(512) 825-2896`,
  `207 Settlers Valley Suite C, Pflugerville, TX 78660`), all in one reviewed
  constant that the database checks at signing. The old renderer's magenta
  band is not used.
- J6 issue/sign date: the server date (America/Chicago) at signing, printed as
  `content.issueDate`, on or after both the actual class start and the current
  voucher's receipt (attested `received_on` and DB-stamped upload date). No
  caller backdating (`J6_ISSUE_DATE_NOT_SERVER_DATE`,
  `J6_SIGNED_BEFORE_CLASS_START`, `J6_SIGNED_BEFORE_VOUCHER_RECEIPT`).

### Model (migration `20260927230000_billing_two_stage_j5_j6`)

The migration is not applied anywhere live yet, so it is edited in place on
this branch rather than followed by corrective migrations.

| Table | Purpose |
| --- | --- |
| `billing_cases` | One student + program seat. `subject_member_id` is the immutable original subject. `member_id` is the current live account. A new case must name a live member of the case organization as its own subject (`member_id` = `subject_member_id`, never NULL). It is set NULL only on erasure (`ON DELETE SET NULL` after the user row is gone; a direct NULLing of a live member is refused), or repointed to a merge survivor (audited in `member_merged_from_id` / `member_merged_at`). |
| `billing_attestations` | Append-only staff statements with evidence. `j5_readiness` records two separate facts (student approved/ready; counselor requested the quote: who, when, reference) plus the planned start. `class_started` holds the actual start and the confirmed end. `voucher_board_signed` holds the reference, the program/class, amount and period the voucher authorizes, the received date, and Michael's receiving signature present. `external_j5_reference` is a manual quote issued before this system (reference, date, program/class quoted). |
| `billing_artifacts` | Append-only record of each PDF in the private finance bucket, under a content-addressed key. A rendered signed PDF is bound by composite FK to its exact `(stage record, case, stage, version)` and to that version's `content_sha256`; uploads are case-level. |
| `billing_stage_records` | One J5 or J6 version: frozen `content` + `content_sha256`, `class_name`, `amount_cents` = 750000, `contact_hours` 160/200, dates, links, derived review reasons, signature fields, send receipt. |
| `billing_stage_recipients` | Frozen recipient snapshot per record: one normalized address per role (J5: counselor, student; J6: finance, counselor, student). Editable only while the record is a draft. |
| `billing_stage_sends` | One claim per recipient role per attempt, unique on `(stage_record_id, stage, attempt_no, recipient_role)`; attempt numbers are per role. The address is bound to the snapshot by composite FK. Each claim carries the record's `content_sha256`, the SHA-256 of every attachment and the canonical key `billing-two-stage:<stage>:<record>:v<version>:a<attempt>:<role>`. Status is one of `billing_send_statuses()` = `SEND_STATUSES` in `sendClaims.ts`: `pending`, `provider_accepted`, `ambiguous`, `needs_reconciliation`, `failed`, `reconciled_delivered`, `reconciled_failed`. |
| `billing_delivery_events` | Append-only delivery evidence for an accepted copy: `delivered`, `bounced` or `complained`, with time, source and a unique provider event id. Recordable after the stage is sent. |
| `billing_payment_events` | Append-only `pending` / `received` for a J6 proven sent. |
| `billing_signer_delegations` | Hook only, disabled. |
| `billing_signer_signature_assets` | The designated signer's approved handwritten-signature PNG (organization-level, not a case artifact): bucket, `signature/<org>/<signer>/<sha256>.png` key, `image/png`, SHA-256, byte size, pixel size, the 33-byte PNG header, approval statement, DB-stamped `uploaded_at` / `approved_at`, one-time `revoked_at`. See "Signature image" below. |

The database enforces these rules itself, not just the app:

- **Drafts and lineage.** Records start as drafts. A correction is exactly version + 1 of a superseded or voided record in the same case and stage, through a composite `(supersedes_record_id, case_id, stage)` FK. Each record has at most one successor, and each case and stage at most one open record.
- **J5.** It needs only the readiness attestation with both facts: no voucher and no funding input. It quotes the confirmed start and start + 6 calendar months, for the case program.
- **J6.** It needs, all from the same case:
  - the class-start attestation, whose dates it prints
  - the voucher and its attestation
  - a prior quote: our sent J5, or an attested external quote. No system J5 is ever fabricated.
- **Hours.** `contact_hours` must equal `billing_contract_hours(case program)`: 200 for `software-developer-professional-certificate-ibm` and 160 for every other program. The PG16 proof checks this matches `hours.ts` for every approved syllabus.
- **Derived holds.** `billing_stage_record_rules()` computes the J6 review reasons and refuses any other value. Every reason is a hard hold with no bypass: no review note clears it, and there is no amount-exception path. A reason clears only when corrected structured evidence makes it disappear:
  - `voucher_amount_differs`: the voucher amount is not 750000 cents.
  - `voucher_class_differs`: the voucher authorizes another program or class.
  - `voucher_period_conflict`: the class dates fall outside the voucher period.
  - `end_date_not_contract`: the actual end is not start + 6 calendar months, the same rule the PDF renderer enforces.
  - `class_differs_from_quote`: the program, class or hours differ from our J5 or the external quote.
- **Signing.** It needs:
  - no hold;
  - for a J6, a class start on or before today in America/Chicago;
  - the exact recipient snapshot, equal to the recipients printed in the signed content: the same `(role, name, email)` set after the shared normalization (trim ASCII whitespace, lowercase the email, collapse whitespace inside the name; `billing_normalize_*` in SQL, `normalizeEmail` / `normalizeRecipientName` in `recipients.ts`), with no extra, missing or duplicated role; and every printed contact block (`content.student`, `.counselor`, `.finance`: name, email and the counselor phone, stored in `billing_stage_recipients.phone`, which a CHECK requires to be nonblank for the counselor and NULL for other roles, and which the sign trigger also requires on the printed block) must equal its frozen row with the same normalizers (a J5 prints no finance block). `recipientRowsForContent()` in `content.ts` derives the rows from the content, and the M3 sign route writes both in one trusted transaction;
  - a PDF rendered from that exact record version and content.

  A recipient change locks the parent record, so it is serialized against a concurrent sign. A signed record and its recipients are frozen. The frozen content includes the SHA-256 of the exact logo PNG bytes, so a new logo changes the version hash and a sign request that carries the old hash is refused.
- **Sends.** Claims are per recipient role, only while the record is `signed` (never after it is sent or closed). A claim starts `pending` and must carry this version's content hash, its role's frozen address and the canonical key. `provider_accepted` requires `accepted_at` plus `provider_message_id`; a call that resolves without a message id, or throws without a preserved HTTP status, is `ambiguous`, never accepted or failed. A role gets attempt n + 1 (a fresh key) only after its latest claim is `failed` or `reconciled_failed`. An `ambiguous` claim is retried with the same key (back to `pending` with a new claim token) only while `billing_utc_now() - claimed_at < billing_idempotency_retry_window()` (23 h, equal to `IDEMPOTENCY_SAFE_RETRY_MS`); after that it can only be reconciled. `claimed_at` and `last_claimed_at` are the database clock. A claim's `recipient_name` and email must equal the frozen snapshot for its role. A `pending` claim is never retried directly: without a provider outcome it is marked `ambiguous` only after `billing_stale_claim_age()` (15 min since `last_claimed_at`, equal to `RECONCILE_CLAIMED_MIN_AGE_MS`; `decideClaim` returns `in_flight` until then and `mark_ambiguous` after), and then the ambiguous rules apply. `provider_message_id` is unique across claims (partial unique index), so webhook lookup is unambiguous. An accepted role is never re-sent (at most one accepted claim per role). `reconciled_delivered` / `reconciled_failed` is a separate audited path, only from `ambiguous` / `needs_reconciliation`: who, when, a note and an optional evidence file. Settled claims are final, and on any update every column is frozen except the ones that status move writes. Every copy attaches exactly the archived SHA-256s, in order: signed PDF, voucher, invoice. Delivery evidence goes to `billing_delivery_events`, never unsends the stage, and a bounce or complaint flags the case for follow-up.
- **Sent.** A record reaches `sent` only when every required role has exactly one accepted claim (`provider_accepted` or `reconciled_delivered`) matching this version's content hash, attachments and frozen address, and no claim of any role is still `pending`, `ambiguous` or `needs_reconciliation`. Attempt numbers may differ across roles. `sent_at` and `send_receipt` are written only by that validated `signed` -> `sent` transition, and `sent_at` is the database's own UTC clock (a caller-supplied value is refused); a signed record superseded or voided without being sent keeps them NULL.
- **Closure.** A `signed` record with any send claim (accepted or not) can be superseded or voided only after it completes `signed` -> `sent`, or through the audited partial-send cancellation: every claim resolved, at least one required role still without an accepted copy (otherwise it must be sent), and who (`send_cancelled_by_subject_id`) and why (`send_cancel_reason`) recorded; the database stamps `send_cancelled_at`. On every closure the database records `accepted_roles_at_close`, the roles that received that version, so the next version can show, for example, "finance already received v1" (`rolesThatReceivedEarlierVersions` in `sendClaims.ts`). A claim changes status only while its record is `signed`, so nothing is accepted after closure. Delivery evidence stays writable for accepted copies of sent (and later superseded) records.
- **Reconciliation evidence** must be a file of the same case and organization as the send's record.
- **Prior-J5 link.** Links are validated on insert and whenever that link column changes, never on other edits or status moves, so voiding or superseding a J6 is never blocked by an older link. A J5 that an open (draft or signed) J6 follows cannot be superseded or voided (`J5_LINKED_BY_OPEN_J6`): void or send that J6 first. A sent J6 keeps its historical link.
- **Payment.** It is accepted for a J6 proven sent: `sent_at` plus delivered finance, counselor and student copies. So a sent J6 later superseded by a corrected cover letter still reconciles its payment, and an unsent J6 never does. A `pending` event's window is anchored to that J6's send date: `billing_sent_on(sent_at)` (America/Chicago) + 10 to + 14 days, the same as `expectedFollowUpWindow()` in `payment.ts`. Transitions are case-level and monotonic: one `pending` per sent J6; `received` only after a `pending` on the case; `received` is terminal (no later `pending`, no second `received`; there is no correction kind in M1). The case summary (`summarizeCase` / `casePaymentView`) shows `received` once any event is received, otherwise the latest pending on an ever-sent J6, whatever the latest J6 version's status.
- **Clock.** `billing_utc_now()` and `billing_today()` read the wall clock (`clock_timestamp()`, VOLATILE), not the transaction-start `now()`, so a long or held transaction cannot make a stale decision: the 23 h retry bound, the 15-minute stale age, `signed_at` (stamped at `draft` -> `signed`; a caller value is refused), `sent_at`, `claimed_at` / `last_claimed_at`, merge and cancellation stamps, and every "today" check use them. They are called only from triggers; no CHECK depends on the clock. `billing_chicago_date()` and `billing_sent_on()` are pure date conversions and stay IMMUTABLE.
- **DB-stamped columns.** The database writes these from its wall clock and overwrites any caller value: `attested_at` on `billing_attestations` and on `billing_voucher_receipt_signatures`, the artifact upload `created_at`, `designated_at`, `claimed_at` / `last_claimed_at`, `accepted_at`, `reconciled_at`, delivery and payment `recorded_at`, `superseded_at` / `voided_at`, `send_cancelled_at`, `member_merged_at`, and the signature asset's `uploaded_at` / `approved_at` / `revoked_at`. `signed_at` and `sent_at` are also DB-stamped, and a caller-supplied value for them is refused. Every NOT NULL stamp has a SQL `DEFAULT` (Prisma `@default(now())`), and the nullable ones are optional, so a Prisma `create` never has to supply them (`dbStamps.test.ts`; PG16 proof).
- **No second send after a timeout.** An `ambiguous` claim never becomes a plain `failed` (that would unlock a fresh key for a copy that may have been delivered); it is retried with the same key or settled by audited `reconciled_*`. `pending -> failed` needs the provider rejection recorded by that update (`provider_result` or `last_error`, non-blank and new; `SEND_FAILED_WITHOUT_PROVIDER_REJECTION`). `pending -> needs_reconciliation` needs a recorded provider outcome or the 15-minute stale age.
- **Signer (both stages).** J5 and J6 signing both require the designated signer (`billing_designated_signers`, the single source of truth; `authorizeSigner` takes `designatedSignerUserId` read from it, and `BILLING_EXECUTIVE_SIGNER_USER_ID` is only an optional cross-check that fails closed on disagreement), `content.issueDate` = server date (`J5_ISSUE_DATE_NOT_SERVER_DATE` / `J6_ISSUE_DATE_NOT_SERVER_DATE`), and no `signed_via_delegation_id` (`SIGNER_DELEGATION_DISABLED`). Delegation rows must name the designated signer as principal and a user of the organization as delegate; they are append-only except a one-time DB-stamped `revoked_at`, and never deleted.
- **Signature image (both stages).** Every `draft -> signed` needs the designated signer's one active (non-revoked) row in `billing_signer_signature_assets` (`SIGNATURE_ASSET_MISSING`), `content.signature` = `{ assetId, assetSha256 }` of exactly that row and `signature_method = 'approved_image'` (`SIGNATURE_ASSET_MISMATCH`). The sign reads the asset `FOR SHARE`, so a concurrent revoke waits for it, and a sign after a revoke is refused. A revoke or replacement never alters a signed record: it keeps its frozen hash.
- **Closing a signed or sent record** needs a non-blank `closed_by_subject_id` and `close_reason` (`CLOSE_ACTOR_REASON_REQUIRED`); both are written only in the closing update and frozen afterwards.
- **J6 insert vs J5 close.** The J6's prior-J5 check locks the J5 row `FOR SHARE`, so a concurrent J5 supersede/void and J6 insert serialize: whichever commits second is refused.
- **Program slugs** are canonicalized on insert (`billing_canonical_program_slug`, whose alias map equals `PROGRAM_SLUG_ALIASES`) and stored canonical (CHECK); contract hours use the canonical slug.
- **Payment received** is recorded against the J6 that has the pending event and not before its America/Chicago send date (`PAYMENT_RECEIVED_BEFORE_SENT`; `recordPaymentReceived` applies the same bound).
- **J6 voucher-receipt date check** is kept as defence in depth: both receipt dates are already capped at today by the attestation-dates guard and the DB-stamped upload time, so it only fires if those guards were bypassed.
- **Business dates.** Every "today" guard (J6 class start at signing, attested class start / voucher received / counselor request / external quote dates, payment received) uses `billing_today()` = `(now() AT TIME ZONE 'America/Chicago')::date`, never `CURRENT_DATE` or the session time zone.
- **Integrity.** Artifacts, attestations, delivery events and payment events are append-only, and every CHECK treats NULL as a failure.
- **Privileges.** RLS is on and PUBLIC, `anon` and `authenticated` hold nothing. `service_role` gets SELECT, INSERT, UPDATE and DELETE (no TRUNCATE, which would bypass the row triggers), plus EXECUTE on `billing_contract_hours` and the helpers the CHECKs and triggers call, the same convention as the legacy packet grants.

### External-send gates

Real delivery stays closed until all of these hold:

- a signer principal is designated (`billing_designated_signers`, unset by
  default and never writable by the app) and signs as themselves;
- the signature representation and Michael's exact auth principal are
  approved (open decision);
- the J6 voucher carries the designated signer's receipt-signature
  attestation on its exact bytes (`billing_voucher_receipt_signatures`);
- the finance bucket preflight passes;
- the release/acceptance gates pass (isolated restore rehearsal, DEMO
  acceptance). In this PR no real email is sent at all.

The letterhead footer is confirmed and no longer gates sending. The footer
facts are exactly those on the blank WAP letterhead: `www.WorkforceAP.org`,
`(512) 825-2896` (the display string, with the space), `207 Settlers Valley Suite C, Pflugerville, TX 78660`.
Frozen content carries them, and the database refuses to sign any other
footer (`billing_letterhead_footer()`). `BILLING_LETTERHEAD_CONFIRMED` is no
longer read.

### Receipt signature and J6 principal binding

- **Original bytes.** The voucher artifact keeps the original uploaded bytes'
  SHA-256 and content-addressed key. The row is append-only and the bytes are
  never re-encoded.
- **Receipt-signature attestation.** A `billing_voucher_receipt_signatures`
  row is bound by composite FK to `(voucher artifact id, sha256)`. It records:
  - the attesting auth user;
  - the method: `present_on_original`, or `approved_signature_representation`
    with its own uploaded `voucher_receipt_signature` artifact and hash;
  - a DB-stamped `attested_at` (a caller value is refused).

  The row is append-only, so it is the audit record. Only the designated signer
  may insert one; unset means refused (`SIGNER_PRINCIPAL_UNSET`). A replacement
  voucher is a new artifact, so an older attestation never applies to it.
- **Generic flag.** `voucher_board_signed.receiving_signature_present` alone
  never satisfies the requirement.
- **J6 sign and send.** J6 sign, `signed -> sent`, and every J6 send claim
  require:
  - a designated signer;
  - `signed_by_subject_id` equal to that signer;
  - the `voucher_board_signed` attestation of the current voucher attested by
    that same principal;
  - a valid receipt-signature attestation on the current voucher hash.

  The failure codes are `SIGNER_PRINCIPAL_UNSET`, `SIGNER_NOT_DESIGNATED`,
  `VOUCHER_ATTESTER_NOT_SIGNER` and `VOUCHER_RECEIPT_SIGNATURE_UNATTESTED`.
- **Attesting the voucher.** Inserting a `voucher_board_signed` attestation by
  anyone but the designated signer is refused (`VOUCHER_ATTESTER_NOT_DESIGNATED`).
- **Pure code.** `voucherReceiptSignatureStatus()` in `voucherReceipt.ts` and
  `canSignJ6({ voucherReceiptSignature })` apply the same rule. The blocker code
  is `VOUCHER_RECEIPT_SIGNATURE_UNATTESTED`, and a missing input fails closed.

### Reviewing and downloading without sending

Open **Admin → Members → member → J5 / J6 billing**. The page starts with
**Preview J5 PDF** and **Preview J6 PDF**, available for every member the admin is
authorized to access. Neither button requires a billing case, enrollment, saved
draft, readiness, voucher, class-start evidence, or signature. Missing facts are
visibly labeled, and a J6 preview does not claim missing evidence has been supplied.
These unsigned previews never allocate an official number, persist billing data,
read a signature image, archive, sign, or send a document.

`GET /api/admin/members/:id/billing/two-stage/:stage/preview` uses available member
and billing details; `POST` also accepts the current editor fields. Both stages
use this path, with optional scoped case/program selection and `download=1` for an
attachment. Admin, member, tenant and provider access checks still apply. The
operational migration gate does not block the preview-only route; unavailable
optional billing data is represented as missing information.

Each current saved draft
has **View mock J5 PDF** / **View J6 PDF** and PDF download controls above
its prerequisites. Reviewing uses the read-only, version-bound preview endpoint;
it does not require signature approval or enabled email delivery. Save edits before
reviewing the new version. Downloads use the same authorization checks as preview.

J5 draft review defaults to `mode=mock`: the existing saved content is rendered
with **MOCK - REVIEW ONLY - NOT SIGNED** on the page and a blank signature area.
The response filename ends in `-MOCK.pdf`. The mock uses the exact saved version,
including its original date terms, and does not save a new record, read a signature
image, write an archive, or invoke signing or delivery. It works in the production
admin workflow even when real signing or email delivery is unavailable. The regular
draft preview remains available in the draft editor; J6 uses its existing preview.

Both editors offer a preview of the current fields before saving, including
incomplete inputs, through the member-level preview route above. Changing fields
invalidates the temporary preview. The older J5-only
`POST .../j5/draft/review?mode=mock` remains compatible with its stricter validation;
normal draft review still returns JSON. Saving a draft and all real signing and
delivery actions remain separate from these previews.

Current signed or sent versions expose **Download signed J5 PDF** /
**Download signed J6 PDF**, returning the exact archived bytes for manual delivery.
Voided or superseded versions remain historical records and are never presented
as ready to send. Preview and download never sign, email, or submit a document.
See the [member/admin review guide](MEMBER-ADMIN-REVIEW-GUIDE.md) for the short workflow.

### Signing

- Only the designated signer (`billing_designated_signers`, read by the route
  and passed to `authorizeSigner` as `designatedSignerUserId`) can sign, and
  only as his own authenticated session; he must also be an active admin of
  the provider org. `BILLING_EXECUTIVE_SIGNER_USER_ID`, when set, is only a
  cross-check that denies on disagreement. Nothing is ever matched by name,
  and no default id ships. Unset means signing is disabled (503).
- The printed signer is the constant
  `Michael A. Brown, PMP, ChE — Executive Director`. There is no drawn or
  free-text signature input in the sign flow.
- Review then sign: the sign request must echo the previewed record id,
  version and `content_sha256`, and confirm the exact intent statement. The
  rendered signed PDF is stored with its SHA-256.
- The signature block is name, title, signed-at, the attestation and
  Michael's approved signature image (`buildSignatureBlock({ image })`,
  `signature_method = 'approved_image'`). The image is the one frozen in
  `content.signature`; the renderer must place bytes whose SHA-256 equals
  `assetSha256`. A typed-only block is never accepted by the sign trigger.
- The voucher's receiving signature is Michael's own signature, made by hand
  on the board document before upload. The app never stamps or alters the
  voucher, and this is separate from the J6 cover-letter signature.

### Signature image (Michael A. Brown)

Mike Brown supplied Michael A. Brown's handwritten signature (2026-09-28) as
the image for signed J5/J6 documents. The image itself is never committed to
the repository, fixtures or docs; tests use generated synthetic PNGs.

- **Where.** One organization-level row in `billing_signer_signature_assets`;
  the bytes in the private `billing-finance` bucket under
  `signature/<org>/<signer>/<sha256>.png`. It is not a `billing_artifacts`
  row, so case artifacts stay PDF-only.
- **Why a PNG here.** The PDF-only rule covers case evidence that is archived
  and attached as-is (vouchers, invoices, signed documents). The signature is
  an image component that the renderer embeds inside the signed PDF, which
  needs a raster image; the only archived and sent file is still the PDF. So
  PNG is allowed for this one kind only: `mime_type = 'image/png'`, the PNG
  magic bytes and IHDR (first 33 bytes, stored and checked by the database,
  with the pixel dimensions), at most 5 MB and 6000 x 6000 px, hashed on the
  server and stored unchanged (`inspectSignaturePng` in `signatureAsset.ts`).
- **Who.** Only the designated signer, logged in as himself, uploads it:
  `signer_user_id` and `uploaded_by_user_id` must both equal the current
  designation (`SIGNATURE_ASSET_WRONG_PRINCIPAL`, `SIGNER_PRINCIPAL_UNSET`).
  His upload is his approval, so `uploaded_at` and `approved_at` are both the
  database clock. At most one active asset per organization (partial unique
  index); rows are append-only apart from one DB-stamped revoke that records
  who and why, and are never deleted.
- **Where it appears.** Only on J5/J6 documents that Michael signs while logged
  in as himself: every sign freezes the active asset's id and SHA-256 in
  `content.signature` and the database refuses a sign without it. The image
  never authorizes anything by itself; who may sign is decided only by the
  signer checks above. A re-designated principal can never use the previous
  signer's image.
- **Revoke or replace.** Revoke the active row, then upload the new one. Already
  signed or sent records keep the hash they froze; a draft frozen with the
  revoked asset must be rebuilt and reviewed again.
- **Upload, in the app (§5.20).** On the member's billing page the designated
  signer sees "Your signature": he picks the PNG and confirms the exact
  approval statement (`signatureApprovalStatement()`, stored as
  `approval_statement`). The route validates the PNG, proves pdf-lib can embed
  it (`canEmbedSignaturePng`), stores the exact bytes, then inserts the row.
  Replacing an approved image needs an explicit replacement and a reason: the
  old row is revoked (who, why; the database stamps when) in the same
  transaction as the new insert.
- **Bucket MIME.** The bucket DDL of #2700 (`20260927232204`) allows only
  `application/pdf`. Migration `20260928140000_billing_finance_bucket_signature_png`
  adds `image/png` and nothing else (still private, 10 MiB, no policy or
  grant). It **must apply after** `20260927232204`: it fails the migration if
  the bucket is missing or is not in exactly the state that migration leaves it
  in, so a wrong order stops the deploy instead of leaving every sign to fail.
  The database still limits PNG to the `signature/` key. Proof:
  `tests/migrations/billing-finance-bucket-signature-png.mjs`.

### Storage

Files live in the private Supabase Storage bucket `billing-finance`. The
database CHECK pins that name, matching #2704. `BILLING_FINANCE_BUCKET` may be
set, but any other value fails closed. Mike owns its provisioning as a separate
slice.

- `lib/billing/twoStage/financeStorage.ts` refuses `member-resumes`,
  `member-files` and `employer-logos`.
- Keys are generated on the server.
- Uploads are PDF-only (checked by magic bytes), at most 10 MB, and hashed on
  the server. The bytes are stored unchanged.
- Before any upload, sign or send, a preflight checks that the bucket exists
  and is private, and fails closed if not.
- `deleteUserStorage` only traverses member buckets, and a test proves it
  never touches the finance bucket.

### Retention, erasure and merge

These rows mirror draft #2687's retained-finance model:

- Purging a member (`cleanupDeletedAccounts` → `users.deleteMany`) sets
  `billing_cases.member_id` to NULL and keeps `subject_member_id` and every
  stage record, artifact, send and payment row.
- Actor columns hold historical subject ids with no foreign key.
- **Visibility (Mike Brown, 2026-09-28).** J5, J6 and voucher evidence live in
  a staff-restricted billing archive linked to the student (`billing_cases`).
  The student's required copy is delivered by email. The member portal never
  exposes archive rows or files. No RLS policy and no grant gives `anon`,
  `authenticated` or a member any read path to `billing_artifacts`,
  `billing_attestations`, `billing_voucher_receipt_signatures` or any other
  billing table (asserted by the PG16 proof), and the finance bucket is
  private. The archive survives member erasure as described above.
- **PDF-only for this release.** Every archived file, including the voucher
  and an approved signature representation, must be `application/pdf` stored
  under a `.pdf` content-addressed key (`billing_artifacts_kind_check`,
  `billing_artifacts_storage_check`). No JPEG/PNG uploads. The one exception
  is the signer's signature image, which is not a case artifact (see
  "Signature image").
- A member merge (`lib/admin/memberMerge.ts`) repoints `billing_cases.member_id`
  to the survivor (`memberMergeRepointPlan.ts`). The executor declares the
  pair for its transaction (`app.billing_member_merge`); the database refuses
  any other repoint and records the audit columns itself.
  `subject_member_id` never changes.

Two things are not ported yet: #2687's deletion barrier (blocking erasure
while a send is unresolved) and a retention/disposal policy.

### Tests

- Unit (Node lane, `npm run test:unit`): `lib/billing/twoStage/*.test.ts`.
- Database contract (`node scripts/run-db-contract-tests.mjs`, CI job
  "Database contract (PostgreSQL 16)"):
  `tests/migrations/billing-two-stage-j5-j6.mjs`. It covers:
  - Supabase-like default ALL grants (including TRUNCATE and PUBLIC) that end
    with no browser rights, with the owner keeping access
  - ordering and additivity
  - legacy insert and row preservation
  - the contract CHECKs
  - uniqueness
  - immutability
  - reconciliation
  - review hold
  - external prior quote
  - exact attachments
  - payment
  - the signature image: non-signer upload, non-PNG, a second active asset,
    sign without an asset, hash mismatch, and revoke races that never alter a
    signed record
  - erasure retention
  - idempotent re-run

## Two-stage API contract (M3)

Status: reviewed by Mike Brown on 2026-09-28 and being implemented in the M3
draft PR (stacked on #2699). Mike's review decided the engineering questions
the first draft left open; they are recorded, one line each, in
[Decisions](#decisions-m3). Sign and send are implemented but hard-disabled:
every gate defaults off.

**Sources**

| Source | Ref |
| --- | --- |
| M1 model (#2699, draft) | `55a0562c` (on `877466fe` → `260ad599` → `b76cedee`, master `fde0066`; designated signer for both stages, send-failure and close rules, payment lower bound) (schema incl. `BillingDesignatedSigner` and `BillingVoucherReceiptSignature`, migration `20260927230000_billing_two_stage_j5_j6`, `lib/billing/twoStage/*` incl. `voucherReceipt.ts`, `lib/billing/providerOrg.ts`) |
| M2 draft renderer (#2702, merged) | master `d9e5d1e` `lib/billing/twoStage/documentPdf.ts` (DRAFT only) |
| Finance archive adapter (#2704, merged) | master `fde0066` `lib/billing/twoStage/storageArchive.ts` (`archiveFinancePdf`, `readFinanceArchivePdf`) |
| Resend status-preserving error (#2705, merged) | master `5864328` `ResendResolvedSendError` in `lib/email/send.ts` |
| M4 admin UI (#2706, draft) | `2717102c` `app/admin/members/[id]/billing/TwoStageBillingWorkbench.tsx` (readiness keys, `onPrepareJ5` / `onPrepareJ6`) |
| Tenant/admin pattern | `app/api/admin/members/[id]/billing-packets/route.ts` (master) |

Labels: **[M1]** the M1 model enforces or provides it; **[M3]** the route
does it; **[M1 pending]** M1 is adding it on #2699 and M3 consumes it.

### 1. Renderer binding (M1 frozen content → #2702 renderer)

Every string the draft PDF prints comes from the frozen content that the
version hash binds; nothing is computed at render time except formatting a
bound value (a `YYYY-MM-DD` date as "September 30, 2026", cents as
"$7,500.00"). `lib/billing/twoStage/rendererAdapter.ts`
`toRendererFacts(content, { logoPng, frozenAt })` is the only bridge; #2702's
renderer was changed narrowly to take the text it used to hard-code from its
input (it stays DRAFT-only: a `signature`/`signed` input still throws and the
page still says `DRAFT - SIGNATURE REQUIRED`).

The approved layout is Mike Brown's synthetic, unsigned J5 and J6 DRAFT
references (2026-09-28). Their printed text, with fictional contacts, is the
committed fixture `tests/fixtures/billing/two-stage-layout-reference.json`;
the reference PDFs themselves are not committed.

| Printed on the PDF | Frozen content field |
| --- | --- |
| `DRAFT - SIGNATURE REQUIRED` badge, stage label `J5` / `J6` | fixed label; stage from `kind` |
| Title (`Quote / Voucher Request`, `Invoice / Voucher Cover Letter`) | `title` |
| Issue date | `issueDate` (the server's date at save; never caller-supplied) |
| J5: TO counselor name \| email, PHONE, BOARD, RE student | `counselor.name`, `counselor.email`, `counselor.phone`, `boardName`, `student.name` |
| J6: TO finance name \| email, BOARD, COPY counselor; student (names only), RE "Payment for {student} training" | `finance.*`, `boardName`, `counselor.name`, `student.name` |
| Intro sentence (J6 cites the voucher number and the class start) | fixed template with `headerLines[0]`, `student.name`; J6 `voucher.reference`, `classStarted.classStartDate` |
| TRAINING DETAILS: Student, Class, Training hours, Class start, Class end (J6: Voucher / PO) | `student.name`, `training.className`, `training.contactHours`, `training.classStartDate`, `training.classEndDate`; J6 `voucher.reference` (the current voucher version) |
| CLASS DESCRIPTION (J5 only; ops 10/8/26) | `training.classDescription`: the approved syllabus Program Description (`shared/programSyllabi`), **frozen into the J5 content and its version hash when the J5 is built**, so a later syllabus edit never changes a signed J5. Content frozen before this field existed has none and renders as before. Sized so the longest description (6 lines) keeps the J5 on one page with the signature clear of the footer. |
| The single `Tuition & Fees $7,500.00` row | `lineItems[0].label`, `totalCents` |
| J5 voucher-return and file-retention sentence; `Copy: {student} \| {email}` | fixed template with `headerLines[0]`; `student.name`, `student.email` |
| J6 payment sentences | `paymentFollowUp.instruction`, then `paymentFollowUp.wording` (both frozen by M1) |
| J6 `Enclosure for issued packet: received, signed training voucher {PO}` | fixed template with `voucher.reference` |
| Signature block: `Respectfully,`, `Executive signature required before issue` (while unsigned), signer name, `{title}, {organization}` | `signer.name`, `signer.title`, `headerLines[0]` |
| Footer: organization; website \| phone; address | `headerLines[0]`; `letterhead.footer.website`, `letterhead.footer.phone`; `footer.addressLines` joined with ` \| ` |

Not printed but bound: the document number (PDF metadata only; the release prints no
quote reference), J6 counselor/student emails and the counselor phone, and
every evidence id. The phone prints exactly as frozen: the approved display
string is `(512) 825-2896` (Mike, 2026-09-28), and the renderer never
reformats it. Dashes and curly quotes print unchanged (WinAnsi covers them).

Everything else on the page is reviewed fixed wording, enumerated in
`FIXED_PRINTED_TEXT` (labels such as `TRAINING DETAILS`, `Respectfully,`, and
the template sentences with `{org}`, `{student}`, `{voucher}` placeholders).
`rendererAdapter.test.ts` renders a synthetic J5 and J6 from real M1
`buildJ5Content` / `buildJ6Content` output, extracts the text with pdf.js and
checks both directions: every printed content field appears verbatim, and
after removing content values and the fixed list nothing is left but
separators. Changing a bound value changes the page; adding hard-coded text
fails the test. A third test renders real M1 content and compares the whole
page, in reading order, with the reference fixture, including the Sep 30 →
Mar 30 end date (start + 6 calendar months, clamped); a fourth pins M1's
frozen strings (titles `Quote / Voucher Request` / `Invoice / Voucher Cover
Letter`, organization, website, phone `(512) 825-2896`, address, signer,
payment instruction and follow-up wording) to the fixture.

**Open gates never block a DRAFT.** Staff review the layout before every
fact is in place:

- A held J6 renders with the badge `DRAFT - ON HOLD - NOT SIGNABLE` instead
  of `DRAFT - SIGNATURE REQUIRED` (renderer input `openHolds`; the renderer
  then does not re-throw the end-date and voucher-amount contract checks the
  hold already reports).
- Without the designated signer's receipt attestation on the voucher's exact
  bytes, the enclosure line reads `Enclosure for issued packet: received,
  signed training voucher {PO} (receiving signature not yet attested)`
  (renderer input `receivingSignatureAttestationId: null`). The staff
  voucher attestation id is never used in its place. Parity tests cover both.
- Freeze, sign and send still enforce every gate and hold.

Adapter refusals (typed `RendererAdapterError`):

| Code | When |
| --- | --- |
| `409 LOGO_CHANGED` | sha256 of the bytes at `public/images/wap_logo.png` differs from `content.letterhead.logo.sha256`. Save the draft again (new hash). |
| `422 VOUCHER_REFERENCE_TOO_LONG` | `voucher.reference` over 80 characters (M1 `VOUCHER_REFERENCE_MAX_LENGTH`, also a DB CHECK; one limit for upload, draft save and renderer). |
| `422 TEXT_NOT_PRINTABLE` | a printed value is empty, not a single trimmed line, over its cap (`TWO_STAGE_TEXT_LIMITS`), outside WinAnsi, has spacing the page would not print as typed (two spaces in a row, a non-breaking space or any whitespace other than a plain space: the renderer wraps on single spaces, so `PO  44871` would print as `PO 44871`), or is too wide for the one-page layout (`field` names it). |

Draft save runs `printableIssues(content)` and a trial render
(`renderDraftFromContent`), so bad input fails at save with a clear code, not
later at preview or signing. `frozenAt` (PDF creation date) is the record's
`updatedAt` for a draft preview and, for a signed PDF, the instant the sign
route renders it (M1 now stamps `signed_at` with the database clock and
refuses a caller value, so the route rolls back unless the printed sign date,
`content.issueDate` and the Chicago date of `signed_at` agree). It is not in
the content hash and the archived bytes carry it.

### 2. Conventions

- Base path: `/api/admin/members/[id]/billing/two-stage/...`. `[id]` is the
  live member; case routes take `cases/[caseId]`; `[stage]` is `j5` or `j6`,
  anything else is `404 NOT_FOUND`. No M3 code goes into the legacy
  `billing-packets` route.
- Every response: `Cache-Control: private, no-store`,
  `X-Content-Type-Options: nosniff`. Errors are
  `{ code, error, blockers?, holds?, field?, fields? }` with a stable
  UPPER_SNAKE `code` and an admin-safe sentence.
- A PostgreSQL `23514` from an M1 trigger that the route's pre-checks missed is
  `409 BILLING_RULE_REFUSED`: the transaction rolled back. The trigger text is
  logged, not returned, except that the codes M1 puts at the start of its
  message map to their own error: `SIGNER_PRINCIPAL_UNSET` (503),
  `SIGNER_NOT_DESIGNATED`, `VOUCHER_ATTESTER_NOT_SIGNER`,
  `VOUCHER_ATTESTER_NOT_DESIGNATED`, `SIGNER_DELEGATION_DISABLED` (403),
  `VOUCHER_RECEIPT_SIGNATURE_UNATTESTED`, `LETTERHEAD_FOOTER_MISMATCH`,
  `J5_LINKED_BY_OPEN_J6`, `J5_ISSUE_DATE_NOT_SERVER_DATE`,
  `J6_ISSUE_DATE_NOT_SERVER_DATE`, `J6_SIGNED_BEFORE_CLASS_START`,
  `J6_SIGNED_BEFORE_VOUCHER_RECEIPT`, `SEND_FAILED_WITHOUT_PROVIDER_REJECTION`
  (409), `CLOSE_ACTOR_REASON_REQUIRED`, `PAYMENT_RECEIVED_BEFORE_SENT` (422).

**Unexpected-error copy.** A failure is described by what is provably true:

| Code | When | Message |
| --- | --- | --- |
| `500 INTERNAL_ERROR` | the route failed before any storage write, provider call or database write (tracked per request) | Something went wrong before anything was changed. Reload and try again. |
| `500 OUTCOME_UNCERTAIN` | the route failed after a provider call, a storage write or a database write whose outcome it cannot confirm | Something went wrong and the result is not known. Reload the case and check its status; a copy may already have been signed, stored or sent and must be reconciled before you try again. |

No route ever says "nothing was signed or sent" after a side effect may have
happened. Per-recipient send outcomes follow the same rule (§5.14).

**Refusal after a committed step.** An M1 refusal rolls back only its own
transaction. The request tracks, besides "a side effect may have started",
whether something outside that transaction was already kept: a storage write
returned, a provider call was made, or a statement or transaction committed
(every send-store write, the reconcile transaction before the stage
completes). A refusal after such a step keeps its code and status but adds
`outcomeUncertain: true` and the copy "Part of this request may already have
been stored or sent (for a send, copies may already have been sent). Reload
the case and reconcile any copy that may have gone out before retrying." A
refusal with nothing kept is a clean refusal, as before.

**Shared DTO module.** `lib/billing/twoStage/dto.ts` is client-safe (type-only
imports, pure constants) and is the single definition of every request and
response body; each route's response is typed from it and M4 imports it.
Exports: `CaseSummaryDto`, `ListCasesDto`, `OpenCaseDto`, `J5StageView`,
`J6StageView`, `StageVersionView`, `RoleDeliveryView`, `PaymentDto`,
`ArtifactView`, `VoucherReceiptAttestationView`, the draft types
(`J5DraftInput`, `J6DraftInput`, `DraftInput<S>`, `DraftPatch<S>`,
`DraftReviewRequest`, `DraftReviewDto`, `DraftSaveRequest`, `DraftSaveDto`,
`DraftField`, `DRAFT_FIELDS`), the readiness keys (`ReadinessKey`,
`TwoStageBillingReadiness`, `J5_READINESS_KEYS`, `J6_READINESS_KEYS`, equal
to #2706's `ReadinessKey`), the code unions (`BlockerCode` / `BLOCKER_CODES`,
`ErrorCode` / `ERROR_CODES`, `GateCode` / `GATE_CODES`, `GateName`,
`DraftFieldErrorCode`), `ApiErrorBody`, and the attestation, upload, freeze,
sign, send, reconcile, close and payment bodies. M1 types (`CaseProgress`,
`StageStatus`, `ReviewReason`, `SendStatus`, `RecipientRole`, `ArtifactKind`,
`PaymentView`) are re-exported, not redefined. `dto.test.ts` pins the
readiness keys to #2706 at compile time and proves the module has no runtime
imports.

### 3. Auth and checks

Operational routes use the order below. The member-level unsigned preview route
skips only the operational migration gate, retains all access checks, and requires
the same-origin check for POST. Its optional case selection is scoped to the
authorized member and organization; no case is required to render a preview.

| Step | Applies to | Check | Failure |
| --- | --- | --- | --- |
| 0 | all | `withApiGuc`, same as `billing-packets`. | — |
| 1 | operational routes | Migration gate: `BILLING_TWO_STAGE_MIGRATION_APPLIED === 'true'`. | `503 MIGRATION_NOT_APPLIED` |
| 2 | mutations | Origin/CSRF: `Origin` present and equal to `new URL(request.url).origin`, and `Sec-Fetch-Site` not `cross-site` (`requireSameOriginMutation`, same rule as `requireLabMutationOrigin`). | `403 ORIGIN_REJECTED` |
| 3 | mutations | Content type (`application/json`; `multipart/form-data` for uploads). Size, checked from `Content-Length` and a counting reader before anything is buffered: JSON ≤ 64 KiB; multipart ≤ 4 MiB in total. | `415 UNSUPPORTED_MEDIA_TYPE`, `413 PAYLOAD_TOO_LARGE`, `400 INVALID_JSON` |
| 4 | all | `getUser()`. | `401 UNAUTHENTICATED` |
| 5 | all | `isAdmin(user.id)`. | `403 ADMIN_REQUIRED` |
| 6 | all | `resolveAdminSubject(user.id, id)` exactly as in `billing-packets/route.ts`; a tenant mismatch reads as not found. | `404 MEMBER_NOT_FOUND` |
| 7 | all | Provider org: `checkBillingProviderOrg([member.organizationId, ...(superAdmin ? [] : [actorOrgId])])`. | `403 PROVIDER_ORG_ONLY`, `503 PROVIDER_ORG_MISCONFIGURED` |
| 8 | case routes | Case ownership: `billingCase.findFirst({ where: { id: caseId, organizationId: member.organizationId, memberId: member.id } })`. | `404 CASE_NOT_FOUND` |
| 9 | record/send/artifact routes | The row's case, organization and stage match. | `404 RECORD_NOT_FOUND`, `SEND_NOT_FOUND`, `FILE_NOT_FOUND` |
| 10 | sign; voucher receipt attestation | Signer: `authorizeSigner(...)` with the actor org looked up even for a super admin. | `503 SIGNER_NOT_CONFIGURED`, `403 SIGNER_NOT_PROVIDER_ORG`, `SIGNER_INACTIVE`, `SIGNER_NOT_ADMIN`, `NOT_SIGNER` |
| 11 | sign | Exact echo and intent: `validateSignRequest(target, request)`. | `409 VERSION_STALE`, `409 ALREADY_SIGNED`, `422 INTENT_NOT_CONFIRMED` |

Every Prisma call names `organizationId: member.organizationId`. Every
persisting mutation writes one `audit_logs` row with `auditLog(params, tx)` in the same
transaction as its billing rows (`billing.two_stage.<case_opened | attested |
uploaded | voucher_receipt_attested | draft_saved | signed | send_attempted |
sent | send_reconciled | send_cancelled | closed | payment_received>`);
metadata carries hashes, roles, versions and attempt numbers, never email
bodies or PDF bytes.

**Fresh MFA step-up (known limitation).** Admin API paths get MFA only from
`middleware.ts` (`isStaffMfaPath`), which accepts an `aal2` session or a
remembered-device trust cookie (`lib/auth/mfaTrust.ts`). The repository has no
step-up primitive ("MFA verified within N minutes"), so signing has no fresh
MFA check. Sign is disabled in this release; before it is enabled, a step-up
check on `POST …/sign` and `POST …/voucher/[artifactId]/receipt-attestation`
should be added (read `currentAuthenticationMethods` from
`getAuthenticatorAssuranceLevel()` and require a `totp` timestamp younger
than a reviewed window). Until then the sign route relies on the signer-id
binding, the provider-org check, the exact hash echo and the typed intent.

### 4. Release gates (all default off)

Each gate is evaluated on the server on every relevant route, before any
claim row, storage write or provider call, and reported in the case summary
(`gates`) so the UI can explain a disabled button.

| Gate | Enabled when | Blocks | Error |
| --- | --- | --- | --- |
| Migration applied | `BILLING_TWO_STAGE_MIGRATION_APPLIED === 'true'` (set per environment only after the M1 migration and #2700 bucket are applied there) | operational routes; not the member-level unsigned preview | `503 MIGRATION_NOT_APPLIED` |
| Provider org | `BILLING_PACKET_PROVIDER_ORG_ID` unset (default org) or a UUID | all | `503 PROVIDER_ORG_MISCONFIGURED` |
| Finance archive | the #2704 private-bucket preflight passes | uploads, file download, sign, send | `503 FINANCE_ARCHIVE_UNAVAILABLE`; the case summary never calls Storage and reports this gate as unknown (`enabled: null`, `code: null`), never as closed |
| Signer configured | `BILLING_EXECUTIVE_SIGNER_USER_ID` is a UUID equal to the designated-signer row (M1 55a0562 makes the row the identity and the env var an optional cross-check; M3 keeps it required as a second key) | sign, voucher receipt attestation | `503 SIGNER_NOT_CONFIGURED` |
| Signed renderer | the signed renderer exists (`SIGNED_RENDERER_AVAILABLE = true` in code; a code-level switch to withdraw it, never an authorization) | sign | `503 SIGNED_RENDERER_UNAVAILABLE` |
| Receipt-signature principal | the provider org has a `billing_designated_signers` row (M1; unset by default) | voucher receipt attestation, J5 and J6 sign, J6 send | `503 SIGNER_PRINCIPAL_UNSET` |
| Real email | `BILLING_TWO_STAGE_EMAIL_ENABLED === 'true'` (after real-email acceptance) | send | `503 EMAIL_NOT_ENABLED` |

The footer facts are confirmed (Mike, 2026-09-28: `www.WorkforceAP.org`,
`(512) 825-2896`, `207 Settlers Valley Suite C` / `Pflugerville, TX 78660`),
set in M1's letterhead constant and printed only from frozen content, so there is
no footer-confirmation gate. What keeps sign and send closed is the exact
signer Auth principal, the signer's own approved signature image (§5.20), the
principal voucher receipt attestation and the release/acceptance gates
(migration, real email).

Available once the migration gate is on: case open and summary,
attestations, uploads, draft review and save, draft preview, freeze, close,
payment read, the signature image upload (§5.20). Sign and send are wired and
return their gate error until their gates are opened.

### 5. Routes

#### 5.1 / 5.2 List and open cases

`GET /cases` returns the member's cases, newest first, each with
`summarizeCase()` progress. `POST /cases` `{ programSlug }` creates one case:
`canonicalizeProgramSlug`, `resolveProgramTerms` must be ok
(`422 PROGRAM_TERMS_UNAVAILABLE`), and the member may not already have a case
for that program (`409 CASE_EXISTS`); no enrollment row is required.

#### 5.3 Case summary (authoritative readiness)

`GET /cases/[caseId]` returns everything the M4 page shows, computed on the
server from M1 rows with the pure M1 functions. `canSign`, `canSend`,
`blockers` and `readiness` are advisory: every mutation re-runs every check.

```ts
type CaseSummaryResponse = {
  case: { id; programSlug; className: string | null; contactHours: 160 | 200 | null; createdAt; createdBy: Actor };
  progress: CaseProgress;                                   // summarizeCase()
  gates: Record<'migration' | 'providerOrg' | 'financeArchive' | 'signing' | 'signedRenderer'
    | 'receiptSignaturePrincipal' | 'realEmail', GateState>;
  viewer: { isExecutiveSigner: boolean; isDesignatedSigner: boolean };
  j5: J5StageView;                                          // current, history, blockers, contacts, readiness attestation
  j6: J6StageView;                                          // prior quote, class started, voucher, matches, holds
  payment: PaymentResponse;
  /** @deprecated Use readinessByStage. #2706 TwoStageBillingReadiness (2717102c), both stages merged. Absent key = not checked. */
  readiness: TwoStageBillingReadiness;
  /** The same facts per stage card, for when M4 splits the prop. */
  readinessByStage: { j5: Partial<Record<J5ReadinessKey, boolean>>; j6: Partial<Record<J6ReadinessKey, boolean>> };
  /** Readiness keys that are false only because the designated signer has not acted yet. */
  readinessWaitingOn: Partial<Record<DesignatedSignerReadinessKey, 'designated_signer'>>;
  /** Steps waiting on the designated signer, in order; empty when none are waiting. */
  waitingOnDesignatedSigner: DesignatedSignerTask[];
};
type DesignatedSignerTask = {
  step: 'voucher_data' | 'voucher_receipt_signature';
  artifactId: string; sha256: string;                      // the current voucher file the step must name
  readinessKeys: DesignatedSignerReadinessKey[];
  blockerCode: 'J6_VOUCHER_ATTESTATION_INCOMPLETE' | 'RECEIVING_SIGNATURE_NOT_ATTESTED';
  message: string;
  ready: boolean;                                          // false for the receipt until the data exists, and while no signer is designated
  viewerIsDesignatedSigner: boolean;
};
type GateState = { enabled: boolean | null; code: GateCode | null; message: string | null };  // null = not checked by this response
```

Readiness keys, aligned exactly with #2706 `2717102c` (`ReadinessKey`):

| #2706 key | Stage card | Server source (true only from recorded facts) |
| --- | --- | --- |
| `studentApprovedAndReady` | J5 | latest `j5_readiness` has `studentReadyConfirmed === true` |
| `counselorRequestedQuote` | J5 | latest `j5_readiness` has who, when and reference of the counselor request |
| `boardConfirmed` | J5, J6 | the stage's saved draft has a non-empty `boardName` |
| `counselorContactVerified` | J5, J6 | the stage's saved draft recipient snapshot has the counselor name, email and nonblank phone |
| `studentEmailVerified` | J5, J6 | the stage's saved draft recipient snapshot has the student email |
| `programAndClassDatesConfirmed` | J5, J6 | J5: readiness start date recorded and `resolveProgramTerms` ok. J6: class-started attestation present and no `end_date_not_contract` hold |
| `priorQuoteVerified` | J6 | a sent system J5, or a complete external quote attestation |
| `voucherReferenceAndReceivedDateVerified` | J6 | latest voucher attestation has a reference (≤ 80) and a received date |
| `originalVoucherHashVerified` | J6 | the voucher artifact exists with its server-computed sha256 and uploader (`createdBySubjectId`) |
| `michaelReceivingSignatureAttested` | J6 | the designated signer principal attested the receiving signature on the current voucher artifact's exact sha256 (§5.10a). A staff checkbox never sets it. |
| `voucherTermsVerified` | J6 | voucher attestation present and none of `voucher_amount_differs`, `voucher_class_differs`, `voucher_period_conflict` |
| `classStarted` | J6 | class-started attestation with start on or before today (America/Chicago) |
| `financeContactVerified` | J6 | the J6 saved draft recipient snapshot has the finance name and email |

A key is absent when there is nothing to check yet (for example the J6
contact keys before any J6 draft is saved), `false` when checked and not
satisfied. `readinessByStage` is the per-stage source of truth and the one
#2706 should read. The combined `readiness` is **deprecated**: it exists only
because #2706 `2717102c` passes one object to both cards, and it merges the
stages. For the four shared keys (board, counselor, student email, class
dates) it shows the J6 value when the J6 has one and the case has a prior
quote, otherwise the J5 value, so before a J6 draft is saved those keys show
the J5 draft's facts on the J6 card. It is removed once #2706 reads
`readinessByStage`.
The blockers list carries the same facts as stable codes (§6.2).

**Waiting on Michael.** Staff may upload the voucher file; only the
designated signer records its data (`voucher_data`) and attests his
receiving signature on its exact sha256 (`voucher_receipt_signature`). While
a voucher file exists and either is outstanding, the summary says so in three
places, all from `dto.ts`: `waitingOnDesignatedSigner` (the steps, in order,
naming the file and hash), `readinessWaitingOn` (the readiness keys those
steps hold back, from `DESIGNATED_SIGNER_READINESS`:
`voucherReferenceAndReceivedDateVerified` and `voucherTermsVerified` →
`voucher_data`; `michaelReceivingSignatureAttested` →
`voucher_receipt_signature`), and `waitingOn: 'designated_signer'` on the
matching blockers, whose message then names him (the M1 sentence "Confirm
the uploaded board-signed voucher…" is replaced by "Waiting on Michael A.
Brown to record the voucher details … A staff account cannot record them.").
`originalVoucherHashVerified` never waits on him (the
server hashes the upload). `viewer.isDesignatedSigner` tells the UI whether
to offer the steps to the viewer. Before any voucher file exists the upload
is a staff step and nothing is tagged.

#### 5.4 J5 readiness, 5.5 J6 class started

`POST /cases/[caseId]/attestations/j5-readiness` and
`POST /cases/[caseId]/attestations/class-started`
record the M1 attestations (`recordJ5Readiness`, `recordClassStarted`) with
the member name, the approved class name and `attestedBySubjectId = user.id`.
Append-only; a correction is a new attestation, and a draft that links the
older one becomes stale. Errors: `422 ATTESTATION_INVALID` (with `blockers`),
`422 PROGRAM_TERMS_UNAVAILABLE`. The class-started response adds
`endDateIsContract` (false = the J6 will be held on `end_date_not_contract`).

#### 5.6 External prior quote

`POST /cases/[caseId]/attestations/external-quote` (multipart: `attestation` JSON part
and an optional `file` PDF copy). The attestation is validated first
(`recordExternalJ5Reference`), so a bad form stores nothing; then the upload
pipeline of §5.10 with `kind: 'external_j5_copy'`. If a case has both a sent
system J5 and an external quote, the J6 follows the system J5.

#### 5.7 Draft workflow (review, then save)

#2706's "Create J5 …" / "Create J6 …" buttons call `onPrepareJ5` /
`onPrepareJ6`, which open the stage's draft editor. Opening never writes and
never authorizes anything, and it works even when case facts are missing, so
staff can see and fix them.

`POST /cases/[caseId]/[stage]/draft/review` (JSON, no write): the editor
sends whatever fields it has (any subset). The server merges them over the
current draft's saved inputs (or the prefill), validates each field and
answers:

```ts
type DraftReviewRequest = {
  boardName?: string;
  student?: { name?: string; email?: string };
  counselor?: { name?: string; email?: string; phone?: string };
  finance?: { name?: string; email?: string };            // J6
  boardInvoiceArtifactId?: string | null;                 // J6
};
type DraftReviewResponse = {
  stage: 'j5' | 'j6';
  current: StageVersionView | null;                       // the saved draft, if any
  fields: Record<DraftField, { value: string | null; source: ContactSource; error: { code: string; message: string } | null }>;
  blockers: Blocker[];                                    // case prerequisites for this stage (§6.2)
  complete: boolean;                                      // every field valid and no prerequisite blocker: PUT would succeed
  holds: HoldReason[];                                    // J6 holds the saved version would carry
  versionHashIfSaved: Sha256Hex | null;                   // when complete
};
```

Prefill: student from the member profile, counselor name and email from
`resolveAssignedCounselorContact()` (the WAP assigned counselor), counselor
phone staff-entered, finance staff-entered. Per-field codes:
`FIELD_REQUIRED`, `EMAIL_INVALID`, `EMAIL_DUPLICATE`, `TEXT_NOT_PRINTABLE`,
`VOUCHER_REFERENCE_TOO_LONG`, `BOARD_INVOICE_INVALID`.

`PUT /cases/[caseId]/[stage]/draft` persists a version and accepts only the
complete, validated set. The stage record holds frozen content, which M1
requires to be complete, so an incomplete draft is never written: missing or
invalid fields return `422 DRAFT_INCOMPLETE` with the same `fields` errors and
`blockers`, and nothing changes.

```ts
type DraftSaveRequest = DraftReviewRequest & {
  /** null to create; otherwise the versionHash the editor loaded (optimistic concurrency). */
  expectedVersionHash: Sha256Hex | null;
};
type DraftSaveResponse = { created: boolean; record: StageVersionView; versionHash: Sha256Hex; holds: HoldReason[] };   // 201 / 200
```

On an update the body may name only the fields that change; the server merges
them over the saved draft's inputs, and the merged set must be complete.
Server: latest record decides the action (none → v1; `draft` → update with
`expectedVersionHash` = its hash, else `409 DRAFT_CONFLICT`;
`superseded`/`voided` → v n+1; `signed`/`sent` → `409 STAGE_ALREADY_OPEN`);
document number allocated on create; `issueDate = billingToday(now)`;
`logoSha256` from the logo bytes; `buildJ5Content` / `buildJ6Content`;
`printableIssues` + trial render; one transaction writes the record, its
`billing_stage_recipients` rows from `recipientRowsForContent(content)` and
the audit row. A held J6 can be saved; it cannot be previewed or signed.

Becoming signable is a separate, server-checked step: freeze (§5.9) and sign
(§5.13) re-run every readiness gate on the saved version.

An open Admin draft editor rechecks its current inputs when a sibling readiness,
signature or evidence action refreshes the case summary. This preserves unsaved
contact fields; staff do not need to type again to clear an outdated readiness
message. Save stays disabled until a review of the current inputs and case
revision succeeds. Cancelled or older responses cannot restore obsolete blockers,
and a failed review offers a retry without discarding the inputs. This is UI
freshness only: saving, freezing, signing and sending still enforce their server
checks, including the saved version and latest attestation hashes.

#### 5.8 Draft preview

`GET /cases/[caseId]/[stage]/draft/preview?recordId=…&versionHash=…` returns
the DRAFT PDF through the adapter (`application/pdf`, `inline`,
`X-Billing-Version-Hash`, `X-Frame-Options: SAMEORIGIN`,
`Content-Security-Policy: frame-ancestors 'self'`). Not archived. Never
blocked by an open gate or hold (§1): the blockers that freeze/sign/send
would enforce travel with it as stable codes in `X-Billing-Blocker-Codes`
(for example `RECEIVING_SIGNATURE_NOT_ATTESTED`, `HOLD_VOUCHER_PERIOD_CONFLICT`)
and `X-Billing-Holds`; the full text is in the case summary. Errors:
`404 RECORD_NOT_FOUND`, `409 VERSION_STALE`, `409 NOT_A_DRAFT`,
`409 LOGO_CHANGED`, `422 TEXT_NOT_PRINTABLE`.

#### 5.9 Freeze (verified checkpoint, no write)

`POST /cases/[caseId]/[stage]/freeze` `{ recordId, versionHash }` returns the
exact hash, document title and number, the intent text to echo and the
preview path. It re-checks: the record is a draft with that hash
(`409 VERSION_STALE`); rebuilding the content from the latest evidence, the
stored contacts and the current logo gives the same hash (`409 DRAFT_STALE`);
the recipient rows equal `recipientRowsForContent` (`409
RECIPIENT_SNAPSHOT_MISMATCH`); every readiness blocker is clear
(`409 NOT_READY` with `blockers`); J6: `canSignJ6` (`409 J6_HELD` with
`holds`, `409 CLASS_NOT_STARTED`) and the principal receipt attestation on the
current voucher hash (`409 RECEIVING_SIGNATURE_NOT_ATTESTED`).

**J6 dates** (Mike, 2026-09-28): the J6 issue date and sign date are the
server's date in America/Chicago and must be on or after both the actual
class start and the voucher receipt date. The draft save sets
`issueDate = billingToday(now)`; sign requires `content.issueDate` to equal
the server date at sign time (otherwise `409 DRAFT_STALE`, blocker
`J6_ISSUE_DATE_NOT_TODAY`: save the draft again that day). A
future class start is the blocker `J6_CLASS_START_FUTURE`, a future receipt
date `J6_VOUCHER_RECEIPT_FUTURE`; both appear in the J6 readiness blockers. There is no
stored "ready for signature" status; any later save changes the hash.

#### 5.10 Voucher upload

`POST /cases/[caseId]/voucher` (multipart: `file`, optional `attestation`
JSON part). Any admin may upload the original file. M1 (`b76cedee`) lets
only the designated signer record a `voucher_board_signed` attestation (the
data entry: board, reference ≤ 80, received date, authorized amount,
program/class, period, evidence), so the `attestation` part is accepted only
from him (`503 SIGNER_PRINCIPAL_UNSET` / `403 VOUCHER_ATTESTER_NOT_DESIGNATED`,
checked before any storage write); staff upload the file alone. Its
`receivingSignaturePresent` field is required by M1's
`recordVoucherBoardSigned` but never satisfies
`michaelReceivingSignatureAttested` (§5.10a).

**Current voucher**: the file of the newest voucher event, an upload or a
data-entry attestation naming a file. A new upload replaces the previous
voucher at once, and every attestation of the older file (data entry and
receipt signature) stops applying: the response (`current: true`) and the
summary show `attestation: null`, `receiptAttestation: null` and the
blockers `J6_VOUCHER_ATTESTATION_INCOMPLETE` and
`RECEIVING_SIGNATURE_NOT_ATTESTED`. Re-uploading the bytes of an older file
reuses its row; attesting it makes it current again.

PDF only in this release (#2700 and `storageArchive` accept only
`application/pdf`): the file part must declare `application/pdf` and start
with `%PDF-`; the file name or extension is never trusted. A JPEG, PNG or
renamed non-PDF is refused before storage with `415 VOUCHER_PDF_ONLY`
("Upload the signed voucher as a PDF."). There is no image-to-PDF
conversion, and no image path in the DTO, the readiness keys or the email
attachments.

Pipeline: request-size gate (≤ 4 MiB total, before buffering) → attestation
validation → PDF-only check → `validateFinanceUpload` (the file itself
≤ 4 MiB − 64 KiB here) → #2704 private-bucket preflight → #2704
`archiveFinancePdf({ caseId, kind: 'board_signed_voucher', bytes })` with the
original bytes, never transcoded, stripped or stamped; sha256 computed on the
server → one transaction: artifact row (`source: 'uploaded'`,
`createdBySubjectId: user.id`, reusing the row for the same bucket/key) +
attestation + audit. If the transaction fails after the archive write, the
content-addressed object stays without a row and a retry reuses it
(`500 OUTCOME_UNCERTAIN` tells staff to reload first).

Errors: `422 UPLOAD_EMPTY`, `413 UPLOAD_TOO_LARGE`, `413 PAYLOAD_TOO_LARGE`,
`415 VOUCHER_PDF_ONLY` (board invoice and external copy: `415 UPLOAD_NOT_PDF`),
`422 ATTESTATION_INVALID`,
`422 VOUCHER_REFERENCE_TOO_LONG`, `503 FINANCE_ARCHIVE_UNAVAILABLE`,
`502 ARCHIVE_INTEGRITY_MISMATCH`.

Voucher data entry for an uploaded file (designated signer only):
`POST /cases/[caseId]/voucher/[artifactId]/attestation` (JSON) appends a new
attestation for that exact artifact.

Both responses carry `waitingOnDesignatedSigner` for the current voucher
(§5.3), so a staff upload immediately shows what now waits on Michael.

#### 5.10a Michael's receiving-signature attestation (signer principal only)

Mike, 2026-09-28: the received-and-signed board voucher cannot be satisfied
by a generic staff checkbox.

`POST /cases/[caseId]/voucher/[artifactId]/receipt-attestation`
`{ expectedSha256, method: 'present_on_original', statementConfirmed: true, statementText }`

- Callable only by the designated signer principal **[M1]**: the organization's
  `billing_designated_signers` row (unset by default) and the §3 signer check
  (`authorizeSigner` with `designatedSignerUserId` from that row;
  `BILLING_EXECUTIVE_SIGNER_USER_ID`, provider-org admin, active). No row →
  `503 SIGNER_PRINCIPAL_UNSET`; env signer unset or naming another account →
  `503 SIGNER_NOT_CONFIGURED`; anyone else →
  `403 VOUCHER_ATTESTER_NOT_DESIGNATED` / `403 NOT_SIGNER`.
- The designated-signer row is the authority: M1's trigger refuses any other
  attester, and the route checks the row first. The env signer check is
  redundant for identity once the row exists; it is kept deliberately as
  fail-closed defense in depth, so the attestation needs the row **and** the
  env signer to name the same account. A row that names someone other than
  the env signer, or an env signer that was unset, refuses the attestation
  rather than trusting one side. Since M1 `55a0562`, `authorizeSigner` itself
  takes the row's user id and denies an env value that disagrees; it treats an
  unset env as fine, so M3 refuses the unset case explicitly.
- `expectedSha256` must equal the artifact's stored sha256
  (`409 VOUCHER_HASH_MISMATCH`), and the artifact must be the case's current
  voucher (`409 VOUCHER_NOT_CURRENT`).
- `statementText` must equal, character for character, the server statement
  "I, {signer name}, confirm that my receiving signature is on board voucher
  {reference} exactly as uploaded (sha256 {first 12 hex})."
  (`422 INTENT_NOT_CONFIRMED`).
- Writes one `billing_voucher_receipt_signatures` row **[M1]** bound to
  `(voucher_artifact_id, voucher_sha256)` (composite FK to the artifact's
  `(id, sha256)`), `attested_at` stamped by the database, plus the audit row
  `billing.two_stage.voucher_receipt_attested`, in one transaction. The
  database refuses an attester who is not the designated signer
  (`VOUCHER_ATTESTER_NOT_DESIGNATED` / `VOUCHER_ATTESTER_NOT_SIGNER`, mapped
  to `403`).
- `approved_signature_representation` (the alternative Mike allowed) is
  refused with `503 RECEIPT_SIGNATURE_METHOD_UNAVAILABLE`: no representation
  asset is approved, and #2704's `storageArchive.ts` has no key segment for
  the M1 artifact kind `voucher_receipt_signature` (gap noted for Mike; M3
  never archives that kind).
- J6 readiness uses M1 `voucherReceiptSignatureStatus()` over these rows for
  the current voucher; `canSignJ6` requires it. Until the principal is
  designated, J6 sign and send stay closed (`SIGNER_PRINCIPAL_UNSET`).
- `GET` on the same path returns the exact statement text to show him.
- The J6 preview passes that attestation's id to the renderer as
  `receivingSignatureAttestationId`; without one the DRAFT prints the
  pending enclosure line (the staff attestation id is never used in its
  place).
- The row is a Prisma `create` in that transaction without `attested_at`:
  M1 `877466f` gives every database-stamped column a default, and the
  trigger stamps it (overwriting any supplied value).

#### 5.11 Board invoice upload, 5.12 file download

`POST /cases/[caseId]/board-invoice` (multipart, `file` only): the §5.10
pipeline with `kind: 'board_invoice'` and no attestation. The J6 draft
attaches it only when `boardInvoiceArtifactId` names it.
`GET /cases/[caseId]/files/[artifactId]` returns the verified bytes from #2704
`readFinanceArchivePdf` (size and sha256 must match the row) with
`X-Billing-Sha256`; no signed or public URL is ever produced.

**Archive visibility** (Mike, 2026-09-28): J5, J6 and voucher evidence stay in
a staff-restricted billing archive linked to the student. The only read path
is this admin route (§3 checks: admin, tenant, provider org, case ownership).
There is no member-facing route, portal page or signed URL for billing
artifacts; the student receives their required copy only as an email
attachment (§5.14). A test pins that no route outside
`app/api/admin/members/[id]/billing/two-stage/` reads the finance archive.

#### 5.13 Sign (signer only; gates default off)

`POST /cases/[caseId]/[stage]/sign`
`{ recordId, version, contentSha256, intentConfirmed: true, intentText }`.
Order: §3 steps 1–9 → gates (`SIGNER_NOT_CONFIGURED`,
`SIGNED_RENDERER_UNAVAILABLE`, `SIGNER_PRINCIPAL_UNSET`, both stages since M1
`55a0562`) → signer (`authorizeSigner` with the designated-signer row; the
signer must be the designated principal signing as himself, never a delegate,
`403 SIGNER_NOT_DESIGNATED`; the database also refuses a delegation id,
`SIGNER_DELEGATION_DISABLED`) → exact echo and intent → freeze checks (§5.9;
a J5 too is dated the server date it is signed: blocker
`J5_ISSUE_DATE_NOT_TODAY`, DB `J5_ISSUE_DATE_NOT_SERVER_DATE`; and the
signer's one active signature image must be exactly the one the draft froze in
`content.signature`: `409 SIGNATURE_ASSET_MISSING` / `SIGNATURE_ASSET_MISMATCH`,
the same rule the database enforces) → the image bytes are read from the
private archive and verified against the frozen SHA-256 →
`signedAt = now` (server clock; no route accepts a caller-supplied issue or
sign date; the database stamps `signed_at` and the transaction rolls back
unless it falls on the same Chicago day and, for a J6, `content.issueDate`),
`buildSignatureBlock` (method `approved_image`) → render the signed PDF
(`renderSignedFromContent`, `frozenAt = signedAt`: the approved layout with the
DRAFT badge and "signature required" caption omitted and the image placed on the
signature rule; it refuses a held J6 and a J6 without the receiving-signature
attestation) → #2704 archive (before the transaction; storage is not transactional) → one
transaction: artifact row (`source: 'rendered'`, bound to the record version
and `renderedContentSha256`), compare-and-set update
`WHERE status = 'draft' AND content_sha256 = request.contentSha256` writing
`signature_method = 'approved_image'` (0 rows →
`409 VERSION_STALE`), audit. A failure after the archive write or inside the
transaction commit returns `500 OUTCOME_UNCERTAIN`. A repeat after success
is `409 ALREADY_SIGNED`.

#### 5.14 Send (per recipient, idempotent; disabled)

`POST /cases/[caseId]/[stage]/send` `{ recordId, versionHash, retryFailedRoles? }`.

1. §3 steps; the record is `signed` (`409 NOT_SIGNED`) with that hash
   (`409 VERSION_STALE`). A `sent` record returns every role
   `ALREADY_ACCEPTED` with no provider call.
2. Gates before any write: `EMAIL_NOT_ENABLED`, J6
   `SIGNER_PRINCIPAL_UNSET`, `FINANCE_ARCHIVE_UNAVAILABLE`.
3. Attachments read with `readFinanceArchivePdf` and ordered by
   `stageAttachments` (`409 ATTACHMENT_MISMATCH`, nothing sent).
4. Per role in `STAGE_RECIPIENT_ROLES[stage]` order:
   `assertSendMatchesSnapshot`; a `pending` claim at least 15 minutes old
   (`markStaleClaimAmbiguous`, `RECONCILE_CLAIMED_MIN_AGE_MS`) is moved to
   `ambiguous` (compare-and-set on `claim_token`); a younger `pending` claim is
   `IN_FLIGHT`. Then `decideClaim`: `skip_delivered` → `ALREADY_ACCEPTED`;
   `needs_reconciliation` → `NEEDS_RECONCILIATION`; `new_attempt_required` →
   attempt n+1 only for roles in `retryFailedRoles`, else
   `FAILED_RETRY_NOT_REQUESTED`; `claim_new` → insert `pending`;
   `retry_same_key` → `ambiguous → pending` with a new token (after 23 h the
   database refuses → `NEEDS_RECONCILIATION`). A claim insert refused because
   another request claimed the role at the same moment (a unique violation,
   or M1's "no new attempt" / "next attempt" / "first claim" rules) is
   `IN_FLIGHT`; every other insert refusal (for example
   `VOUCHER_RECEIPT_SIGNATURE_UNATTESTED` after a re-designation, or a frozen
   name/address mismatch) is permanent and returns its named refusal (§2),
   with `outcomeUncertain` when an earlier role's copy was already sent.
   Every store write marks the request before it runs. Per M1 `55a0562` an
   `ambiguous` claim is never settled `failed` (only a same-key retry or
   reconciliation), `pending → failed` always writes the provider result
   label, and `pending → needs_reconciliation` happens only with a recorded
   provider outcome (a 409 from the provider) or from `ambiguous`.
5. Provider call: `sendBrandedEmailOrThrowOnSkip(resend, { to: frozen email,
   idempotencyKey: sendIdempotencyKey(...), attachments: [{ filename,
   content: Buffer.from(bytes) }] })`, one message per role, no cc/bcc.
6. Classification: resolved with `data.id` → `provider_accepted`; resolved
   without `data.id` → `ambiguous`; `ResendResolvedSendError` →
   `outcomeFromThrown(e, readStatus)` with its `statusCode` (`null` stays
   `ambiguous`; 409 → `needs_reconciliation`; a definite 4xx other than 408,
   409, 429 → `failed`); any other thrown error → `ambiguous`;
   `FixtureRecipientSkippedError` → `failed` with `provider_result =
   'recipient_skipped'` (the wrapper refused before calling the provider).
7. Result written with compare-and-set on `claim_token`; a lost race is
   `IN_FLIGHT`. If that write fails after the provider call, the role is
   reported `AMBIGUOUS` and left to the 15-minute rule.
8. `deliveryState(...)`: when complete, one transaction moves
   `signed → sent` (the database stamps `sent_at`), writes `send_receipt`, and
   for a J6 the `pending` payment event; audit `billing.two_stage.sent`.

`maxDuration = 60`; each provider call runs with the wrapper's own retry
budget. Per-role outcome text: `ACCEPTED` "Sent to {role}."; `AMBIGUOUS`
"The {role} copy may or may not have been sent. Send again before
{retryWindowEndsAt} to retry safely with the same key, or reconcile it.";
`NEEDS_RECONCILIATION` "The {role} copy needs a person to confirm whether it
arrived."; `FAILED` "The email provider rejected the {role} copy."

#### 5.15 Payment

`GET /cases/[caseId]/payment` returns `casePaymentView()` plus the events.
`POST /cases/[caseId]/payment/received` `{ j6RecordId, receivedOn, evidence }`
records `received` (`recordPaymentReceived`) against the J6 that holds the
pending event (`409 PAYMENT_J6_CHANGED` otherwise), never before that J6's
America/Chicago send date (`422 PAYMENT_RECEIVED_BEFORE_SENT`, checked before
the write and by the database). The follow-up window is an expectation, never
a due date.

#### 5.16 Reconcile, 5.17 close, 5.18 cancel a partial send

- `POST /cases/[caseId]/[stage]/sends/[sendId]/reconcile`
  `{ outcome, note, expectedStatus, evidenceArtifactId? }`: record `signed`;
  a `pending` claim ≥ 15 min is first marked `ambiguous`, a younger one is
  `409 CLAIM_IN_FLIGHT`; status must equal `expectedStatus`
  (`409 SEND_CHANGED`); `reconcileSend`; compare-and-set; audit; then the
  §5.14 step 8 completion check.
- `POST /cases/[caseId]/[stage]/versions/[recordId]/close`
  `{ action: 'void' | 'supersede', reason, versionHash }` per M1's closure
  rules; a blank reason → `422 CLOSE_REASON_REQUIRED` before any write; the
  closing update writes `closed_by_subject_id` (the verified user) and the
  trimmed `close_reason` (M1 `CLOSE_ACTOR_REASON_REQUIRED`); a signed record
  with claims → `409 PARTIAL_SEND_REQUIRES_CANCELLATION`;
  a J5 an open J6 follows → `409 J5_LINKED_BY_OPEN_J6`.
- `POST /cases/[caseId]/[stage]/versions/[recordId]/cancel-send`
  `{ action, reason, versionHash, acknowledgedRolesAlreadyReceived }`: the
  audited partial-send cancellation (M1 rules; `409 NO_SEND_CLAIMS`,
  `SENDS_UNRESOLVED`, `ALL_RECIPIENTS_ACCEPTED`, `ACCEPTED_ROLES_CHANGED`).

#### 5.19 Resend webhook linkage

The existing `POST /api/webhooks/resend` (`handleResendWebhook`) gains an
optional store method, `applyBillingDeliveryEvent({ providerMessageId, kind,
occurredAt, providerEventId })`, called for `email.delivered`,
`email.bounced` and `email.complained`. It looks up `billing_stage_sends` by
`provider_message_id` (status `provider_accepted` or `reconciled_delivered`)
and inserts `billing_delivery_events` (`source: 'resend_webhook'`, the Svix
id as `provider_event_id`; a duplicate is a no-op). It never changes the stage
or the claim. When the message is a billing copy, the handler does not turn
off the recipient's general notifications: a bounced J5/J6 copy is a billing
follow-up (`followUp` in the summary), not a reason to mute the student. The
`emailSendLog` path is unchanged, and a store without the method behaves
exactly as before.

- **Billing copy by tag.** A copy is also recognized by its `email_send_logs`
  row (`templateKey` `billing_two_stage` or `entityType`
  `billing_stage_record`, set by the send port), so a copy whose provider id
  never reached the billing ledger (a failed settle, the gate off) is still
  never muted.
- **Hard bounces only.** Billing evidence is recorded for `delivered`,
  `complained` and permanent `bounced` events; a transient or undetermined
  bounce records nothing and raises no follow-up.
- **Ledger failures.** An error from the billing linkage is caught, recorded
  as an `email_delivery` diagnostic, and the event is otherwise handled as
  usual (200), so a billing problem never fails other mail's events.

Non-billing events: the route wires the method through
`billingDeliveryLinker(prisma)` (`lib/billing/twoStage/api/webhookLinkage.ts`),
which returns "no match" without any database read while the migration gate
(`BILLING_TWO_STAGE_MIGRATION_APPLIED`) is closed, so an environment without
the billing tables handles every event as before. With the gate open, a
message id that matches no billing send reports no match and the handler
takes the pre-M3 path. `webhookLinkage.test.ts` pins this: for `sent`,
`delivered`, `delivery_delayed`, permanent and transient `bounced`,
`complained` and `opened`, the store with the real linker (gate closed, and
gate open with no billing match) gives the same response and the same store
calls as the pre-M3 store.

#### 5.20 Signature image (designated signer)

`GET /api/admin/members/[id]/billing/two-stage/signature` → `SignatureStatusDto`
`{ active, approvalStatement, viewerCanUpload }` for any admin. Metadata only:
the storage key and the image are never returned.

`POST` (multipart: PNG `file`, JSON `attestation`
`{ statementConfirmed: true, statementText, replace?, revokeReason? }`) →
`201 SignatureUploadDto { signature, replaced }`, or `200` with the existing row
when the identical image is uploaded again. The organization-level image sits
under a member path only so it runs the same §3 checks as every other route
(migration gate, Origin, admin, tenant, provider org).

Order: §3 steps → the designated signer as himself
(`503 SIGNER_PRINCIPAL_UNSET`, `403 SIGNATURE_ASSET_WRONG_PRINCIPAL`) → the
signer account configured (`503 SIGNER_NOT_CONFIGURED`, `authorizeSigner`, the
env var a required second key as for the receipt attestation) → **everything is
validated before any storage write**: the statement echoed verbatim
(`422 SIGNATURE_STATEMENT_NOT_CONFIRMED`), a PNG within 4 MiB of request body
(`415 UNSUPPORTED_MEDIA_TYPE`, `422 SIGNATURE_IMAGE_INVALID` for a malformed PNG or one
pdf-lib cannot embed, `422 UPLOAD_EMPTY`) → an active image exists: the same
bytes are a no-op, a different image needs `replace: true`
(`409 SIGNATURE_ASSET_EXISTS`) and a `revokeReason`
(`422 SIGNATURE_REVOKE_REASON_REQUIRED`) → exact bytes to the private bucket
(content-addressed, never overwritten) → one transaction: revoke the old row
(`revokedBySubjectId`, `revokeReason`; `revoked_at` is the database's), insert the
new row (`uploaded_at` / `approved_at` are the database's), audit
`billing.two_stage.signature_asset_approved`. A concurrent approval is
`409 SIGNATURE_ASSET_EXISTS`. A storage outage approves nothing.

Effect on drafts: a draft freezes the active image into `content.signature`, so
the case summary raises `SIGNATURE_ASSET_MISSING` while none is approved and
`SIGNATURE_ASSET_MISMATCH` for a draft saved before a change; saving the draft
again carries the current image.

### 6. Blockers and error codes

#### 6.1 J6 holds

`voucher_amount_differs`, `voucher_class_differs`, `voucher_period_conflict`,
`end_date_not_contract`, `class_differs_from_quote` are hard holds
(`HOLD_<REASON>` codes, message `REVIEW_REASON_TEXT`); no route clears one.

#### 6.2 Prerequisite blockers

M1's gates return messages. M3 maps each exact M1 message to a stable code
(`J5_ALREADY_OPEN`, `J5_READINESS_MISSING`, `J5_STUDENT_NOT_READY`,
`J5_COUNSELOR_REQUEST_MISSING`, `PROGRAM_TERMS_UNAVAILABLE`, `J6_ALREADY_OPEN`,
`J6_PRIOR_QUOTE_MISSING`, `J6_J5_NOT_SENT`, `J6_EXTERNAL_QUOTE_INCOMPLETE`,
`J6_VOUCHER_MISSING`, `J6_VOUCHER_ATTESTATION_INCOMPLETE`,
`J6_VOUCHER_UNSIGNED`, `J6_BOARD_INVOICE_INVALID`, `J6_CLASS_START_MISSING`,
`J6_CLASS_START_FUTURE`, `CLASS_NOT_STARTED`, `COUNSELOR_PHONE_MISSING`,
`BOARD_NAME_MISSING`, `RECIPIENTS_INVALID`); an unmapped message becomes
`PREREQUISITE_UNMET` with the M1 text, and a test pins the table to the M1
strings. M3 adds `DRAFT_MISSING`, `DRAFT_STALE`, `SENDS_UNRESOLVED`,
`RECEIVING_SIGNATURE_NOT_ATTESTED` (J6: no signer-principal attestation on
the current voucher's exact hash) and the §4 gate codes.

Uploads: `UPLOAD_TOO_LARGE` "The file is larger than 4 MB. Upload a smaller
PDF (scan at a lower resolution)."; `PAYLOAD_TOO_LARGE` "The request is too
large." The other codes and messages are as listed in the routes above.

### Decisions (M3)

Mike Brown's 2026-09-28 review settled these as engineering decisions. One
line each, with the reason.

1. **Fresh MFA at signing:** not implemented; documented as a known limitation (§3), because the repo has no step-up primitive and sign is disabled until it is added.
2. **Real-email gate:** `BILLING_TWO_STAGE_EMAIL_ENABLED`, default false, set by Mike only after real-email acceptance, so no environment sends J5/J6 mail by accident.
3. **Unmigrated environments:** `BILLING_TWO_STAGE_MIGRATION_APPLIED` gates operational two-stage routes with `503 MIGRATION_NOT_APPLIED`. The member-level unsigned preview remains available with missing optional billing information and cannot persist, sign, or send anything.
4. **Cases:** one case per member and program (`409 CASE_EXISTS`), no enrollment row required, because readiness comes from attestations and M1 has no uniqueness to lean on.
5. **Which counselor:** the WAP assigned counselor (`resolveAssignedCounselorContact`) prefills name and email and staff may correct them; the phone is always staff-entered, because the brief names the WAP counselor and no phone is on file.
6. **Printable-text rules:** enforced by M3 at draft save (`printableIssues` + trial render) with `TEXT_NOT_PRINTABLE` / `VOUCHER_REFERENCE_TOO_LONG`, because the renderer's limits are layout facts; moving them into M1 is an optional follow-up.
7. **System J5 vs external quote:** a sent system J5 wins, because its terms are frozen and hashed while the external quote is an attestation.
8. **Document numbers:** max + 1 per organization, stage and issue year (America/Chicago) inside the save transaction, retried on the unique violation, because M1's `(organization_id, document_number)` unique key is the only allocator needed.
9. **Stored freeze:** none; freeze is a verified, write-free checkpoint, because any later save changes the hash and sign re-checks it.
10. **Upload size:** a bounded multipart cap of 4 MiB per request (file ≤ 4 MiB − 64 KiB), enforced from `Content-Length` and a counting reader before buffering, because Vercel refuses bodies over ~4.5 MB; direct-to-storage signed uploads were rejected because they would need a signed URL and a second hash step.
11. **`signed_at` clock:** the database stamps it (M1 `b76cedee` refuses a caller value); the signed PDF is rendered and archived first, so the route rolls back unless its printed date, `content.issueDate` and the Chicago date of `signed_at` agree, because the page and the record must not disagree about the signing day.
12. **Stale `pending` age:** 15 minutes for the API and the database (`RECONCILE_CLAIMED_MIN_AGE_MS` = `IN_FLIGHT_GRACE_MS` = `billing_stale_claim_age()`); `decideClaim` answers `mark_ambiguous` for an older pending claim and `in_flight` for a younger one, and the route marks it before any retry, because the database only allows a same-key retry from `ambiguous`.
13. **Skipped recipients:** `FixtureRecipientSkippedError` is a definite `failed` (`recipient_skipped`), because the wrapper refuses before calling the provider, so nothing can have been sent.
14. **Function duration:** `maxDuration = 60` on send, sending the two or three copies in sequence, because a background job would need new infrastructure and every copy is individually idempotent.
15. **Email copy:** fixed per-stage subject (`{title} {documentNumber}`) and a short body in M3 code, not hashed, because the signed PDF is the document and the body carries no terms.
16. **Reconciliation evidence:** note-only, with an optional existing case file, because M1 has no artifact kind for provider exports.
17. **Closing a J5 behind an open J6:** refused with `409 J5_LINKED_BY_OPEN_J6`, pending M1's link-guard fix on #2699 (check `prior_j5_record_id` only on insert or change).
18. **`provider_message_id` uniqueness:** M1 adds the unique partial index on #2699; the webhook branch looks up by it and ignores a message id that matches more than one row.
19. **Bounce side effect:** a bounce or complaint on a J5/J6 copy never mutes the recipient's general notifications; it flags billing follow-up, because a board mailbox problem must not silence a student.
20. **Gate error codes:** M3 maps M1 messages to stable codes with a pinning test (§6.2), because changing M1's return type is not needed for this release.
21. **DTO decisions:** the renderer prints the organization, website, footer, title (`Quote / Voucher Request`, frozen by M1 `260ad59`), signer name/title and both payment sentences from content (§1), and the voucher reference limit is M1's `VOUCHER_REFERENCE_MAX_LENGTH` (80, a DB CHECK too), because the printed page must equal the hashed content.
22. **Reviewed draft workflow:** the buttons open a draft editor even with facts missing; incomplete facts live client-side and go through `POST draft/review` (partial fields, per-field errors and blockers, no write); `PUT draft` persists only a complete, validated set (`422 DRAFT_INCOMPLETE`, nothing saved, otherwise), because M1 frozen content cannot be partial; persisting incomplete drafts would need an M1 draft-inputs table.
23. **Ambiguous-error copy:** `INTERNAL_ERROR` only before any side effect; after one, `OUTCOME_UNCERTAIN` asks staff to reload and reconcile, because "nothing was signed or sent" can be false after a provider or database failure.
24. **DRAFT preview never gated:** a held J6 renders with `DRAFT - ON HOLD - NOT SIGNABLE`, a missing receipt attestation as a pending enclosure line, and the blockers travel in `X-Billing-Blocker-Codes`, because staff review the layout before Michael attests; freeze, sign and send enforce every gate.
25. **Michael's receiving signature:** only the designated signer principal can attest it, on the voucher's exact sha256 (§5.10a); a replaced voucher clears it, and J6 sign and send stay closed until M1's designated signer principal is set (`SIGNER_PRINCIPAL_UNSET`), per Mike's 2026-09-28 requirement.
26. **Layout:** the renderer matches Mike's synthetic J5/J6 references (no document number printed; M1 dropped the unprinted tagline; signer name, then `{title}, {organization}`; J6 enclosure line), because they are the approved layout; the fixture test compares whole pages.
27. **Phone string:** `(512) 825-2896` frozen and printed verbatim, because Mike chose that display string and the renderer must not reformat bound text.
28. **J6 issue/sign dates:** server date only, on or after both class start and voucher receipt, surfaced as two blockers, because a J6 must never predate the class start or the voucher it encloses.
29. **Archive visibility:** staff-only archive route, no member-facing path or signed URL, student copy by email only, per Mike's retention decision.
30. **Voucher upload format:** PDF only (declared MIME and `%PDF-` magic bytes; `VOUCHER_PDF_ONLY`), original bytes untouched, because #2700 and `storageArchive` store PDFs only.
31. **Designated signer gate:** J6 sign/send and the receipt attestation are gated on M1's `billing_designated_signers` row (`SIGNER_PRINCIPAL_UNSET`), replacing the earlier env gate, because the database enforces the same principal.
32. **Voucher upload by staff:** file-only uploads are open to any admin; the voucher data entry and the receipt signature are the designated signer's, per M1's rule that only he attests a board-signed voucher.
33. **Gate order on sign/send:** the release gates are checked right after the §3 access checks, before the signer, intent or record checks, so a disabled route answers 503 without reading any record or file.
34. **Waiting on Michael:** the summary and voucher responses name each step waiting on the designated signer (`waitingOnDesignatedSigner`, `readinessWaitingOn`, blocker `waitingOn`), because #2706 must show that staff cannot clear those steps.
35. **Env signer check on the receipt attestation:** redundant for identity once the designated-signer row exists, kept as fail-closed defense (row and env must agree), because a disagreement between them should refuse, not pick a side.
36. **Webhook before the migration:** the billing linkage never reads the database while the migration gate is closed, because an environment without the billing tables must handle every Resend event exactly as before.
37. **Refusal after a committed step:** a refusal keeps its code but adds `outcomeUncertain` and reconcile copy once a storage write, provider call or committed statement happened earlier in the request, because a trigger refusal rolls back only its own transaction.
38. **Claim conflicts:** only a concurrent claim for the same role is `IN_FLIGHT`; other claim-insert refusals are named refusals, because a permanent refusal shown as "being sent" would never resolve.
39. **Printed spacing:** bound values with double spaces, NBSP or other whitespace are refused at draft save (`TEXT_NOT_PRINTABLE`), and the renderer refuses them too, because wrapping would print them differently from the hashed value.
40. **Webhook billing copies:** recognized by send-log tags as well as the ledger; only hard bounces are billing evidence; a ledger error is a diagnostic, never a failed event, because general mail handling must not depend on the billing ledger.
41. **Archive gate in the summary:** reported unknown (`enabled: null`), because the summary does not call Storage and "closed" would be false.
42. **Combined readiness:** deprecated in favor of `readinessByStage`, because merging the stages shows J5 facts on the J6 card.
43. **Designated signer for both stages (M1 `55a0562`):** J5 and J6 signing need the designated-signer row and the signer himself (no delegate), and the env signer stays a required second key in M3, because the row is the identity and a disagreement must refuse.
44. **New M1 refusals:** every `CODE:` refusal M1 raises maps to its own error (§2), and J5 gets the server-date blocker `J5_ISSUE_DATE_NOT_TODAY`, because staff need the reason, not a generic refusal.
45. **Signature image is organization-level but routed under a member (§5.20):** it reuses the §3 checks unchanged instead of a second access path.
46. **Replacing an image revokes the old one in the same transaction, with a reason:** a wrong upload must be fixable without database access, and the database allows only one active image.
47. **The upload needs the same two keys as signing (designated row and the env signer):** an image is his approval, so it gets the strictest signer guard.
48. **The signed page differs from the approved DRAFT layout only by omitting the two draft markers and placing the image:** nothing new is printed, so the reviewed wording and the parity tests still cover the whole page.
49. **A stored image must be embeddable:** the upload proves pdf-lib can place it, because the database accepts some PNG variants a PDF writer may not, and a failure at sign time would leave the signer stuck.

### Not in M3

Fresh MFA step-up; persisted incomplete drafts; migration apply in any
environment; real email; production backup/restore proof. (The signed renderer
and the signature image upload were added after M3; see §5.13 and §5.20.)

### Route index (M3)

Member-level unsigned preview, outside the case routes:

| Method | Full path | Notes |
| --- | --- | --- |
| GET / POST | `/api/admin/members/[id]/billing/two-stage/[stage]/preview` | either document; no case or operational prerequisites; POST accepts unsaved fields and requires same-site Origin |

Under `/api/admin/members/[id]/billing/two-stage/cases`; files under
`app/api/admin/members/[id]/billing/two-stage/cases/`. Every route runs the
§3 checks; mutations need a same-site Origin.

| Method | Path | Notes |
| --- | --- | --- |
| GET / POST | `/` | list; open a case |
| GET | `/[caseId]` | `CaseSummaryDto` |
| POST | `/[caseId]/attestations/j5-readiness` | |
| POST | `/[caseId]/attestations/class-started` | |
| POST | `/[caseId]/attestations/external-quote` | multipart |
| POST | `/[caseId]/voucher` | multipart, PDF only; `attestation` part designated signer only |
| POST | `/[caseId]/voucher/[artifactId]/attestation` | designated signer only |
| GET / POST | `/[caseId]/voucher/[artifactId]/receipt-attestation` | statement; designated signer principal only |
| POST | `/[caseId]/board-invoice` | multipart, PDF only |
| GET | `/[caseId]/files/[artifactId]` | the only archive read path; staff only |
| GET | `/[caseId]/payment` | |
| POST | `/[caseId]/payment/received` | |
| POST | `/[caseId]/[stage]/draft/review` | partial facts; never writes |
| PUT | `/[caseId]/[stage]/draft` | complete set only |
| GET | `/[caseId]/[stage]/draft/preview` | DRAFT PDF, never gated; blocker codes in headers |
| POST | `/[caseId]/[stage]/freeze` | writes nothing |
| POST | `/[caseId]/[stage]/sign` | gates default off; renders the signed page with the signer's image |
| POST | `/[caseId]/[stage]/send` | gates default off; `maxDuration = 60` |
| POST | `/[caseId]/[stage]/sends/[sendId]/reconcile` | audited |
| POST | `/[caseId]/[stage]/versions/[recordId]/close` | audited |
| POST | `/[caseId]/[stage]/versions/[recordId]/cancel-send` | audited |
| POST | `/api/webhooks/resend` (existing) | billing branch: `applyBillingDeliveryEvent` |
| GET / POST | `../signature` (one level up: `/api/admin/members/[id]/billing/two-stage/signature`) | §5.20: image status; designated signer approves or replaces the image |

## Release runbook (two-stage J5/J6)

Everything ships dark: each gate below defaults off, so merging changes no
behavior until the matching step is done. Production migrations run inside the
Vercel build (`build:with-migrate`, see `docs/DEPLOYMENT-CHECKLIST.md`), so a
merge to `master` applies its migrations at deploy. Steps marked **Mike** or
**Ops** are deliberately not automatable: they are identity, backup and
credential decisions.

| # | Step | Owner | Done when |
| --- | --- | --- | --- |
| 1 | Take a fresh PROD backup (condition of the M1 merge) | Mike / Ops | Backup confirmed restorable per `docs/DATABASE-RECOVERY.md` |
| 2 | Merge bottom-up: #2699 (M1 schema), #2707 (M3 routes), #2713 (M4 page, includes #2706), **then** #2700 (bucket), **then** the signing PR that adds `20260928140000` | Mike | Each deploy's migration stage is inspected before the next merge |
| 3 | Confirm the bucket: `billing-finance` exists, is private, 10 MiB, and allows `application/pdf` and `image/png` only (no Storage policy) | Ops | Checked with the Storage API, not only SQL |
| 4 | Designate the signer (ops-reviewed change): one row in `billing_designated_signers` (`organization_id`, `user_id`, `designated_by`, `note`) naming Michael's own account | Ops | `SELECT user_id FROM billing_designated_signers` returns his id |
| 5 | Set the environment: `BILLING_TWO_STAGE_MIGRATION_APPLIED=true`, `BILLING_EXECUTIVE_SIGNER_USER_ID=<his user id>` (must equal the row), `BILLING_PACKET_PROVIDER_ORG_ID` if the provider is not the default org. Leave `BILLING_TWO_STAGE_EMAIL_ENABLED` unset | Ops | The billing page loads and shows the case card; both sign gates read as expected |
| 6 | Michael signs in **as himself**, opens any member's `J5 / J6 billing` page and approves his signature image ("Your signature": choose the PNG, confirm the statement) | Michael | The card shows "Approved <date>" |
| 7 | DEMO acceptance of J5: open a case, record readiness, save the draft, review the DRAFT, "Review for signature", sign; open the signed PDF from the case files | Mike | The PDF shows the approved layout with his image, no DRAFT marker; the record is `signed` with method `approved_image` |
| 8 | Email acceptance to test recipients only, then set `BILLING_TWO_STAGE_EMAIL_ENABLED=true` | Mike / Ops | Each recipient role received exactly one copy; the ledger shows `provider_accepted` |
| 9 | J6 later, when a board-signed voucher arrives: staff upload it, Michael records its details and his receiving signature, then sign and send | Mike | See §5.10, §5.10a, §5.13, §5.14 |

Safe stops and rollbacks:

- **Wrong image approved:** replace it (Replace my signature image, with a
  reason). Signed records keep the hash they froze; drafts saved earlier must be
  saved again (the page says so).
- **Withdraw signing:** unset `BILLING_EXECUTIVE_SIGNER_USER_ID` (sign and the
  image upload return `SIGNER_NOT_CONFIGURED`), or flip
  `SIGNED_RENDERER_AVAILABLE` in `lib/billing/twoStage/api/gates.ts`.
- **Stop email:** unset `BILLING_TWO_STAGE_EMAIL_ENABLED`.
- **Migrations are additive:** roll the application back with a Vercel rollback
  (it does not change the database); the schema rollback is the manual, reviewed
  procedure in the M1 migration notes above.
- If `20260928140000` ever fails with "bucket is missing", it ran before
  `20260927232204`. Merge #2700 first; do not edit the bucket by hand.
