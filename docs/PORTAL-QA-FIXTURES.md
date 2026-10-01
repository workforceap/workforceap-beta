# Portal QA fixture provisioning

`scripts/sync-portal-test-auth.ts` creates fresh fixtures only in the approved
Supabase demo project. It never resets passwords, deletes rows, or replaces
existing users. Do not run it against production. Source changes to this script
do not rotate or disable any existing QA account.

Before a separately authorized run, provision a dedicated fixture organization
whose slug starts with `portal-qa-`. Supply its exact ID and slug as
`PORTAL_QA_ORGANIZATION_ID` and `PORTAL_QA_ORGANIZATION_SLUG`, and explicitly set
`PORTAL_QA_TARGET=demo`. The script requires the live ID, slug and active state
to match. It does not use the default WorkforceAP organization or attach fixture
users to a real partner.

Configure `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and the
effective `POSTGRES_PRISMA_URL` (or `DATABASE_URL`) for that demo project.
If `POSTGRES_URL_NON_POOLING` is set, it must identify the same demo project.
The target guard runs before creating clients or making database/Auth calls.
The script also checks required DEMO schema columns before creating any Auth
account. If this check fails, reconcile the DEMO schema and migration history
first. Do not run a blanket `prisma migrate deploy` against a drifted DEMO
database or bypass the check to seed accounts.

Supply five independently generated secrets through your secret store or local
environment: `PORTAL_QA_MEMBER_PASSWORD`, `PORTAL_QA_PARTNER_PASSWORD`,
`PORTAL_QA_EMPLOYER_PASSWORD`, `PORTAL_QA_ADMIN_PASSWORD`, and
`PORTAL_QA_COUNSELOR_PASSWORD`. Each must have at least 24 characters, and all
five must differ. The script has no password default and never prints the
supplied values. Do not commit them or put them in command-line arguments.
The corresponding login names remain
`member-test@workforceap.org`, `partner-test@workforceap.org`,
`employer-test@workforceap.org`, `admin-test@workforceap.org`, and
`counselor-test@workforceap.org`.

The isolated Preview and hub smoke workflows read these test credentials from
`PREVIEW_E2E_<ROLE>_EMAIL` and `PREVIEW_E2E_<ROLE>_PASSWORD` GitHub Actions
secrets. Keep the existing unprefixed `E2E_*` secrets for the separate
production canary; do not overwrite them with DEMO credentials.

The counselor account receives a `counselor` role row, a matching profile role,
and an active `wap_staff` counselor record in the same Prisma transaction as the
other fixtures. It has no partner affiliation or member assignment. All five
application user IDs are the IDs returned by Supabase Auth, and every user and
related partner/employer fixture belongs to the approved `portal-qa-*`
organization. Before a credentialed audit, verify those IDs and roles with
read-only inventory in the demo project; never substitute a production identity
or reuse one account for multiple roles.

Run the existing `db:sync-test-auth` script only after target review. Preflight
rejects existing fixture rows or Auth accounts, including the counselor, and
rejects an incomplete Auth inventory. All Prisma fixture writes share one
transaction. Supabase Auth creation is a separate service and cannot
participate in that transaction; a failure can therefore leave newly created
Auth accounts. The script reports
only their exact IDs for inspection and stops. Recovery or removal of those
specific IDs needs its own reviewed operation; no automatic email-based purge
or password reset is performed.

Existing accounts created by earlier versions require a separate inventory
and credential rotation/disable decision. This source change is not evidence
that any live credential has changed.
