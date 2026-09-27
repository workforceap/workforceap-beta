# Anonymous public database access containment

This additive migration is a preparatory WAP-12 anonymous-access step. It revokes
`anon` and `PUBLIC` access to existing `public` tables, column grants,
sequences, and routines. It removes the unrestricted public WIOA insert policy,
preserves existing authenticated messaging `SELECT` and effective
authenticated/service-role routine execution, and pins three trigger search
paths. It does not enable RLS on every table, change signed-in authorization,
or alter a live database until the release is separately approved. **It is not
complete DEMO containment:** a read-only 2026-09-27 catalog check found
`authenticated` CRUD grants on the same 98 RLS-off DEMO tables, including
`roles`, `user_roles`, and chat tables. A signed-in account may still reach them
through the Data API. Disable the DEMO Data API or restore reviewed RLS and
least-privilege grants before treating the role/data exposure as contained.

The database-contract CI lane runs `tests/rls/anonymous-db-access.mjs` against a
dedicated disposable PostgreSQL database. The proof covers actual denied
operations, inherited-grant atomic rollback, future objects created by
`postgres`, retained messaging/service/storage access, and repeat application.
It does not prove Supabase Data API or Realtime behavior in a deployed project.

Before any DEMO or production application, capture the current object and
default ACLs, RLS/policy definitions, routine owners, and migration history;
compare those with the migration's assumptions. In particular, inspect
`supabase_admin` default privileges. This app migration only changes defaults
for the application `postgres` creator, so another creator may still grant
`anon` access to future objects. Its `postgres` **global** routine default
change also affects future objects outside `public`; inventory cross-schema
consumers and creators. Revoking `PUBLIC` can remove inherited access for roles
other than `anon`, even when their direct grants are unchanged; inventory
effective table, column, sequence, and routine privileges for those roles.
Confirm the three trigger functions and both
messaging tables exist and that authenticated messaging has `SELECT` before
running the migration. Review other roles that may rely on `PUBLIC` routine
execution; the migration preserves `authenticated` and `service_role` only.

After a staged application, verify anonymous Data API reads, writes and RPCs
are denied; verify a signed-in account cannot access role/message tables until
the separate Data API or RLS containment is in place; backend WIOA submissions
still persist; signed-in member/staff
messaging subscriptions still deliver; service-role paths still work; and new
objects created through every relevant database creator remain closed. Do not
mark the containment complete from a successful migration or local proof alone.
