# J6 review-check release (migration 20261112044500)

Scope: draft PR #2915 only. This file is the release procedure. It does not
authorize the release. One writer runs it, and the lead (default) coordinates.
A timeout means stop. Do not kill a session, do not retry, and do not
`migrate resolve`.

The migration opens its own transaction and sets `lock_timeout` 3s and
`statement_timeout` 30s with `SET LOCAL`. Prisma 5.22 `migrate deploy` does
not wrap the file, so the file has to. Both settings end at `COMMIT` and do
not leak into the deploy session. `DROP`/`ADD CONSTRAINT` takes
`ACCESS EXCLUSIVE`. If the lock is not free within 3s, Postgres raises
`55P03`, the transaction rolls back, and the old constraint stays.

## Before release

1. Confirm this checkout is the only migration writer. No second deploy, no
   second `prisma migrate`, no manual `psql` writer.
2. Run a fresh read-only check on the production direct connection, in one
   `READ ONLY` transaction with a statement timeout. Record, do not print
   credentials:
   - sessions that are `idle in transaction`, or active longer than a few
     seconds, and any lock on `billing_stage_records`;
   - `pg_get_constraintdef` of `billing_stage_records_review_check` still
     matches `20260927230000`, and the constraint is validated;
   - zero rows violate the new predicate;
   - `_prisma_migrations` has no row for
     `20261112044500_billing_j6_review_notes_do_not_block_signing`, and no
     unfinished row (`finished_at` and `rolled_back_at` both null).
3. If any blocker, long transaction, or lock is present, stop and reschedule.
   Do not terminate the other session.

## Release

4. The lead merges the reviewed head. Production applies the migration through
   `build:vercel` -> `build:with-migrate` -> `scripts/safe-migrate.cjs` ->
   `prisma migrate deploy`. Plain `npm run build` does not migrate.
5. A lock or statement timeout fails the deploy and leaves the old constraint.
   Stop. Do not kill the holder, do not rerun the build to retry, and do not
   mark the migration applied or rolled back until the database state is read.

## After release

6. Read back, still read-only: the ledger row for `20261112044500` is
   finished, its checksum matches `git show <released-sha>:prisma/migrations/20261112044500_billing_j6_review_notes_do_not_block_signing/migration.sql`,
   and the live constraint is the new validated definition (no `signed`/`sent`
   clause).
7. Confirm the deployment is the released commit. A failed Next.js build does
   not undo the DDL, and a green build does not prove the migration ran.
8. The designated signer, not an agent, signs one real J6 that has a recorded
   difference and no clearance fields, and confirms the signed PDF. A synthetic
   proof is not that signature. Do not sign a real student's document from
   this runbook, and do not delete archived PDFs.

## Rollback

Default: roll the app back and leave the new constraint. It is weaker and
compatible with every row the old constraint accepted.

Restore the old check only as a separate owner decision, and only after a
read-only count proves no `signed` or `sent` row has `review_required` with
`review_cleared_at` null. If any such row exists, restoring the old check
fails and is the wrong rollback.

## Recovery

Backup and PITR were not confirmed for this release. The last authorized
receipt (`graph/evidence/deps-production-backups-run_20260909_1730.txt`,
2026-09-09) showed daily backups with PITR disabled, and it is stale. The
2026-11-12 recheck found no usable management token: the Supabase connector
returned 403 on `LIST_ALL_PROJECTS` and `LIST_BACKUPS`, no
`SUPABASE_ACCESS_TOKEN` is set, and `npx supabase projects list` has no saved
session. No backup was created and no restore was run. Do not release until a
current backup is read back and its timestamp and PITR state are recorded.
