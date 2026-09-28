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

1. **J5 Quote/Voucher Request**, before any voucher exists. It goes to the
   counselor and the student (exactly 2 recipients) and is archived in the
   student's file.
2. **J6 Invoice/Voucher Cover Letter**, only after the board-signed voucher
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
- End date: class start plus 5 calendar months, clamped to the month's end
  (Sep 30 → Feb 28/29, Oct 31 → Mar 31, Jan 31 → Jun 30). See `dates.ts`.
  "Today" is the calendar date in America/Chicago.
- Payment: once the J6 is sent it is `pending`, with an *expected follow-up*
  window of send + 10 to + 14 days. That is a follow-up expectation, not a due
  date or a Net term, and there is no overdue state. It becomes `received`
  only when staff record the date and evidence.
- Letterhead (`letterhead.ts`): `public/images/wap_logo.png`, the three header
  lines and the confirmed footer facts from the blank WAP letterhead
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

The database enforces these rules itself, not just the app:

- **Drafts and lineage.** Records start as drafts. A correction is exactly version + 1 of a superseded or voided record in the same case and stage, through a composite `(supersedes_record_id, case_id, stage)` FK. Each record has at most one successor, and each case and stage at most one open record.
- **J5.** It needs only the readiness attestation with both facts: no voucher and no funding input. It quotes the confirmed start and start + 5 calendar months, for the case program.
- **J6.** It needs, all from the same case:
  - the class-start attestation, whose dates it prints
  - the voucher and its attestation
  - a prior quote: our sent J5, or an attested external quote. No system J5 is ever fabricated.
- **Hours.** `contact_hours` must equal `billing_contract_hours(case program)`: 200 for `software-developer-professional-certificate-ibm` and 160 for every other program. The PG16 proof checks this matches `hours.ts` for every approved syllabus.
- **Derived holds.** `billing_stage_record_rules()` computes the J6 review reasons and refuses any other value. Every reason is a hard hold with no bypass: no review note clears it, and there is no amount-exception path. A reason clears only when corrected structured evidence makes it disappear:
  - `voucher_amount_differs`: the voucher amount is not 750000 cents.
  - `voucher_class_differs`: the voucher authorizes another program or class.
  - `voucher_period_conflict`: the class dates fall outside the voucher period.
  - `end_date_not_contract`: the actual end is not start + 5 calendar months, the same rule the PDF renderer enforces.
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

### Signing

- Only the user whose id equals `BILLING_EXECUTIVE_SIGNER_USER_ID` can sign
  (server-only, UUID), and they must also be an active admin of the provider
  org. Nothing is ever matched by name, and no default id ships. If the
  variable is unset or malformed, signing is disabled (503).
- The printed signer is the constant
  `Michael A. Brown, PMP, ChE — Executive Director`. There is no drawn or
  free-text signature input.
- Review then sign: the sign request must echo the previewed record id,
  version and `content_sha256`, and confirm the exact intent statement. The
  rendered signed PDF is stored with its SHA-256.
- Until an approved WAP signature asset exists, the signature is a typed
  attestation block (name, title, signed-at, attestation). The image slot is
  disabled and the approved-asset list is empty.
- The voucher's receiving signature is Michael's own signature, made by hand
  on the board document before upload. The app never stamps or alters the
  voucher, and this is separate from the J6 cover-letter signature.

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
  `billing_artifacts_storage_check`). No JPEG/PNG uploads.
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
  - erasure retention
  - idempotent re-run
