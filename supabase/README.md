# Supabase migration history

Prisma is the application migration path. Its historical files and
`_prisma_migrations` checksums are independent of the Supabase GitHub app's
`supabase_migrations.schema_migrations` history. This directory reconciliation
does not alter Prisma history or deploy new database changes.

## Existing-production reconciliation, 2026-10-11

The Supabase Preview check on the existing default `main` branch mapped to
GitHub `master` failed because 30 applied remote versions were absent locally.
The same failure preceded the October 11 application release. A read-only
production ledger export at **03:20:32 UTC** recovered 36 versions, each with
one stored SQL statement.

- Thirty missing files now contain the exact stored statement bytes. This
  recovers authoritative applied SQL, not original pre-splitting file bytes or
  comments that the ledger did not retain.
- The six existing matching-version files remain byte-for-byte unchanged.
  Their stored statements differ only by an additional trailing `;` and LF in
  the retained source files.
- Four original files representing three remote-absent versions are preserved
  byte-for-byte under [history/unapplied](history/unapplied). They are excluded
  from the active migration directory, including the duplicate
  `20260510020512` pair. Recovering only the missing files would expose these
  previously unapplied versions to the pending-migration step.

[The recovery manifest](history/recovery-20261011.json) records filenames,
versions, stored-statement hashes, retained/recovered file hashes and archived
original hashes. The manifest digest is pinned in
[the history guard](../scripts/check-supabase-history.mjs), which runs in local
prepush and CI's shared static gates. The guard permits unique later versions;
there is no automatic manifest-refresh mode.

```bash
node scripts/check-supabase-history.mjs
node --test scripts/check-supabase-history.test.cjs
# Compare only against an authorized read-only ledger export: an array of
# version strings/objects, or an object with a rows array. No connection needed.
node scripts/check-supabase-history.mjs --remote-versions /private/captured-ledger.json
```

The observed source set contains 36 unique active versions: zero remote-only,
zero pending local versions and zero duplicate versions. A disposable local
PostgreSQL 17.11 fixture reproduced this comparison against the captured ledger
and executed zero migration SQL. It also preserved its synthetic sentinel.
This is a no-op history-alignment proof, not an actual provider deployment.

## Why the original local-only SQL is archived

The remote-absent versions are `20260413183000`, `20260510020512` and
`20260610000000`. Read-only metadata at **03:22:45 UTC** found all five tables
targeted by the old RLS file already had RLS enabled; their current policy names
differ from the archived policy definitions. Both `course_progress` integer
columns already exist with non-null/default-zero contracts, and the
`member-files` bucket is already private. Its authoritative applied Supabase
version is `20260610033949`.

These observations justify retaining the old SQL for review without
automatically replaying it. They do not certify that every historical policy
matches current policy intent. Do not reactivate these files or rename them
into new active versions as a shortcut.

## Replay and provider acceptance limits

Bare replay into an empty disposable database still fails in
`20260329212535_add_funding_source_workspace_email.sql`: it alters
`course_enrollments` and `users` without creating them. The fixture reproduced
PostgreSQL `42P01` for `course_enrollments` and verified transaction rollback.
The later 35 files were not executed. No bootstrap, baseline or remote history
marker was invented to hide this failure.

Current [Supabase GitHub integration documentation](https://supabase.com/docs/guides/deployment/branching/github-integration)
distinguishes new branches built from committed migrations from production
deployments that apply only new migrations. This repair targets the observed
existing-production ledger comparison. A complete native reset/replay or a
migration-built fresh GitHub preview still needs a separately verified
application-schema/security baseline. A custom ORM workflow that waits for
Supabase Preview success does not supply prerequisites to its earlier failing
migration step.

The available connector exposes no GitHub integration-settings reader or
configuration mutation capability. Automatic branching, Supabase-changes-only
and Deploy-to-production settings were not verified. A `supabase/**` change
may trigger a new preview even when earlier application-only PRs did not.
Record the actual candidate check's branch/project target, then verify the
merged `master` native check on its exact SHA and confirm its ledger still has
zero pending source versions. Do not report the native check repaired before
that provider receipt exists.

No production SQL, migration tracking records, role grants, integration settings,
branch provisioning/reset or application data were changed during recovery.
Follow [database recovery](../docs/DATABASE-RECOVERY.md) for existing-database
preflight and the separate baseline/restore requirements.
