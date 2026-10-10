# Billing release reconciliation, 2026-10-10

The held combined-packet candidate [PR #2687](https://github.com/workforceap/workforceap-beta/pull/2687)
is superseded by the shipped two-stage J5 quote/voucher request and J6
invoice/voucher cover-letter implementation. Close it as superseded after
reviewing this evidence. Preserve its history; any useful lifecycle or email
hardening should be proposed independently against current source.

## Source and production alignment

Reviewed master and the latest READY production deployment share
`e170c47d6dd69498c64f8d47fa841d7a0c2067d5`. Deployment:
[dpl_3JGeXLvsFhFmtGYjZcvJAfjBoTC8](https://vercel.com/mabrown040-5207s-projects/workforceap-beta/3JGeXLvsFhFmtGYjZcvJAfjBoTC8).
This is a dated observation, not the permanent identity of production.

| Replacement | Verified disposition |
| --- | --- |
| [#2703](https://github.com/workforceap/workforceap-beta/pull/2703) | Merged 2026-09-28; combined-packet create/send mutations return `410 LEGACY_BILLING_FLOW_RETIRED` after authorization |
| [#2699](https://github.com/workforceap/workforceap-beta/pull/2699) | Merged 2026-09-29; separate immutable J5/J6 records, recipients, artifacts, claims and payment evidence |
| [#2700](https://github.com/workforceap/workforceap-beta/pull/2700) | Merged 2026-09-29; private finance bucket |
| [#2713](https://github.com/workforceap/workforceap-beta/pull/2713) | Merged 2026-09-29; APIs, admin workbench and approved-image signing; includes the #2706/#2707 work |
| [#2707](https://github.com/workforceap/workforceap-beta/pull/2707) | Closed without a separate merge; not an outstanding rollout step |
| [#2733](https://github.com/workforceap/workforceap-beta/pull/2733) | Current source includes six-month version 2 terms and mock review; signed historical artifacts remain unchanged |

The older candidate remains draft at `304f41594b7fc044d1dc8d2ee6bb3b8502754de7`.
Its historical CI passed, but a current `git merge-tree --write-tree` comparison
conflicts in 28 files, including the retired mutation routes, Prisma schema,
member deletion/restore, email, retention and billing documentation. None of its
five feature migrations is applied in production or DEMO; they are absent from
current master. Passing the old candidate's tests would not verify the shipped
architecture.

Production `_prisma_migrations` checksums match the current repository bytes for
all five billing migrations:

- `20260927224500_restrict_legacy_training_billing_packets`
- `20260927230000_billing_two_stage_j5_j6`
- `20260927232204_billing_finance_private_bucket`
- `20260928140000_billing_finance_bucket_signature_png`
- `20261006203708_billing_six_month_class_terms`

No current repository migration is pending in production, and no unresolved
failed migration row was found. Existing rolled-back historical rows are not
treated as unresolved failures. These checks read metadata and aggregate counts
only; no member identity, signature, recipient address or document bytes were
retrieved.

## Acceptance matrix

| Area | Current evidence | Remaining work |
| --- | --- | --- |
| Production schema | Five billing migration checksums match current source | Recheck after any later schema change |
| Database access | RLS on all 12 two-stage tables; browser roles have no table privileges; service-role CRUD except the deliberately SELECT-only designated-signer table | Verify application roles in controlled authenticated acceptance |
| Finance archive | SQL reports private `billing-finance`, 10 MiB, PDF/PNG only; no billing-specific browser Storage policy | Verify through the Storage API and authenticated exact-byte download; SQL alone is insufficient |
| Signing setup | Designated signer and active approved signature asset exist; an issued J5 is bound to its exact archived artifact | An existing signed row does not prove the full authenticated J5/J6 journey or current image readability |
| Production gates | Migration enabled; signer env key present; real email disabled | Keep delivery disabled until controlled test-recipient acceptance; sensitive signer config was not decrypted |
| Real delivery | No two-stage send claim/receipt found in production | J5: exactly one copy per student/counselor test role; J6: exactly one per finance/student/counselor role; confirm attachments, ledger and mailbox receipt |
| DEMO | No two-stage tables; 26 current repo migrations pending; no billing Preview gate keys configured | Establish an isolated, reviewed test schema with linked synthetic Auth/app users and a synthetic billable enrollment; use no production fallback |
| Deletion and retention | Current database proof preserves the finance archive when an account is purged | The unresolved-send deletion barrier and retention/disposal policy remain unported, as the current workflow guide states; assess current two-stage behavior in fresh scoped work |
| Recovery | No current isolated production restore was verified in this session | Record a recent restorable backup and isolated restore rehearsal before future destructive schema work; include Storage object recovery separately |

The old payer-edit checklist is not a prerequisite for merging a superseded
combined-packet design. Current two-stage terms and identity/signing rules are
documented in [the workflow guide](../BILLING-PACKETS.md). Retention/disposal
decisions and controlled recipient selection remain owner decisions; this
reconciliation does not invent either.

## Verification performed

- **133/133** cases in seven current API/UI Vitest suites passed, including
  role/tenant refusals, gated signing/sending, mock no-write behavior, J5/J6
  document review and billing UI states.
- **180/180** cases in 15 current billing Node suites passed: renderer/signature
  integrity, stages/holds, recipients, idempotent sends, webhook linkage,
  finance archive and tenant-scoping contracts.
- **45/45** checkpoints in `tests/migrations/billing-two-stage-j5-j6.mjs`
  passed on isolated local PostgreSQL **17.11**, including six-month v2 terms,
  v1 compatibility, grants, signed immutability, erasure retention and
  two-session races. Production uses PostgreSQL 17; the existing CI database
  lane remains PostgreSQL 16.
- Three additional current migration proofs passed: legacy browser-role
  lockdown, private finance bucket and signature PNG allowance, including
  idempotent re-runs and fail-closed misconfiguration cases.

The local fixtures use fictional identities and fake Storage/email ports.
They do not provide a real Supabase Auth session, live mailbox receipt or a
production-backup restore. No new billable project, remote database write,
production packet, real signature action or email was performed.

Relevant executable proofs are checked into the repository:
`tests/migrations/billing-two-stage-j5-j6.mjs`,
`tests/migrations/restrict-legacy-training-billing-packets.mjs`,
`tests/migrations/billing-finance-private-bucket.mjs`,
`tests/migrations/billing-finance-bucket-signature-png.mjs`,
`tests/api/billing-two-stage-routes.spec.ts`, and
`lib/billing/twoStage/**/*.test.ts`. The database proof launchers reject remote
targets. Use the normal PostgreSQL database-contract lane for a repeatable
fixture run; do not apply `db push` to production or use it as a recovery method.
