# Student enrollment agreements

## Scope and rollout status

This feature collects a private agreement for each active member account and records a separate Admin review. It does **not** sign a document, authenticate a typed signature, activate an enrollment, approve funding, change billing, issue points, send mail, or block access to training.

Collection and review are held behind server-only `ENROLLMENT_AGREEMENTS_ENABLED=true`. Keep it unset until the release gates below pass. Authorized Admin archive access and account-deletion safeguards are independent of that flag. A green unit suite or local UI fixture is not authenticated preview acceptance.

Mike selected retention after student account deletion. Every committed agreement revision and its exact PDF bytes remain as organization records, including earlier verified revisions and submissions awaiting review or needing correction. Those unverified states do not establish that a PDF is unsigned. No retention duration or automatic disposal policy has been set; this implementation has no automatic agreement expiry and makes no signature-authenticity or legal-protection guarantee.

The supplied agreement states six months; existing J5/J6 policy uses five months. This change deliberately leaves that unresolved policy decision, existing signed records, program assignments and J5/J6 calculations untouched. Earlier signed agreements may be uploaded and reviewed as `previous`; nobody is forced to sign again just to populate the portal.

## Where to use it

- Member: **My documents** (`/dashboard/documents`), above the existing billing packets.
- Admin: student record → **Program**; upload on the student's behalf, download revisions, verify or request a correction.
- Assigned counselor: student record → **Training**, read-only.
- Admin: **Students → Enrollment agreements** (`/admin/enrollment-agreements`), with status counts and paginated coverage for the actor's organization. Counts are active member accounts, not applications or a claim about students absent from the portal.
- Admin: **Agreement archive** (`/admin/enrollment-agreements/archive`), available even when collection is disabled. Search the saved student name or original account ID across all revisions, 50 per page. Download retained documents directly without restoring or opening a deleted account. The archive has no upload, review or delete controls.

| Status | Meaning |
| --- | --- |
| Missing | No current submission exists after a successful authorized read. |
| Awaiting review | PDF stored; staff have not verified it. |
| Verified | An authorized Admin reviewed this specific current revision and attested to required information and both signatures. Not legal identity verification. |
| Needs correction | Admin supplied a student-visible explanation; uploading a replacement starts a fresh review. |
| Unavailable | Request/schema/storage failure. Never shown as Missing or Verified. |

## Exact template

`assets/enrollment/workforceap-enrollment-2026.pdf` is the original four-page file, unchanged:

- Version identifier: `2026-09-30` (application version label, not a funding-approval date).
- SHA-256: `dee5087ba4503c3d38dfb10c8e149a630f5c8b72e3c9d8a045a306737afff3a5`.
- 2,828,533 bytes.
- Authenticated attachment download: `GET /api/enrollment-agreements/template`.

The form contains JavaScript and typed-text signature fields, not cryptographic signature fields. Adobe Acrobat Reader is needed for the form's intended linked-field/Finalize behavior. Its Finalize button opens an email draft; it does not upload to this portal or prove delivery. Students save a completed PDF and upload it explicitly. The server does not execute PDF JavaScript or alter the original bytes.

Upload validation rejects unknown scripts, external/launch actions, XFA, action chains and embedded attachments. Only the original template's exact decoded script hashes in their original field/event or document-script contexts are allowed. Two original provenance-only C2PA/JUMBF blobs are narrowly allowed by exact content hash, size, MIME metadata and catalog association; that is not general attachment support. A different interactive form must be saved as a static PDF before upload. Validation is bounded structural and active-content screening, not a malware-safety or signature-validity guarantee. Do not open untrusted active content outside a controlled viewer.

## Data and authorization

`EnrollmentAgreementSubmission` stores organization and immutable original-subject IDs, the saved account-name label, a nullable live-member link, immutable private path, content hash/size, form version, uploader, review metadata and current-revision marker. Historical uploader/reviewer IDs survive deletion of those actors' accounts. Account deletion detaches the live-member link; it does not delete or reassign the evidence. It deliberately stores no extracted SSN, date of birth, address or original filename. The saved account name is a search label, not verified legal identity. Review notes are student-visible and must not contain sensitive identifiers.

- Bucket: existing private `member-files`; prefix `enrollment-agreements/{subjectMemberId}/{submissionId}.pdf`. The original subject ID continues to validate the exact path after the live account is deleted. Existing PDFs are not moved, rewritten or re-signed.
- Upload cap: 4,128,768 bytes; one PDF, nonempty, structurally parseable, no encrypted input. Parser runs in a bounded worker.
- Private-bucket preflight, no public URL, no signed bearer URL.
- Server-authenticated attachment downloads validate subject access, exact path, size and SHA-256 and set no-store/nosniff/sandbox headers.
- Self member or same-org Admin may upload; assigned same-org counselor may read; only same-org Admin other than the subject may review. Employers/partners are not agreement subjects or reviewers.
- Archive listing/download is restricted to same-org Admins with the existing staff MFA policy. It does not depend on a live student account or a counselor assignment. Retention does not grant a new account access to a former account's documents.
- Each replacement creates new bytes and a new row; previous versions remain historical. Current/pending compare-and-set prevents a stale review from approving a replacement. The UI shows the latest 50 revisions; member JSON export includes all metadata revisions.
- No PDF or extracted content enters AI, analytics, notifications, Sentry payloads or knowledge-base indexing.
- Every API handler enforces the existing staff MFA policy using the persisted database role. Member self-service remains available without imposing staff-only MFA on students; user-editable metadata and portal selection cannot bypass staff assurance.
- Upload/review outcomes record bounded IDs and actions through the existing platform audit log, without PDF bytes, object paths or review-note content. These secondary audit writes are monitored but cannot undo an already committed revision. Staff PDF delivery requires a successful access-audit write before returning bytes. Audit records follow the existing platform audit lifecycle, not a new retention promise.

The migrations add a partial unique current-row index, ownership/status/hash/size constraints, immutable-evidence guards, RLS, and a restrictive Storage policy denying browser access to this prefix even when a broader bucket policy exists. The retention change preserves original subject/actor IDs, allows only live-link detachment and prevents deletion or reassignment of retained evidence. New-table grants and guard-function execution are revoked from `PUBLIC`, `anon`, `authenticated`, and `service_role`, including role-specific default grants. Prisma's owner connection is the data path; server Storage service-role access remains intact.

## Upload versus account deletion

`EnrollmentAgreementOperationLock` is a persistent per-member operation fence spanning database and object storage. Upload/review acquires it before external storage or review writes. The shared account-storage eraser claims an `erasure` fence before listing or deleting **any** personal member object. This state describes account deletion, not agreement destruction: committed agreement PDFs are excluded from account-storage deletion, including extra supplied paths. If an upload is active, deletion returns a retryable failure without touching storage. Deletion retries may reuse the erasure state; new uploads cannot.

There is no expiry or automatic forced unlock. An ambiguous commit, storage failure or failed compensation retains the fence. This intentionally favors recoverable blocked work over an orphaned sensitive PDF or deletion of committed evidence.

Support recovery requires an authorized operator to:

1. Confirm the precise member, organization, fence token/state and that no request remains in flight.
2. Reconcile all subject revision rows against exact private object paths, byte lengths and hashes. Check whether the last database operation committed; do not infer failure from an HTTP timeout.
3. Preserve every committed PDF. Resolve only proven staged orphan objects under the exact subject prefix, with appropriate deletion authority.
4. For an upload fence only, clear the exact matching token **after** reconciliation. Do not age-expire it or clear another request's token.
5. For an erasure fence, retry the authorized account-deletion workflow while preserving all committed agreement evidence; do not reopen uploads merely to clear an error.
6. For an `account_restore` fence, reconcile the exact Auth identity, application deletion state and request outcome under support authority. Standard Restore remains blocked while that fence is retained, even if Auth appears active. This runbook does not authorize removing it: support must establish the committed outcome and obtain a reviewed recovery procedure before any corrective mutation. No automatic expiry, forced unlock or guessed Auth re-ban is provided. Only a definitively successful native activation transaction releases its own exact restore token.

Member export/deletion is independent of the UI flag. Confirmed absent tables are pre-migration no-ops; real query errors and partial schema are failures. Member JSON export includes every subject revision's metadata. Shared anonymization and Admin member-erasure/delete paths retain the PDFs, hashes, saved subject identity and review evidence, detaching only the live-member link. Resume, profile-photo and certificate-file cleanup continues under its existing policy. Existing billing archives, enrollment assignments and billing history are unchanged. Generic super-admin user suspension remains reversible and serializes against document operations without claiming erasure.

Admin **member deletion**, member self-deletion and GDPR deletion are different from reversible user suspension: they claim erasure and remove personal files while retaining agreement evidence. With the agreement schema installed, their retained erasure fence makes standard Admin Restore return 409, even while the deleted account row remains visible during account retention. The account-retention window is not an agreement-disposal or recovery window; neither erased personal files nor anonymized profile fields are restored. Admins retrieve retained agreements through the archive. Do not clear an erasure fence to make the Restore button succeed.

With the schema installed, Admin restore claims a persistent `account_restore` fence before any Auth unban. A retained upload/erasure/restore fence blocks it before Auth. Its final activation requires native READ COMMITTED transactions, a locked tenant user row and exact token ownership. Provider or database uncertainty retains the fence for support; no blind Auth compensation occurs. Confirmed absence of both new tables keeps the pre-migration restore behavior; installed-schema flattened environments fail closed.

Before every installed-schema 30-day account purge, including an initially docless subject, the job claims an erasure fence while checking the original deletion cutoff under the user lock. An in-flight restore/upload blocks it. For subjects with agreement/fence evidence, it reruns authorized personal-storage cleanup before removing the account; agreement paths remain excluded. Storage failure preserves the pending lifecycle state. Final deletion atomically rechecks the cutoff and deletes only the still-eligible account and its self-service audit rows. Retained agreement evidence survives through its nullable live-member relation and immutable subject IDs. The foreign-key fallback also locks/rechecks eligibility before anonymizing and refuses flattened transactions. A completed erasure fence is safely retried, not force-unlocked; only a successful user cascade removes it.

## Member merge protection

Member merges never transfer agreement evidence automatically. Either account having agreement history or an operation fence blocks the merge with staff guidance. The execution check runs after the existing sorted user-row locks, using native READ COMMITTED transactions. When the new schema is installed, flattened preview transactions or unsupported isolation fail closed. Confirmed absence of both new tables preserves the existing pre-migration merge behavior; partial schema is an error. Resolving a blocked merge requires an explicit document-ownership decision, not deleting evidence to bypass the guard.

## Release gates — not yet satisfied by source tests

1. The owner selected retention after account deletion; verify this implementation preserves every committed revision and exact PDF, including signed-but-unreviewed submissions. No automatic expiry is configured; a future retention duration/disposition policy remains a separate decision. Use the existing disposable PostgreSQL 16 CI lane for SQL proofs; separately name the preview-only Supabase environment and release owner. Verify backups/current migration state; never reset production or replay historical migrations blindly.
2. Before invoking Prisma, run `scripts/enrollment-agreements-storage-preflight.sql` against that approved target as the exact deployment role, with SQL errors fatal. This read-only preflight rejects missing Storage/browser roles, disabled Storage RLS and insufficient policy-management authority with a clear error before Prisma can record a failed migration. Authority may come from ownership/superuser status or hosted Supabase's loaded Supautils library with its registered reload-only `supautils.policy_grants` explicitly authorizing the current role for `storage.objects`; arbitrary custom settings are not accepted. It cannot guarantee future lock availability; schedule the actual migration appropriately and retain its bounded lock timeout. Then apply the additive migration there. If policy authority is missing, use the approved Supabase policy-management procedure. Do not remove the policy or auto-resolve a failed migration to get a green build. A connector-role preflight does not prove a different deployment connection has the same authority.
3. Execute real PostgreSQL tests for current-row uniqueness, immutable fields, stale review/replacement, two concurrent uploads, upload-versus-account-deletion in both orders, upload-versus-member-merge in both orders, and retained-fence reconciliation. Prove account/actor deletion preserves revision counts, subject attribution, review evidence and hashes; reject retained-record deletion and reassignment. Mocked Prisma tests do not prove these SQL semantics.
4. Verify anonymous/authenticated browser Storage and Data API access is denied for the new prefix/tables, and service-role Data API table access is also denied despite BYPASSRLS. Verify Prisma-backed routes and service-role Storage operations work and unrelated bucket prefixes still work.
5. On the existing project's green preview, enable only the preview flag. Use synthetic member/Admin/assigned-and-unassigned-counselor/cross-org accounts to complete download → upload → review → correction → replacement → download history → export → account deletion → Admin archive retrieval. Verify historical verified revisions and pending/correction revisions survive unchanged, archive downloads require audit success, unauthorized/cross-org retrieval is denied, and archive access works with collection disabled. Check mobile and desktop, including real PDF downloads and worker packaging.
6. Obtain explicit production migration/enablement authority and sign-off on retaining the document's current terms. Deploy only after the preview receipts. Do not merge this migration-bearing branch simply because the default-off UI seems harmless: the production build can run migrations.

For gate 2, first configure `psql` for the explicitly approved preview database and exact deployment role, then run from the repository root (no credentials belong in this command or its output):

```sh
psql -X -v ON_ERROR_STOP=1 -f scripts/enrollment-agreements-storage-preflight.sql
```

Stop on any nonzero exit. Do not rely on a default/local/production connection, switch targets, or continue to Prisma after a failed preflight.

Rollback for collection/review trouble: unset the feature flag; preserve schema, bytes, authorized archive access and account-deletion safeguards. Never drop the tables or delete agreement records as an automatic rollback.

## Verification

Focused behavioral suites cover role/tenant access, parser and private downloads, current-revision review, upload compensation/fence retention, feature gating, member switching, duplicate clicks, coverage and archive search/pagination, locales, export and account-deletion retention. Run with the repository's pinned Node 22 and generated Prisma client:

```powershell
pnpm exec vitest run tests/api/enrollment-agreements.spec.ts tests/api/enrollment-agreement-files.spec.ts tests/components/enrollment-agreement-card.spec.tsx tests/components/enrollment-agreement-coverage.spec.tsx tests/components/enrollment-agreement-archive.spec.tsx tests/components/enrollment-agreement-archive-pages.spec.tsx tests/components/enrollment-agreement-i18n.spec.ts tests/gdpr/enrollment-agreement-data.spec.ts tests/gdpr/enrollment-agreement-export.spec.ts
node --require ./tests/server-only-stub.cjs --import tsx --test lib/gdpr/deleteUserStorage.test.ts lib/member/exportData.test.ts lib/nav/portalNav.test.ts lib/tenant/scopeProxy.test.ts
pnpm typecheck
```

`tests/migrations/enrollment-agreements.mjs` is automatically discovered by the existing database-contract CI lane. It accepts only a localhost `wap_shadow` launcher, creates a dedicated proof database (refusing an existing one), executes the read-only preflight as owner and denied `anon`, applies the exact migration, and exercises the application's extracted parameterized SQL. Concurrent claims use observed PostgreSQL lock waits as barriers. It covers immutable evidence, current-row uniqueness, stale reviews, replacement rollback, upload/erasure/restore ordering, cutoff rechecks, atomic purge rollback, safe token release and table/Storage-prefix denial despite broad preexisting policies/default grants, including BYPASSRLS service-role denial. Its Storage table is synthetic: passing this proof does not establish hosted bucket privacy, Supabase migration-role privileges or authenticated UI acceptance.

Hosts without local PostgreSQL can run `node tests/migrations/enrollment-agreements.mjs --check-templates` to check extraction and parameter bindings only; that is explicitly not a database pass. The real lane invokes the script without that option. The synthetic resume-acceptance cleanup CLI uses the same fence with its validated demo database client and the existing server-only preload; it does not fall back to an ambient application database.

Also run existing account-erasure and student-detail-tab regression suites. Global locale completeness already has unrelated French/Portuguese gaps; this feature's namespace is present in all four catalogs.
