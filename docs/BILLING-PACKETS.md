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

| Table | Purpose |
| --- | --- |
| `billing_cases` | One student + program seat. `member_id` is `ON DELETE SET NULL`; `subject_member_id` is immutable. |
| `billing_attestations` | Append-only staff statements with evidence: `j5_readiness` (planned start), `class_started` (actual start + confirmed end), `voucher_board_signed` (reference, authorized amount/period, received date, Michael's receiving signature present), `external_j5_reference` (manual quote issued before this system). |
| `billing_artifacts` | Append-only record of each PDF in the private finance bucket: kind, size, SHA-256 and a content-addressed key `cases/{caseId}/{j5\|j6\|voucher\|board-invoice\|external-j5}/{sha256}.pdf`. |
| `billing_stage_records` | One J5 or J6 version: frozen `content` + `content_sha256`, `amount_cents` = 750000, `contact_hours` 160/200, dates, links, signature fields, send receipt. |
| `billing_stage_sends` | One row per recipient per attempt, unique on `(stage_record_id, stage, attempt_no, recipient_role)`, with a stage- and version-qualified idempotency key and the SHA-256 of every attachment. |
| `billing_payment_events` | Append-only `pending` / `received` for a sent J6. |
| `billing_signer_delegations` | A model hook only. Delegation is disabled in code and no UI creates one. |

The database enforces these rules itself, not just the app:

- J5 needs only a readiness attestation, with no voucher or funding input.
- J6 needs a class-start attestation, the board-signed voucher (plus its
  attestation, which must say Michael's receiving signature is present) and a
  prior quote. The prior quote is either our sent J5 (`system`) or an attested
  manual quote (`external`). A system J5 is never fabricated.
- A voucher amount or period that conflicts with the quote, or an end date
  that isn't start + 5 months, sets `review_required`. Signing is then blocked
  until a staff review is recorded (who, when, note).
- A signed record is immutable, and a correction is a new version that
  supersedes it. At most one draft/signed/sent record is open per case and
  stage.
- Artifacts, attestations and payment events are append-only. Send rows can't
  be deleted, and settled copies are final.
- Every copy must attach exactly the archived files in order: the signed PDF,
  then the voucher, then the board invoice.
- Every link is same-case, and every CHECK treats NULL as a failure.

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

### Retention and erasure

These rows mirror draft #2687's retained-finance model:

- Purging a member (`cleanupDeletedAccounts` → `users.deleteMany`) sets
  `billing_cases.member_id` to NULL and keeps `subject_member_id` and every
  stage record, artifact, send and payment row.
- Actor columns hold historical subject ids with no foreign key.

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
