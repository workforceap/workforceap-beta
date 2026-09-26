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
  the tuition rows match it, and that the J6 facts block and narrative were
  reviewed. Nothing
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
- **J6 facts block and narrative**: the facts block (dates, bill-to,
  reference, funding basis/approved amount/reference, each row with its amount,
  total hours, total) is generated from the J5 rows and the attestation
  (`buildJ6Facts` in `packetText.ts`), printed first, frozen at signing, and
  authoritative. The narrative after it is human-reviewed prose, attested at
  signing (it is part of the reviewed fingerprint); the only machine check is a
  basic numeric-currency block (`narrativeMoneyViolations`: `$`, money-formatted
  numbers, total/amount/tuition/fee/invoice next to a number). Wording such as a
  payer name or a spelled-out amount is covered only by the signer's review.
- **Draft curricula**: programs whose curriculum is not owner-verified
  (`isCurriculumOwnerVerified` in `shared/programCurricula.ts`, the same rule as
  the price list) cannot be billed; the page lists them as unavailable.
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
  two branded emails with both PDFs attached, to the student and the counselor
  in the snapshot (no cc). A send is refused when the member's live email, or
  the live counselor assignment or email, differs from the snapshot; reconcile
  still works, and delivery then needs a re-issued packet (see Supersede). The
  student copy goes first; if it is not sent, the counselor copy is not sent.
  Sends run in attempts (`lib/billing/sendAttempts.ts`). Starting an attempt
  creates a `pending` row per recipient in one transaction; a new attempt
  ("Email again") can only start when every row of the current one is terminal
  (`sent`, `rejected_definite`, or operator-reconciled). Each row is claimed by
  compare-and-set on a claim token; delivery uses the key
  `billing-packet:<id>:<attempt>:<recipient>`, a payload built only from frozen
  inputs (snapshot + the attempt's from address and branding), and a 30 s
  provider timeout. Outcomes: accepted -> `sent`; a definite provider rejection
  -> `rejected_definite`; timeout/network/5xx/429 -> `ambiguous` (Retry with the
  same key, which Resend deduplicates within 24 h); Resend 409 (key reused with
  a changed payload) or an unconfirmed copy older than 23 h ->
  `needs_reconciliation`. Operator reconciliation records delivered / not
  delivered with actor, time and a note; a still-claimed row can only be
  reconciled 15 minutes after its last claim, and "not delivered" only after
  the 24 h window. Late provider results are recorded on the row (and flip a
  "not delivered" row back to `needs_reconciliation`). This is not lifetime
  exactly-once. Live, not frozen: the email template code and the
  List-Unsubscribe header the mail wrapper adds.
- **Supersede and re-issue**: an admin can re-issue a signed packet with a
  reason. In one transaction under the sign and send locks, the old packet
  becomes `superseded` (who, when, why, replacement id; pending copies closed
  as not sent) and the replacement is signed through every normal guard and
  links back. Refused while a copy of the old packet is in flight. A superseded
  packet never sends again (reconcile still works), and its replacement cannot
  be delivered until the old packet's unconfirmed copies are settled. Members
  see the current packet first and a superseded one only if it reached, or may
  have reached, them, labelled "Superseded - replaced by". Superseded PDFs are
  unchanged (no watermark).
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
- Void without replacement, installment or cumulative-balance billing against
  one approval, per-board ITA limits, and per-tenant provider identity / payer
  configuration.
