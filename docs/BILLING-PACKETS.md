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
- **Money**: every row amount and the approved amount must be whole cents
  (at most 2 decimal places; otherwise 400). Totals, the J6 facts total and
  the approved-amount check are computed in integer cents per row, so the
  printed rows always add up to the printed total. The attestation
  fingerprint uses cents.
- **Counselor at read time**: signing, sending, counselor access to a
  packet, and the shared counselor member-record check
  (`lib/counselor/staffMemberAccess.ts`, used by the counselor student page)
  only count a counselor who is active, not deleted, and in the packet's /
  member's organization. A stale cross-org assignment means no counselor:
  signing prints none, PDF access is 404, and sending a packet signed with that
  counselor gets the drift 409 (`counselor_changed`).
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
  Sends run in attempts (`lib/billing/sendAttempts.ts`). Each attempt stores
  its expected recipient set when it is created, and a `pending` row per
  recipient is created in the same transaction. Every packet-level write in the
  send path (attempt start, completion) is a compare-and-set on the attempt
  number AND the packet still being sendable (`signed`/`sent`, not superseded).
  Each row claim runs under the per-packet advisory lock that supersede also
  takes. It re-reads the packet, refuses a superseded one, and compare-and-sets
  `pending` -> `claimed` with a new claim token. The lock is released before
  the provider call, and nothing else runs between the claim and that call. A
  missing row fails closed (reconciliation); it is never created lazily.
  Delivery uses the key `billing-packet:<id>:<attempt>:<recipient>`, a payload
  built only from frozen inputs (snapshot + the attempt's from address and
  branding), and a 30 s provider timeout.
  - **States**:
    - `pending`: created with the attempt, not claimed.
    - `claimed`: in flight.
    - `sent`: accepted by the provider.
    - `rejected_definite`: the provider or a local check definitely did not
      accept it.
    - `ambiguous`: timeout, network, 5xx or 429. Retry with the same key, which
      Resend deduplicates within 24 h.
    - `needs_reconciliation`: a Resend 409 (key reused with a changed payload),
      an unconfirmed copy older than 23 h, a missing row, or a provider
      acceptance that contradicts a recorded outcome.
    - `reconciled_delivered` / `reconciled_not_delivered`: operator outcomes,
      recorded with actor, time and note.
  - **Provider results**: an acceptance (message id) is written once to
    `provider_result*`, under the packet's send lock (the same lock attempt
    start, claims, reconciliation and supersede take; it waits, and if the
    locked write fails it is persisted without the lock rather than dropped).
    One UPDATE records it and settles an unsettled row, and the status then
    follows it with a bounded retry. If that completes the current attempt, the
    packet is finalized (`sent`, `sentAt`, cross-attempt `sentTo`) with the
    same compare-and-set as the send route; a superseded packet or an older
    attempt only gets the row result. A copy that is claimed,
    ambiguous or needs_reconciliation becomes `sent`. A copy recorded as not
    delivered or rejected goes to `needs_reconciliation` with a warning. The
    timeout path never overwrites a recorded acceptance. Late errors are kept
    for audit only.
  - **Margins**: a claim younger than 2 min is "in progress" (same-key takeover
    after that). A claimed copy can be reconciled, and a packet superseded,
    only 15 min after its last claim.
  - **New attempts**, once every row of the current attempt is terminal:
    - "Send to remaining recipients" (`send_remaining`) starts attempt N+1 for
      only the recipients with no delivered copy in any attempt.
    - "Email again" (`email_again`) starts attempt N+1 for everyone. If someone
      already has a delivered copy, the request must carry
      `confirmDuplicateTo` listing exactly those recipients, or it gets 409
      `duplicate_confirmation_required`. The UI confirm dialog names who
      received it and when.
  - **Earlier copies at claim time**: under the lock, a claim re-reads every
    earlier attempt's row for that recipient. It refuses (409
    `prior_copy_accepted`, no provider call) and flags this attempt's row
    `needs_reconciliation` when an earlier row has a recorded provider result
    or is claimed, ambiguous or needs_reconciliation, unless that exact row is
    in the attempt's `acknowledgedDuplicates`. Those are frozen when an
    "Email again" is confirmed: row ids, who confirmed, and when. If the locked
    acceptance write fails, the write-once provider-result columns are persisted
    first. A narrow compare-and-set then flags a contradictory `not delivered`
    or rejected row as `needs_reconciliation`; it never turns an uncertain copy
    into a sendable one. A best-effort locked settle follows at once. If that
    also fails, the packet's attempt/status compare-and-set can still finalize
    a delivered current attempt without changing the send row. The next
    `reconcileProviderResults` repairs any remaining row state. It runs under
    the lock at the start of every locked operation (attempt start, claim,
    reconcile, supersede, completion), and best-effort on the admin list and
    page reads. Accepted rows become `sent`; a recorded "not delivered" or a
    rejection becomes `needs_reconciliation` with a warning. The current
    attempt is then finalized. A "not delivered" or rejected row that carries
    an acceptance is never terminal.
  - **History**: the admin list shows every attempt's per-recipient outcome,
    with time and, for reconciliations, who and the note. Partial delivery
    stays visible after a reload.
  - **Reconcile** always answers 200 once the row is committed
    (`kind: 'reconciliation_recorded'`, fresh packet and send state), whether
    or not the attempt is complete.
  - This is not lifetime exactly-once. Live, not frozen: the email template
    code and the List-Unsubscribe header the mail wrapper adds.
- **Decided rule: unconfirmed copies of a superseded packet** (Mike, 9/26/26).
  Keep the conservative rule. Nothing is ever auto-marked undelivered, and the
  replacement is never sent while a prior copy may have landed. An operator may
  mark a copy delivered with provider evidence; the note is required and should
  name what was checked, for example the Resend log entry or message id.
  "Not delivered" can be recorded only after the 24 h idempotency window, with
  its review note. The replacement stays blocked (`prior_packet_unsettled`)
  until every copy of the old packet is terminal, which can mean waiting up to
  24 h.
- **Legacy or corrupt snapshot**: the packet serializes `sendBlockedReason`
  (`legacy_packet` | `snapshot_corrupt`). The UI disables every send action,
  shows "Re-issue required" and no live fallback addresses, and keeps
  Supersede, which signs the replacement with a fresh snapshot.
- **Supersede and re-issue**: an admin can re-issue a signed packet with a
  reason. In one transaction under the sign and send locks, the old packet
  becomes `superseded` (who, when, why, replacement id; pending copies closed
  as not sent) and the replacement is signed through every normal guard and
  links back. Refused (`in_progress`) while a copy of the old packet was
  claimed less than 15 minutes ago; the check and the closing of pending rows
  happen under the same lock the claims take. A superseded packet never sends
  again (reconcile still works and never changes its status), and its
  replacement cannot be delivered until the old packet's unconfirmed copies are
  settled. Superseded PDFs are unchanged (no watermark; open question). The
  correction form starts from current program defaults, not the old signed
  values (follow-up: prefill from the superseded packet's snapshot, deferred
  until the stakeholder's exact edits are known).
- **Who sees a packet before it is sent**: admins always do; they review the
  PDFs before sending. The member (and the counselor on the student page, and
  both via the PDF route) sees a packet, current or superseded, only once their
  copy is `claimed`, `sent`, `reconciled_delivered`, `ambiguous` or
  `needs_reconciliation`, meaning a send did or may have reached them. For a
  packet signed with no counselor, the counselor view follows the student copy.
  Current packets are listed first, then superseded ones labelled
  "Superseded - replaced by". On the counselor student page the list is also
  scoped per packet in the query: an assigned counselor sees only packets of
  their current org, and only while the member is in that org. An admin sees
  their own org's packets; a super-admin sees all. The member's own view keeps
  their packets across orgs.
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

## Retention and member deletion

- Issued packet and send rows are financial evidence. The packet's live
  `member_id` becomes null when an account is hard-deleted, while the frozen
  `subject_member_id` and signed snapshot remain for provider-org admins.
  The signer FK likewise detaches; `signed_by_subject_id` and the signed
  name/title remain as financial evidence without holding the signer account.
  The admin archive is `GET /api/admin/billing-packets/archive`; it includes
  soft-deleted accounts during the 30-day purge window and detached packets
  after hard deletion. Deleted members and counselors cannot retrieve these PDFs. Other private child
  records still follow their normal account-delete cascade. In particular,
  `course_enrollments` and `placement_records` are User cascade children; the
  invoice archive does not preserve those rows. Before enabling the 30-day
  purge for a funded participant, the award owner must decide which enrollment,
  outcome and payment evidence has a separate retention obligation and how to
  retain it with restricted access and a defined disposal date.
- Signing and send claims take a member lifecycle transaction lock. Deletion
  takes that lock, refuses an unresolved `claimed`, `ambiguous`, or
  `needs_reconciliation` copy for either the student or the frozen counselor,
  then commits `billing_deletion_pending_at` before Storage cleanup. A pending
  marker blocks later signing and claiming. The cleanup request owns a UUID
  operation token, so a second delete or erase returns a conflict while the
  first is working.
- Resume, profile-photo and certificate uploads, member-subject notifications,
  and opted-in member-linked email sends
  each insert their own UUID row in `member_external_effect_claims` before an
  external request. Concurrent notifications can proceed independently.
  Deletion and Auth identity edits refuse any unresolved row under the member
  lifecycle lock; ordinary active-member writes do not wait for these rows.
  The claim table has RLS enabled, no browser-role grants, and a restrictive
  User foreign key. The final upload pointer transaction verifies its exact
  storage claim. A completed permanent Storage 4xx rejection is released after
  confirmed cleanup; HTTP 408/429/5xx, missing status, a failed cleanup, or an
  uncertain DB commit retain a row marked `needs_reconciliation`. A crash can
  leave `in_flight`. Member, counselor and admin resume uploads, AI-built
  enhanced resumes, and application resume copies share this barrier.
- Member-subject notifications retain their own claims through the notification
  row, bounded Web Push call, and operator bridge. A provider timeout, network
  attempt that is still locally running after the deadline keeps the exact row
  for reconciliation. A settled network error or HTTP rejection releases the
  claim after the worker ends; it does not prove the provider never delivered.
  An already accepted device push cannot be recalled. The application prevents
  a new provider call after erasure wins the lock.
- Opted-in member-linked email sends claim every member recipient or named
  subject before Resend I/O. Unknown provider outcomes retain the exact claim
  for reconciliation, including the send idempotency key in its reason. A
  definite provider rejection releases the claim after the request settles.
  Existing senders without `memberEffectClaim` retain a final active-member
  lookup but do not have this durable provider boundary.
- Preview/Development use flattened Prisma transactions and cannot prove the
  member advisory-lock boundary. External-effect claims fail closed there.
  Authenticated Preview upload, notification, and opted-in email acceptance needs the DEMO schema
  caught up and an interactive database target; a successful build is not that
  acceptance.
- Member application-onboarding, first-program enrollment and primary-program
  promotion recheck the persisted deletion marker under the member lifecycle
  lock in their final write transaction. A stale authenticated request gets
  HTTP 409 before it can recreate an Application, enrollment or legacy program
  pointer. Enrollment's queued follow-ups check the marker again before they
  run, so callbacks starting after erasure skip member/partner email and
  personal activity writes. A provider request that already started cannot be
  recalled; its delivery must be reconciled separately.
- A returned deletion Storage or Auth failure releases the deletion operation token while
  leaving the pending marker in place. Retry can acquire a new token and
  repeat cleanup. A process crash leaves the token held and requires an
  operator to verify external cleanup before clearing it. There is no timed
  takeover: an old request can resume after any timeout, and the same token
  column is also used by Auth identity edits and restores. Soft-delete routes
  set `billing_deletion_completed_at` only after account and Auth cleanup;
  restore requires that completion version and compares it again when
  activating the app row. Restore claims its own operation token before
  changing Auth, so a concurrent erase cannot cross that provider boundary.
  Unknown Auth or failed app activation leaves the token held for reconciliation.
- Admin irreversible erase records the erased-email tombstone, `deleted_at`,
  and scrubbed User/Profile identity before its first external Storage delete.
  The route captures known file paths before scrubbing and then scans the
  member-owned Storage prefixes. A Storage failure leaves the irreversible
  tombstone and pending marker for a retry; it does not make the account
  restorable. Storage cleanup must be confirmed before reporting completion.

### Reconciling a crash-held lifecycle token

Treat a non-null `billing_deletion_operation_id` or any row in
`member_external_effect_claims` as an active owner regardless of age. The User
column now belongs only to deletion, Auth identity edit and restore; Storage
notification and opted-in email owners are distinct rows. Query the exact member's rows with
`SELECT id, member_id, kind, status, reason, created_at, updated_at FROM
public.member_external_effect_claims WHERE member_id = '<User ID>';`. Only a
named operator handling an incident may clear a crash-held token or row.
Record the tenant, User ID, exact operation ID, kind/status/reason,
pending/completed/deleted
timestamps, request or deployment trace, actor, reason and evidence in the
incident and audit trail. Before any write:

1. Prove the original execution has ended and cannot resume or retry. Check
   deployment/function logs and any queued job for the exact request and token.
   If that cannot be proved, leave the token held. A timeout or old `updated_at`
   is insufficient.
2. Identify whether the User token belongs to deletion, an Auth identity edit
   or restore, or whether an external-effect row belongs to Storage, a
   member-subject notification, or an opted-in email send.
   Verify the exact Auth User ID through Supabase Admin; a 5xx/timeout is
   unknown, not absence. Check
   Storage cleanup, app tombstone, packet send state and any pending provider
   operation. Preserve the hold while any external outcome is uncertain.
3. Decide and record the route-specific repair. For deletion, keep
   `billing_deletion_pending_at` and the deleted tombstone in place; never
   reactivate an erased account or create a replacement Auth identity. Resolve
   an identity-edit or restore hold using that workflow's Auth/app comparison,
   not by treating it as a deletion. For an interrupted upload, prove the
   Storage request and any pointer transaction have ended; inspect the member
   prefix, attempted key and referencing profile/proof/application row before
   clearing its exact claim row. For an interrupted notification, reconcile its
   row and prove the local Web Push and Discord attempts have ended, with no
   retry that can resume, before clearing its exact claim row. Record any
   provider receipt available, but do not mistake an unknown delivery result
   for a still-running local request. A timeout or HTTP 5xx is not proof that
   a past notification was rejected. An interrupted email claim requires
   checking the exact Resend idempotency
   key and send log for a receipt or unresolved delivery before clearing it.
   An HTTP 408/409/5xx or network error does not establish non-delivery.
   For an interrupted admin erase, confirm
   the irreversible erased-email tombstone
   before clearing its token. If the
   worker stopped before that tombstone committed, stop and plan a guarded
   repair; clearing the token alone could reopen the original identity.
4. In one interactive database transaction, acquire the member lifecycle
   advisory lock, re-read the same tenant/User/exact token or claim row and
   verified state, write the audit receipt, and clear **only** that exact
   operation. Delete an external-effect row by both `id` and `member_id` only
   after provider and worker outcomes are proved. Leave deletion
   pending/completed timestamps unchanged. If the compare-and-set or row delete
   affects anything other than one row, stop and re-investigate. There is no
   age-based release or automated claim expiry.
   Read back the row and audit receipt before retrying the original operation.

Do not run a bulk age-based token reset or clear a hold merely to make a
deletion or restore endpoint succeed.
- Admin name, email and role edits take a temporary lifecycle hold before
  touching Supabase Auth or the app row. Unresolved sends block the edit;
  new claims are blocked until both identity stores are updated. If the Auth result
  is unknown, the hold stays in place for operator reconciliation. The
  30-day purge also claims a deletion owner, confirms Auth removal while the
  app's deleted tombstone still denies access, and then hard-deletes by that
  owner. Failed Auth confirmation leaves the tombstone for a later retry or
  reconciliation. Unfinished cleanup and unresolved student/counselor copies
  block the purge before any private child data is deleted.
- The member lifecycle lock needs a real interactive transaction. Signing,
  send claims, account deletion, restore and member merge fail closed where Prisma
  transactions are flattened (current Preview configuration); production must
  keep interactive transactions enabled. Ordinary invitation acceptance,
  counselor assignment and admin identity edits remain available on the
  isolated Preview database after its schema is migrated; they still check
  persisted deletion markers and unresolved sends. Authenticated Preview
  acceptance is blocked until the DEMO database is brought to the required
  migration level with its own backup, rehearsal and rollback plan. Do not
  apply the full migration backlog there solely to test this billing change.
  The 30-day account purge can detach the packet FK without holding unrelated
  private child records. The isolated PostgreSQL proof is
  `tests/migrations/training-billing-packet-grants.mjs`.
- **Policy to set before release:** retention duration and legal hold for the
  frozen signed packet/PDF, send evidence and archive audit; which authorized
  staff may release a crashed cleanup token; and how provider evidence is
  recorded before reconciling an uncertain send. A provider request already
  accepted cannot be recalled by account deletion.

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
  and supersede columns, and the `training_billing_packet_sends` table. RLS is
  enabled on both tables, and a guarded `REVOKE ALL` removes every privilege
  from `anon` / `authenticated` on both tables. This is a **pre-launch security
  fix** for the parent table: production had full grants including TRUNCATE,
  which RLS does not govern. Proof: `tests/migrations/training-billing-packet-grants.mjs`
  (database contract lane).
- `lib/billing/`: `providerIdentity.ts` (letterhead + env overrides),
  `providerOrg.ts`, `billableEnrollments.ts`, `packetSnapshot.ts`,
  `sendAttempts.ts`, `sendResultCopy.ts` (client-safe send result and banner copy),
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
