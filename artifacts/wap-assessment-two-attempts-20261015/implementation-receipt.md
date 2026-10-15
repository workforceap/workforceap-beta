# WAP-305 implementation receipt

Prepared 2026-10-15 in `codex/assessment-two-attempts-20261015`, based on
`30afca15acf2b12acf758ba64b38fdbeef450724`. This receipt describes an uncommitted
implementation handoff; it does not claim deployment or authenticated acceptance.

Students receive two completed chances: the initial preassessment and one final
attempt authorized by an admin or an assigned counselor. The shared action uses
the existing confirmation dialog, states used/available chances, and reports
pending/exhausted states. Admin and counselor routes preserve their role,
assignment and organization boundaries. The obsolete member self-reset URL now
returns 403 after authentication.

Three additive User fields store completed count, staff authorization timestamp
and durable prior results. Granting the retake uses one tenant-filtered SQL
statement, so the archive and pending authorization commit together even in
preview's flattened transaction mode. The last official result and completion
flag stay on file. Student home and assessment pages show the final-attempt
prompt. Form submissions carry the authorization timestamp; stale requests and
concurrent duplicates cannot consume another chance or emit duplicate effects.
Progress storage is keyed by student and attempt, and the form remounts when that
identity changes. Retake authorization sends no email.

The migration imports available reset diagnostics, deduplicates dated attempts,
retains undated evidence, and preserves raw legacy metadata. It recognizes old
staff authorization and requires staff after an old member self-reset. Exhausted
legacy cleared records recover their latest known result instead of requiring
an impossible third attempt. Already-purged diagnostic rows cannot establish
older counts; backfill is limited to available evidence. New histories live on
User outside diagnostic retention and appear in staff/member score recaps and
comprehensive member exports. Account merges combine known attempts and histories
without reopening an exhausted record. A database trigger protects the three
fields from anon/authenticated Data API writes despite broad inherited grants.

Validation completed:

- 134 tests passed across eight focused suites, including nine real PostgreSQL
  16 migration/concurrency/guard cases, route authorization and stale tokens,
  rendered student prompts, device progress isolation, actual shared confirmation
  dialog behavior, and member merge history/count cases.
- TypeScript typecheck and ESLint for changed/new TypeScript files passed.
- Migration timestamp/history guards, source-text-test guard and diff whitespace
  checks passed. The SQL migration is imported as an executable fixture and
  exercised against PostgreSQL; tests do not assert on source strings.
- Knowledge-base generation and validation passed, including 8,103 local links.
  The generated index remains ignored.
- The existing database-contract CI job now runs the PostgreSQL fixture suite
  against its localhost service. A normal unit invocation skips that suite
  without its explicit localhost-only fixture URL.
- Disposable fixtures create/drop a unique schema in the dedicated localhost
  fixture database. No real student record or outbound email was modified.

The full focused transcript is local `focused-verification.log` beside this
receipt (ignored by the repository's general log rule). The parent release lane
owns fresh fetch/prepush, final KB verification, commit/PR/merge and deployment
verification. Keep the additive columns/history when rolling back application
code; deleting them would discard retained results. Database preflight follows
`docs/DATABASE-RECOVERY.md`.

Final validation follow-ups:

- The linked student notice now stacks its action below the copy at narrow
  widths, using a scoped CSS module and the Banner's named theme hook. Desktop
  layout is unchanged; refreshed 375px/desktop screenshot geometry passed the
  visual review. Component ESLint and staged whitespace checks passed.
- Broader prepush surfaced six older counselor-page test mocks without router
  context, because the real retake control now renders independently of an
  answer sheet. The fixtures now provide router context and explicit attempt
  state. All 26 tests across those six suites pass, including a new rendered
  legacy-reset regression with an enabled real action and retained history.
  Details are in local `counselor-fixture-verification.log` beside this receipt.

Timestamp precision follow-up:

The retake writer now uses `CURRENT_TIMESTAMP(3)` for both the pending database
value and archived `requestedAt`. This matches the column's millisecond precision
and preserves the authorization-to-archive identity used by account merging.
A deterministic PostgreSQL fixture pins `.073969` while preserving the actual
writer's precision declaration: the old writer failed with JSON parsed as `.073`
and the column rounded to `.074`; the corrected writer passes. A merge regression
retains the undated archived result's one remaining chance after that rounding.
All 47 PostgreSQL/merge tests, typecheck and scoped ESLint passed. Local before and
after transcripts are `timestamp-precision-before.log` and
`timestamp-precision-after.log`. No reader normalization or deployed-data rewrite
was introduced because these fields have not been released.
