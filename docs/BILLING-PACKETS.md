# J5 Training Invoice + J6 Cover Letter packets

Ops request (9/3/26): "Need a J5 invoice and J6 cover letter system that creates a
signed [document] with the classes and breakdown of prices. Then have a button
that automatically emails to counselor and the student."

## What it does

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
- **Funding approval (required)**: before signing, staff choose the funding
  basis (WIOA ITA or separate contract), enter the approved amount and the ITA
  approval / contract reference, and tick that they checked it. Nothing is
  prefilled. The $7,500 price-list figure is a maximum, not an approval
  (WFSCA Board plan PY2025-2028 p.57; TWC 40 TAC §840.61), so a program priced
  from the fallback cannot be signed without this review. The server refuses a
  total above the recorded approved amount, and a WIOA ITA total above $7,500
  without a recorded Board-approved exception. A separate contract has no cap.
- **J6 must match J5**: the server refuses to sign when the letter body states
  a total, a dollar figure, total contact hours, a class list, a bill-to or a
  reference that contradicts the J5 rows (`findCoverLetterMismatches` in
  `packetText.ts`); the form shows the same check live. "Regenerate from the
  rows above" fixes a letter left over from earlier rows.
- **Create** stores one `TrainingBillingPacket` row (status `signed`) with an
  invoice number `WAP-YYYY-NNNN` unique per organization, plus a
  `signedSnapshot` (`lib/billing/packetSnapshot.ts`): provider identity,
  member name/email, program title, whether a counselor was assigned, the
  pricing source and the recorded funding approval. PDFs are rendered on demand
  from the row and that snapshot (`lib/billing/packetPdf.ts`), so later member,
  program or `BILLING_*` edits do not change a signed document. Rows without a
  snapshot (signed before it existed) render from live values.
- **Email to counselor and student** (`POST /api/billing-packets/[id]/send`):
  two branded emails with both PDFs attached. The student copy is plain and says
  "no cost to you"; the counselor copy has the amounts and a link to the student
  record. The admin who pressed the button is cc'd on the counselor copy. If no
  counselor is assigned, only the student receives it (no cc) and the UI says
  so; the J6 cc line then names only the participant.
  The student copy goes first; if it fails, the counselor copy is not sent. The
  status moves to `sent` only once every required copy went out. If the
  counselor copy fails, the student address is recorded, the status stays
  `signed`, and pressing the button again sends the counselor copy only.
  Re-sending a `sent` packet ("Email again") sends both copies again and is
  counted.
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

The letterhead contact block (address, phone, website, entity, EIN) flows
whole segments onto up to three lines instead of truncating. "Signed" and
"emailed" dates are the calendar day in `PORTAL_TIMEZONE` (America/Chicago),
not the UTC day; invoice and due dates are stored as plain dates.

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
