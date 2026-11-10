# Attendance Phase 2 — partial implementation / security gate

2026-11-09 Eastern. Owner Lin; acceptance Ada after independent Rigel review. NOT complete, accepted, integrated, deployed, or production-ready.

## Isolation
Checkout `/home/claw/lin-wap-attendance-20261109`, branch `lin/attendance-sheets`, exact base `a6eebc575374c0bbd7ed19343a17a70cf9264d39`. Canonical spec revision `3d22dc42-3c83-4597-8a36-58ad0e1e922a` reread. Ledger found no other attendance writer in known inventory, not comprehensive private-workspace verification. No existing attendance implementation checkout observed. Harness/#2893 untouched. Node 22.22.2; pnpm 10.34.3. Frozen offline install, lifecycle scripts disabled; manifests/lock unchanged.

## Changed
- `lib/attendance/evidence.ts`: Chicago dates/calendar; explicit yearly enrollment start month; canonical hash; provenance validation; source dedup; unknown distinct from zero; estimate separation; P >=240 verified minutes once/day; independent W/CR/A; conflicts rejected.
- `lib/attendance/evidence.test.ts`: 10 focused regression tests.
- `lib/attendance/pdf.ts`: draft-only weekly/monthly/yearly renderer. Unapproved/fidelity-unverified notices; monthly adapted draft; no invented time bounds/signatures. Long fields wrapped by measured font width. Unsupported standard-font glyphs become `?` (remaining fidelity gap).
- `lib/attendance/pdf.test.ts`: 12 actual render/reopen tests across three formats and normal/long-name/missing/partial synthetic profiles.

## Actual checks
- `pnpm install --offline --frozen-lockfile --ignore-scripts`: pass. Log `/home/claw/lin-attendance-install-20261109.log`.
- `ATTENDANCE_FIXTURE_DIR=/home/claw/lin-wap-attendance-pdfs-20261109 node --import tsx --test lib/attendance/evidence.test.ts lib/attendance/pdf.test.ts`: 22 passed, zero failed. Log `/home/claw/lin-wap-attendance-tests-20261109.log`.
- `pnpm exec eslint lib/attendance/*.ts`: pass.
- `pnpm exec tsc --noEmit --skipLibCheck --target ES2022 --module commonjs --moduleResolution node --esModuleInterop lib/attendance/evidence.ts lib/attendance/pdf.ts lib/attendance/evidence.test.ts lib/attendance/pdf.test.ts`: pass.
- `git diff --check`: pass, but new files untracked at that time; compiler/linter read actual files.

Test wrapper summary variables printed blank, but TAP explicitly reports 22/22 and command exit 0. Earlier tooling discovery exited 1 because postgres/initdb were not on PATH, not a test failure. Docker/psql present; no DB/daemon contacted. First write failed because directory absent; created directory then verified files through tests. Later successful new-file write responses carried pre-write missing-file stderr; actual contents verified by compiler/tests.

## Artifacts
`/home/claw/lin-wap-attendance-pdfs-20261109/{weekly,monthly,yearly}-{normal,long-names,missing,partial}.pdf` (12). Local synthetic drafts, not authenticated app downloads. PDF reopen checks structure/title/page dimensions, NOT visual print acceptance. No screen mounted: Works on Off; shell works. No screenshot/390px check.

## Product-security gate / smallest reversible remedy
`lib/enrollmentAgreements/storage.ts` provides private member-files preflight, immutable upload and digest/size checks. `prisma/migrations/20261001200042_enrollment_agreement_submissions/migration.sql:83-95` documents broad member-files Storage policy and adds RESTRICTIVE server-only protection ONLY for `enrollment-agreements/%`. Supabase bucket creation SQL only makes bucket private. This does not prove JWT storage clients cannot bypass endpoint scope for a new attendance prefix.

No live policy query performed: compatibility/verification gate, NOT proven live exploit. Assignment forbids shared bucket policy changes. No borrowing enrollment-agreements paths or billing authorization. Ada must authorize a separately reviewed attendance-only restrictive prefix migration with isolated synthetic verification, or identify an already-protected compatible archive with evidence. No attendance storage/API exposed pending resolution. Recovery owner Ada.

## Undone
Persistence/schema/migrations; tenant/admin/member endpoint matrix; admin entry/import; immutable/supersession transactions; student attestation then configured-instructor signing; protected POST/idempotency/replay/concurrency; upload/digest/cleanup failure tests; send-disabled adapter; integrated UI/private delivery; Windows preview; visual mobile/print; original template comparison; full repo checks; independent review. Stand-alone modules are NOT substituted for integrated completion.

No live config/schema changes, emails, student-data reads, merge/deploy, spending or private provider calls. Undo: revert isolated feature commit; synthetic PDFs/logs remain at external paths. No service started.

## Continuation 36001f1e — 2026-11-09 10:42 Eastern

This continuation supersedes the earlier Undone list only where explicitly stated below. Still NOT complete, operational, accepted or production-ready. Parent 8fb1182cdab4a2ee760302b7f065d0814864a278, unchanged base a6eebc575374c0bbd7ed19343a17a70cf9264d39; same sole writer/checkout/branch. Final head is the commit containing this receipt (resolve `git log -1 --format=%H -- ATTENDANCE-PHASE2-RECEIPT.md`). No push or PR created.

### Implemented and executed
- `workflow.ts`: scoped student/admin domain authorization; strict whole-batch dated admin input parser with server verifier; mapped cumulative/point-source DTO adapters which never invent daily hours; composed draft creation/hash/render. Detached snapshot binds scope/full evidence content and proposed rule/timezone/template versions.
- Student-first/configured-instructor pure transition planner validates explicit POST/consent/hash/revision and instructor decisions; replay against new state rejected. This reducer is NOT an executed signing operation, not transaction concurrency proof, and creates no signature/archive. Real protected facade always refuses finalize/student-attest/request-sign/sign/archived-download. No caller-provided boolean/env capability exists. Invitation adapter always send-disabled.
- Rigel-reported corrections: sparse arrays/unsupported extra/symbol/accessor/nonenumerable properties rejected in canonicalization; timestamp calendar components checked before Date normalization; supported years deliberately bounded 1900–2100, reporting/academic period overflow rejected; snapshot contains full evidence digest/revision and configuration versions; P240 visibly proposed/unapproved; academicLabel length <=64; whitespace normalized before glyph fallback; continued-page participant and column headers repeated.
- PDF tests now extract text from actual rendered bytes across 12 original synthetic variants, asserting participant/program/dates/actual+estimated+unknowns/notices/counts/subtotal/coverage/full hash and continued-page headers. Original template/visual fidelity remains unverified.
- `docs/attendance/storage-remedy-proposal.md`: exact unapplied attendance-only restrictive policy, complete source-discovered bucket consumer audit including privileged signing-path risk, synthetic SQL+Storage isolation test plan, prerequisite/readback and safe rollback conditions. Not in migration directories, never executed.
- `docs/attendance/integration-contract.md`: proposed persistence model/transaction design, UI contract for future Pixel ownership, every unimplemented integration item explicitly bounded by concrete dependency. No Prisma/table schema change.

### Actual checks and logs
- `node --import tsx --test lib/attendance/*.test.ts`: 38 pass, 0 fail/skip. `/home/claw/attendance-continuation-tests.log`, final audit 9dd18d9e86d9.
- `pnpm exec eslint lib/attendance/*.ts`: pass.
- `pnpm exec tsc --strict --noEmit --skipLibCheck --target ES2022 --module commonjs --moduleResolution node --esModuleInterop lib/attendance/*.ts`: pass (audit be0045696e12).
- `node scripts/verify-no-source-text-tests.mjs`: pass, zero new source-text tests.
- Python byte comparison against parent: package.json, pnpm-lock.yaml, prisma/schema.prisma unchanged. Lock SHA-256 d03ef8e7abc09818fd78bab9d0ba53a676d512f7b2cb5fac2f2b70f5a96e537f.
- Diff whitespace checked before and after staging; final check tied to committed tree in return report.
- Automation readback: no attendance automation; both unrelated #2893 one-time follow-ups already disabled, nextRunAt=null; left unchanged.

### Honest failure disclosures
Initial non-strict stand-alone compile inferred Zod properties optional because strictNullChecks was absent; strict project-compatible scoped compile passes. Later added test used union-tuple spread rejected by compiler; corrected indexed args, strict rerun passes. One shell correction attempt failed before execution because relay interpolated backticks; replaced with literal external Python file and executed successfully. New-file write responses contained misleading pre-write ENOENT stderr; real files verified by tests/compiler/staging. No DB/provider/config side effects from these failures. External backed-up scripts at `/home/claw/attendance-rigel-fixes.py`, `/home/claw/attendance-add-review-tests.py`; backups `/home/claw/attendance-pre-rigel-fixes` and named before-test copies.

### Not functioning / remaining gates
No HTTP controller, DB repository, persisted admin import, schema/migration, atomic idempotency/concurrency, archive adapter, real signature, email, signed artifact or authenticated download; no UI. Storage policy review and service-role photo/cert path consumer audit/hardening needed before archive enablement. Persistence/route auth/audit/origin/rate-limit integration remains independent unimplemented work, not implied complete by storage gate. Model/transaction designs are reviewable contracts only. Real DB/Storage isolation, upload cleanup/ambiguous outcome/checksum injection, live auth matrix, original templates, institutional rule/retention approval, actual-hours provider source, full repo Node/Vitest/typecheck/build and visual 390px/print checks unrun. No screen mounted (Works on Off). No live data/config/policy/DB operations, emails, marketing/harness work, #2893 edits, push/merge/deploy/spend.

Undo: revert this continuation commit (no migration rollback required); external test logs/scripts/backups remain evidence. Do not drop proposed protection once any attendance object exists. Independent review of new head pending Rigel; Ada owns acceptance/recovery. No self-acceptance.

## Increment 60a4ce2b — 2026-11-09 assignment continuation

Parent head 2aeb0e2adfbc080c62a176f6a9b8290ba93aeaaa. NOT complete, accepted, deployed, or production-ready. LOCAL synthetic demo only; non-durable.

Implemented: measured PDF header wrap (pdf.ts, pdf-layout.test.ts); instructor decisions retained in transition output (workflow.ts, signing-events.test.ts); repository + in-memory synthetic adapter + import/preview flow (synthetic-*); dev-only route/page gated by ATTENDANCE_SYNTHETIC_DEMO=local and non-production NODE_ENV/VERCEL_ENV; draft-only DDL in docs/attendance/draft-schema.sql (unapplied); trust-boundary tests in synthetic-flow.test.ts.

Functioning (synthetic): admin import, preview PDF base64, demo page when flag set. Disabled: finalize, attest, request-signature, sign, download-archive (fail-closed / 503).

Local preview startup: cd checkout; ATTENDANCE_SYNTHETIC_DEMO=local npx next dev --port 4180; open /dev/attendance-synthetic on 127.0.0.1:4180.

Checks this increment: 68/68 attendance unit tests; scoped eslint; no project tsc errors in attendance/dev paths; verify-no-source-text-tests pass. Full-repo npm test/build not claimed. No push. Receipt head = commit containing this file.
