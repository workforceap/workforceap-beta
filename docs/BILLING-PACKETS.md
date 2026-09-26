# J5 Training Invoice + J6 Cover Letter packets

Ops request (9/3/26): "Need a J5 invoice and J6 cover letter system that creates a
signed [document] with the classes and breakdown of prices. Then have a button
that automatically emails to counselor and the student."

## What it does

- **Who can issue**: only the training-provider organization. Issuance (page,
  sign, send, PDF render) requires the admin's session org and the packet's
  org to equal `DEFAULT_ORG_ID` (WorkforceAP), or `BILLING_PACKET_PROVIDER_ORG_ID`
  when set (must be a UUID; an invalid value disables billing with a 503).
  `lib/billing/providerOrg.ts`. The provider identity and default payer are
  deployment-wide, so this does not make billing safe for other tenants; it
  keeps them out.
- **Admin signing desk**: `/admin/members/[id]/billing` (button "J5 / J6 billing"
  on the member page). Programs offered are the member's billable enrollments
  in this org (`lib/billing/billableEnrollments.ts`): canonical `CourseEnrollment`
  rows (aliases collapsed; any row, including completed training, since the
  model has no status), or the legacy `User.enrolledProgram` only when the
  member has no rows. The POST enforces the same rule. Prefilled:
  - one J5 line per class in the member's assigned curriculum, contact hours from
    the program catalog, tuition spread across the classes by hours (whole cents,
    always sums to the total);
  - tuition source, in order: the organization's program catalog cost
    (`/admin/programs`), then the approved TWC syllabus `tuitionAndFees`. With
    neither, the tuition amounts are left **empty** and the form shows
    "Price list maximum: $7,500 (ceiling, not a charge)"; the server refuses an
    empty or zero row from that source;
  - catalog exam/book/misc fees become their own rows;
  - a fact-free J6 narrative (editable prose);
  - "Bill to" and signer defaults from `BILLING_*` env vars (see ENV-VARIABLES.md).
- **Signature**: draw on a canvas (PNG embedded in both PDFs) or type the name
  with an explicit acknowledgement (rendered in italics, marked "typed signature").
- **Staff funding attestation (required)**: funding basis (WIOA ITA or separate
  contract), approved amount, ITA/contract reference, plus explicit
  confirmations that these were checked against the ITA or contract and that
  the tuition rows match it, and that the J6 facts block was reviewed. Nothing
  is prefilled. It is a staff-recorded attestation plus reference, not proof of
  Board or contract approval (TWC 40 TAC §840.61 ties ITA funding to Board
  approval). The server refuses: a total above the recorded approved amount;
  a confirmation ticked for different values (the form records a fingerprint of
  the reviewed values and the server recomputes it); and a second signed or
  sent packet for the same member, funding basis and normalized reference
  (repeat or installment billing is not supported yet; different members may
  share a cohort contract reference).
- **WIOA ITA above $7,500**: a non-blocking warning only. $7,500 is the Capital
  Area Board's standard ITA amount (WFSCA Board Plan PY2025-2028, printed
  pp.63-64, exceptions up to $10,000); other boards may differ and no per-board
  limit exists in the app. An optional exception note is recorded as a staff
  note, unverified.
- **J6 facts block**: every factual statement in the J6 (dates, bill-to,
  reference, funding basis/approved amount/reference, each row with its amount,
  total hours, total) is generated from the J5 rows and the attestation
  (`buildJ6Facts` in `packetText.ts`) and frozen at signing. The narrative is
  prose around it; a hint flags figures typed into the narrative.
- **Create** stores one `TrainingBillingPacket` row (status `signed`) with an
  invoice number `WAP-YYYY-NNNN` unique per organization and a `signedSnapshot`
  (`lib/billing/packetSnapshot.ts`). Frozen: provider identity, member name and
  email, program slug and title, the counselor assigned at signing (id, name,
  email), the letterhead logo bytes with their SHA-256, the pricing source, the
  attestation, the J6 facts and narrative, and the warnings. PDFs render only
  from the row and the snapshot (fixed PDF metadata dates, so they are
  byte-identical). A corrupt snapshot is refused with a 409 (never re-rendered
  from live data). Only legacy rows with no snapshot render from live values,
  and they cannot be emailed.
- **Email to counselor and student** (`POST /api/billing-packets/[id]/send`):
  two branded emails with both PDFs attached, to the recipients in the
  snapshot. If the member's live counselor assignment differs from the one at
  signing (added, changed or removed), the send is refused: re-sign. The student
  copy goes first; if it fails, the counselor copy is not sent. The admin who
  starts an attempt is cc'd on the counselor copy (no counselor, no cc).
  Sends run in attempts (`lib/billing/sendAttempts.ts`): the first press starts
  attempt 1; "Email again" explicitly starts a new one. Each recipient of an
  attempt is claimed once (unique row); delivery uses the idempotency key
  `billing-packet:<id>:<attempt>:<recipient>` with a payload built only from
  frozen inputs (snapshot + the attempt's from address, branding and cc), so a
  retry within Resend's 24-hour window is deduplicated by the provider. An
  unconfirmed claim older than 23 hours, or a Resend 409 (key reused with a
  changed payload), puts that copy in "needs reconciliation": the operator checks
  Resend and marks it delivered, or starts a new attempt. This is not lifetime
  exactly-once. Live, not frozen: the email template code and the
  List-Unsubscribe header the mail wrapper adds.
- **Downloads**: every surface offers "Download both (PDF)" — the J6 cover
  letter and J5 invoice merged into one file, in that order, so the whole packet
  prints or saves as a set — plus separate "Download J5" / "Download J6" buttons
  and inline "View" links.
- **Where people see it**:
  - member: `/dashboard/documents` ("My documents" in the nav);
  - counselor: student page section "Training invoice & cover letter (J5 / J6)";
  - admin: the billing page list.
- **PDF access** (`GET /api/billing-packets/[id]/pdf?doc=j5|j6|both`): org
  admin, the member's active assigned counselor, or the member, for packets of
  the provider org. Anyone else gets 404. Single documents render inline unless `download=1`; `doc=both` downloads
  by default (`download=0` to preview it inline).

## Page layout

Each document is laid out so the closing never orphans: the J5 remit terms +
certification + signature are reserved as one unit, and the J6 closing +
signature + enclosure/cc likewise. A 10-class program (the largest in the
current catalog bar one) fits on a single page per document — guarded by a
regression test in `lib/billing/packetPdf.test.ts`. A 13-class program
legitimately runs to two pages, with real content on the second.

The letterhead never truncates the legal name or the entity + EIN line (it has
its own line); address, phone and website flow as whole segments, the font
shrinks to a 6pt floor, only the website may be shortened as a last resort,
and the band grows if even that is not enough. "Signed" and
"emailed" dates are the calendar day in `PORTAL_TIMEZONE` (America/Chicago),
not the UTC day; invoice and due dates are stored as plain dates.

## Files

- `prisma/schema.prisma` `TrainingBillingPacket` + migration
  `20260904020000_training_billing_packets`; registered in
  `lib/tenant/scopeProxy.ts` as tenant-scoped.
- Migration `20260926140000_training_billing_packet_signed_snapshot`:
  `signed_snapshot`, `send_attempt_no`, `send_attempt`, `funding_attestation_key`
  columns and the `training_billing_packet_sends` table.
- `lib/billing/`: `providerIdentity.ts` (letterhead + env overrides),
  `providerOrg.ts`, `billableEnrollments.ts`, `packetSnapshot.ts`,
  `sendAttempts.ts`,
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
- Void / supersede of a signed packet, installment or cumulative-balance
  billing against one approval, per-board ITA limits, and per-tenant provider
  identity / payer configuration.
