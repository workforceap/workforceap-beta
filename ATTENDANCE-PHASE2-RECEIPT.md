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
