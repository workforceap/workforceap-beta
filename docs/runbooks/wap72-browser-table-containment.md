# WAP-72 browser-role table containment

Migration: `prisma/migrations/20260929120000_wap72_contain_browser_table_access/migration.sql`.
Drift check: `scripts/check-public-rls-grants.mjs` (query in `scripts/sql/public-rls-grant-drift.sql`).
Local proof: `tests/migrations/wap72-browser-table-containment.mjs` (database contract lane).

## What the migration does

The app reads and writes domain data through Prisma as the table owner. Browsers use
Supabase only for Auth, Storage and Realtime. The only browser table dependency is
Realtime `postgres_changes` on `public.messages` and `public.message_threads` as
`authenticated`.

For every `public` relation that no extension owns, the migration:

- enables row level security on tables and partitions, without FORCE (owner access is unchanged);
- makes `service_role`'s current privileges explicit grants;
- revokes all table, column and sequence privileges from `PUBLIC`, `anon` and
  `authenticated`, including TRUNCATE, REFERENCES and TRIGGER;
- restores only `authenticated` SELECT on the two messaging tables, plus the receipt-column
  UPDATE from `20260909224000` where it was effective;
- revokes default table and sequence grants to `PUBLIC`, `anon` and `authenticated` for the
  migration role, both globally and in `public`.

It stops and rolls back everything when a required role is missing, when the migration
role does not own a relation, when a messaging policy is missing, when `authenticated`
has no messaging SELECT to preserve, or when any browser privilege survives (for example,
through an inherited role). Routines, schema USAGE, the WIOA screening policy and storage
are out of scope; see WAP-12 / PR #2697.

## Drift check (database owner only)

This is for the database owner to run against a project they control. Agents and CI do
not run it against DEMO or production. It runs one catalog query inside
`BEGIN READ ONLY ... ROLLBACK`, reads no table rows and changes nothing. It prints
relation, role and privilege names only.

```sh
RLS_DRIFT_DATABASE_URL='postgresql://…' node scripts/check-public-rls-grants.mjs          # errors fail
RLS_DRIFT_DATABASE_URL='postgresql://…' node scripts/check-public-rls-grants.mjs --strict # warnings fail too
```

The SQL file can also be pasted into a read-only SQL session.

- `ERROR`: `rls_disabled`, `table_privilege`, `column_privilege`, `sequence_privilege`.
- `WARN`: `default_privilege`, meaning future tables or sequences created by that role
  would grant browser roles. Entries for a platform role such as `supabase_admin` cannot be
  changed by an app migration.
- Allowed by design: `authenticated` SELECT on the two messaging tables and UPDATE on the
  four `message_threads` receipt columns.

## Before any DEMO or production application

1. Run the drift check and keep its output with the change record.
2. Confirm the migration role owns every `public` relation. The migration fails otherwise.
3. Confirm the three messaging policies exist on `messages` and `message_threads`. DEMO
   has RLS off on both, so its policies may be missing. The migration fails otherwise.
4. Review `default_privilege` warnings for other creators (for example `supabase_admin`).
5. Rehearse on an isolated restore. Then verify: anonymous and signed-in Data API requests
   are denied, backend writes work, Auth, Storage and Realtime still work, and the five role
   portal paths still load.

Messaging policies use the app GUC identity (`app.current_user_id`), not the Supabase JWT.
Once RLS is on, Realtime deliveries to signed-in browsers may stop, as is likely already
the case in production. Verify chat before calling this safe.

Merging to `master` runs `prisma migrate deploy` against production. A failed
precondition fails that deploy without applying anything.
