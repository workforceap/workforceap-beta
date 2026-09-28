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
  lines, footer phone `(512) 825-2896` and the address from the repo, all in
  one reviewed constant. Both the phone and the address are pending Mike's
  confirmation. The old renderer's magenta band is not used.

### Model (migration `20260927230000_billing_two_stage_j5_j6`)

The migration is not applied anywhere live yet, so it is edited in place on
this branch rather than followed by corrective migrations.

| Table | Purpose |
| --- | --- |
| `billing_cases` | One student + program seat. `subject_member_id` is the immutable original subject. `member_id` is the current live account: `ON DELETE SET NULL` on erasure, or repointed to a merge survivor (audited in `member_merged_from_id` / `member_merged_at`). |
| `billing_attestations` | Append-only staff statements with evidence. `j5_readiness` records two separate facts (student approved/ready; counselor requested the quote: who, when, reference) plus the planned start. `class_started` holds the actual start and the confirmed end. `voucher_board_signed` holds the reference, the program/class, amount and period the voucher authorizes, the received date, and Michael's receiving signature present. `external_j5_reference` is a manual quote issued before this system (reference, date, program/class quoted). |
| `billing_artifacts` | Append-only record of each PDF in the private finance bucket, under a content-addressed key. A rendered signed PDF is bound by composite FK to its exact `(stage record, case, stage, version)` and to that version's `content_sha256`; uploads are case-level. |
| `billing_stage_records` | One J5 or J6 version: frozen `content` + `content_sha256`, `class_name`, `amount_cents` = 750000, `contact_hours` 160/200, dates, links, derived review reasons, signature fields, send receipt. |
| `billing_stage_recipients` | Frozen recipient snapshot per record: one normalized address per role (J5: counselor, student; J6: finance, counselor, student). Editable only while the record is a draft. |
| `billing_stage_sends` | One row per recipient per attempt, unique on `(stage_record_id, stage, attempt_no, recipient_role)`. The address is bound to the snapshot by composite FK. The idempotency key is stage- and version-qualified, and each row records the SHA-256 of every attachment. |
| `billing_payment_events` | Append-only `pending` / `received` for a J6 proven sent. |
| `billing_amount_exceptions` | Hook only, disabled: signer-approved acceptance of a voucher amount that differs from the quote. |
| `billing_signer_delegations` | Hook only, disabled. |

The database enforces these rules itself, not just the app:

- **Drafts and lineage.** Records start as drafts. A correction is exactly version + 1 of a superseded or voided record in the same case and stage, through a composite `(supersedes_record_id, case_id, stage)` FK. Each record has at most one successor, and each case and stage at most one open record.
- **J5.** It needs only the readiness attestation with both facts: no voucher and no funding input. It quotes the confirmed start and start + 5 calendar months, for the case program.
- **J6.** It needs, all from the same case:
  - the class-start attestation, whose dates it prints
  - the voucher and its attestation
  - a prior quote: our sent J5, or an attested external quote. No system J5 is ever fabricated.
- **Derived holds.** `billing_stage_record_rules()` computes the J6 review reasons and refuses any other value:
  - `voucher_amount_differs`: blocking. Only a corrected voucher attestation unlocks it, or the disabled, signer-approved amount exception. A review note never does.
  - `voucher_class_differs`: blocking. The voucher authorizes another program or class.
  - `class_differs_from_quote`: blocking. The program, class or hours differ from our J5 or the external quote.
  - `voucher_period_conflict` and `end_date_not_contract`: need an audited staff review (who, when, note).
- **Signing.** It needs the exact recipient snapshot and a PDF rendered from that exact record version and content. A signed record, its recipients and its review are frozen.
- **Sends.** A copy starts as `claimed` and must go to its role's frozen address. `sent` requires `provider_message_id` and `sent_at`. `reconciled_delivered` / `reconciled_not_delivered` is a separate audited path, only from `ambiguous` / `needs_reconciliation`: who, when, a note and an optional evidence file. Settled copies are final. Every copy attaches exactly the archived SHA-256s, in order: signed PDF, voucher, invoice.
- **Sent.** A record reaches `sent` only when every required role has a `sent` or `reconciled_delivered` copy and none is still claimed, ambiguous or unreconciled.
- **Payment.** It is accepted for a J6 proven sent: `sent_at` plus delivered finance, counselor and student copies. So a sent J6 later superseded by a corrected cover letter still reconciles its payment, and an unsent J6 never does.
- **Integrity.** Artifacts, attestations, amount exceptions and payment events are append-only, and every CHECK treats NULL as a failure.

### External-send gates

Real delivery stays closed until all of these hold:

- the signer is configured and signs as themselves;
- `BILLING_LETTERHEAD_CONFIRMED=true` (the footer phone and address are pending
  Mike's confirmation; drafts may use them);
- the finance bucket preflight passes;
- email is enabled. In this PR no real email is sent at all.

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

Files live in a private Supabase Storage bucket, `BILLING_FINANCE_BUCKET`
(default `billing-finance`). Mike owns its provisioning as a separate slice.

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
