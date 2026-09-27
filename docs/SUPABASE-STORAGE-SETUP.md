# Supabase Storage setup

Employer logo uploads use a dedicated public bucket so company logos can appear in the employer portal header and on member-facing job cards.

## `employer-logos` bucket

1. Open the [Supabase Dashboard](https://supabase.com/dashboard) → your project → **Storage**.
2. Create a new bucket named exactly: **`employer-logos`**.
3. Set the bucket to **Public** so logo URLs returned by the app (`getPublicUrl`) work without signed URLs for viewers.
4. **Policies (recommended):** allow authenticated users to upload only under paths they own. The app uploads to `{employerId}/logo.{ext}` using the server-side service role; adjust policies if you later allow direct browser uploads with the anon key.
5. Public object URL shape:

   `{SUPABASE_URL}/storage/v1/object/public/employer-logos/{employerId}/logo.png`

If the bucket is missing, `POST /api/employer/logo` returns a 500 with a message to create the bucket.

## `organization-branding` bucket

Admin **Organization settings** can upload a tenant logo (`POST /api/admin/organization/logo`).

1. Create a public bucket named **`organization-branding`** (same steps as above).
2. Objects are stored at `{organizationId}/logo.{ext}`.

If the bucket is missing, the API returns 500 with instructions to create it.

## Realtime (member ↔ counselor chat)

Chat uses **Supabase Realtime** `postgres_changes` on `messages` and `message_threads`. After migrations, add both tables to the publication if they are not already included:

> **Warning — check RLS and grants before publishing.** Do not run these statements against a project where any of `messages`, `message_threads`, `users`, or the role/org tables (`organizations`, `roles`, `user_roles`) has RLS disabled, grants `anon`/`authenticated` `SELECT` without policies that limit each user to their own threads and organization, or lets `anon`/`authenticated` write `users` or the role/org tables.
>
> Realtime Postgres Changes does not go through the Data API, so disabling the Data API does not prevent streaming. For INSERT and UPDATE events it checks the subscriber's role (its `SELECT` privilege and, where RLS is enabled, the table's policies). DELETE events are handled separately: they are not RLS-filtered, and with RLS enabled `payload.old` contains only the primary key even under `REPLICA IDENTITY FULL` ([Supabase docs](https://supabase.com/docs/guides/realtime/postgres-changes)). If a table with RLS off is published and `anon` or `authenticated` holds `SELECT` on it, that role (any holder of the project's browser (anon) key, or any signed-in user) may be able to stream its changes, and `REPLICA IDENTITY FULL` (`prisma/migrations/20260329120000_member_counselor_chat/migration.sql:69-70`) can expose fuller row images through that stream, subject to Realtime/RLS behavior.
>
> The role/org tables are listed because access decisions rely on them: the chat policies do not read them directly, but their admin branches trust `app.current_role`, which the app derives (with its own admin checks) from `user_roles`/`roles` (`lib/auth/roles.ts:36-111`). If a browser role can write those tables, it can change values the server uses in these access checks.
>
> `users` is listed separately because org scoping and the admin helpers read `users.organization_id` (`prisma/migrations/20260909224000_member_message_current_assignment/migration.sql:15-32`, `prisma/migrations/20260616050000_fix_force_rls_recursion_is_admin/migration.sql:41-44`); check it on its own, since its RLS and policy state can differ from the other tables.
>
> **Unverified design risk:** the chat policies identify the caller via `app.current_*` session settings, which the server sets inside Prisma transactions (`lib/db/prisma.ts:40-44`). Nothing in the repo sets them for a browser Realtime subscriber, so with RLS on, those policies may deny chat events to browser subscribers. Loosening policies without a verified JWT-based design could reopen the exposure.
>
> Before publishing, confirm read-only and record the results:
> - `select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relname in ('messages', 'message_threads', 'users', 'organizations', 'roles', 'user_roles');` (expect `true` for all six)
> - `select tablename, policyname, roles, cmd from pg_policies where schemaname = 'public' and tablename in ('messages', 'message_threads', 'users', 'organizations', 'roles', 'user_roles');`
> - **Acceptance check** (effective privileges, including via `PUBLIC`, role membership and column grants): `select r.role, t.tbl, has_table_privilege(r.role, 'public.' || t.tbl, 'INSERT') as ins, has_table_privilege(r.role, 'public.' || t.tbl, 'UPDATE') as upd, has_table_privilege(r.role, 'public.' || t.tbl, 'DELETE') as del, has_any_column_privilege(r.role, 'public.' || t.tbl, 'INSERT') as col_ins, has_any_column_privilege(r.role, 'public.' || t.tbl, 'UPDATE') as col_upd from (values ('anon'), ('authenticated')) r(role) cross join (values ('users'), ('organizations'), ('roles'), ('user_roles')) t(tbl);` (expect every column `false`)
> - `select table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type in ('INSERT', 'UPDATE', 'DELETE') and table_name in ('messages', 'message_threads', 'users', 'organizations', 'roles', 'user_roles');` (informational only; omits access via `PUBLIC`, role membership and column grants, see [PostgreSQL docs](https://www.postgresql.org/docs/current/infoschema-role-table-grants.html))

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE message_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
```

See also comments in `supabase/policies.sql`.
