# WAP-185 retained payload decision packet — 2026-10-11

Source baseline: `02021c314` (includes shipped privacy source fix #2768).
This is a source inventory and proposed ownership handoff, not a live database
measurement or authorization to delete records. No duration, configuration,
schema, historical payload or storage object is changed by this packet.

## Current retained payloads

| Record / source | Personal or sensitive payload | Current lifecycle / gap |
| --- | --- | --- |
| `Application`, `Profile`, `ApplyEligibilityScreening`, `PreScreeningResponse`, `PreScreeningDraft` in [schema](../../prisma/schema.prisma) | Application notes; contact, guardian and profile data; income/work-authorization/benefits answers; draft free text | Linked to the member, generally cascade on hard deletion. No age-based cleanup for active or abandoned member-linked applications. Drafts clear on submission. Account deletion is separate from application inactivity. |
| `PublicWioaScreening` | No-account screening answer JSON / qualification snapshot | Existing 180-day window by `createdAt`; no user FK to rely on for erasure. |
| `WorkflowDiagnostic`, [failure writer](../../lib/email/failureRecord.ts), [diagnostic writer](../../lib/diagnostics.ts) | Generic template params redact explicit personal keys. Typed email failures deliberately keep exact template params (recipient/name/program and any wrapper inputs); historic rows can retain raw address/subject. Summary, failure reason and other metadata are not universally prose-sanitized. | Default 90 days by `createdAt`; environment override. Cleanup copies email failure rows before deleting. Exact params power admin replay; removing them blindly breaks that contract. |
| `EmailFailureSnapshot`, [copy](../../lib/email/failureSnapshot.ts) | Verbatim diagnostic payload plus classification, hash/domain and original timestamp. Hash is a grouping identifier, not anonymous evidence. No subject FK. | 365 days by **snapshotAt**, not original failure time. A copy made at source expiry normally extends original-data residence beyond the diagnostic window. Historical catch-up can copy older failures. Existing duplicate copies are not renewed by insert; resend outcome can be mirrored. |
| `EmailSendLog`, `WebhookEvent`, `MemberEvent`, `PortalWorkflowEvent` | Recipient/provider context, event metadata and member identifiers depending on writer | Existing windows: 365, 90, 365, 90 days respectively by `createdAt`. These are distinct from failure replay records. |
| `AuditLog` | Actor email/role snapshot, target ID, action-specific metadata | 1096 days by `createdAt`; critical action prefixes currently share that window. Actor FK becomes null on deletion; snapshot survives. This code value does not certify a legal retention interpretation. |
| `AuditEvent`, `WioaReviewSnapshot` | xAPI-shaped statement, IP/UA; frozen member name/email, eligibility fields, notes and actor identity | Not in `RETENTION_TABLES`. Actor FK becomes null; WIOA subject IDs are plain columns so evidence survives erasure. Schema says WIOA rows are create-only; disposal requires a separate approved design. Do not infer the audit-log window applies here. |
| `BillingCase`, stage/recipient/send/delivery/payment/artifact/attestation/signature rows and private `billing-finance` storage | Frozen student/counselor/finance contacts, signed content/PDFs, signature assets, payment and delivery evidence, immutable historical subject IDs | Live member FK detaches on purge; finance evidence survives. No disposal TTL. [Billing guide](../BILLING-PACKETS.md#retention-erasure-and-merge) records archive visibility ownership and separately identifies unported disposal policy / unresolved-send deletion barrier. |
| `EnrollmentAgreementSubmission` and agreement PDFs | Subject name/id, all PDF revisions, hashes, uploader/reviewer identities and review notes | [Retention helper](../../lib/gdpr/enrollmentAgreementData.ts) detaches live member link; preserves revisions and snapshots. Persistent erasure/upload fence is independent of feature flag. Owner policy retains records but gives no deadline. |

Source cleanup authority is [configuration](../../lib/retention/config.ts) and
[cleanup](../../lib/retention/cleanup.ts). Soft-deleted accounts have an existing
30-day purge window with storage/document safeguards and blocked-reference
handling; it is not a 30-day finance, WIOA or agreement disposal policy.

## Decisions needed to implement the remaining work

Proposed accountable approver: Mike Brown / designated privacy and records owner,
with finance/grant-compliance review for signed, funded or WIOA evidence. These are
**proposed roles**, not newly assigned ownership or an assertion of legal advice.
Engineering owns implementation after the owner records the choice.

| Decision | Concrete choices to approve | Required inputs |
| --- | --- | --- |
| Failed-email replay vs evidence | A: keep current exact payload through existing windows; B: retain exact params only during the existing diagnostic replay window and make future snapshots evidence-only; C: keep a separate approved replay deadline, then reduce both records | Owner-selected deadline and clock (failure, resolution or copy); which template fields are essential; legal hold and unresolved-failure rules. Option B matches the current resend route, which reads diagnostics, but forfeits payload evidence after source purge. |
| Snapshot lifetime | A: preserve current 365 days from copy; B: base an owner-approved deadline on original diagnostic time; C: anchor to closure/resolution | Explicit effective date, historical-data assessment, exceptions. B can immediately expire older copied evidence and is not safe to silently roll out. |
| Abandoned member-linked applications / drafts | A: retain until member erasure; B: owner-defined inactivity period then minimize/delete eligible records | Definition of inactivity, admissions status exceptions, consent/notice, active enrollment/grant/hold protection; duration must be supplied by owner. Public-lead 180 days is not an authorization for these records. |
| AuditEvent / WIOA evidence | Separate owner-approved records schedule with closure trigger and hold overrides | Applicable grant/contract and immutable-record constraints; distinction between operational IP/UA and decision evidence. Do not apply `AuditLog` TTL by analogy. |
| Finance / agreement archives | Preserve until approved schedule; eventual coordinated DB + private-storage disposal with receipts | Per-class deadline/clock, accountable records owner, hold mechanism, resolved-send/payment conditions, export and subject-lookup requirements. Existing member unlink is not anonymization. |

Recommended next action: obtain a signed-off row per record class stating owner,
purpose, allowed fields, duration, clock, legal-hold exceptions, deletion method,
and historical-data disposition. Until that exists, preserve replay and immutable
evidence contracts; the shipped source minimization remains the bounded fix.
No additional safe source defect was established by this inventory.

## Aggregate-only measurement plan

[Read-only SQL](wap-185-retention-inventory.sql) counts retained records and
payload presence without selecting names, recipients, notes, answers, IDs or JSON
values. It uses a read-only repeatable-read transaction, statement timeout and
rollback. Run only through an authorized database-read lane; this packet did not
run it against production. Verify optional agreement/finance tables exist first
using its catalog query; skip queries for absent tables rather than creating them.
Small aggregates can still be sensitive: keep results in the restricted evidence
bundle, suppress small cells before sharing, and do not publish organization-level
or template-level slices. Counts are estimates of scope, not deletion candidates.
Configured diagnostic TTL is environment-specific; the SQL intentionally reports
age ranges rather than pretending the default is the live setting.

Once policy is approved, prepare a new read-only candidate report with the exact
approved cutoff, hold exclusions and retained-reference checks, plus a disposal
plan and rollback/receipt limits. Review that immutable report before authorizing
historical changes. Snapshot copy and account deletion jobs are mutating and are
not dry-run commands.
