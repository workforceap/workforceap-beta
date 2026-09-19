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

Supply four independently generated secrets through your secret store or local
environment: `PORTAL_QA_MEMBER_PASSWORD`, `PORTAL_QA_PARTNER_PASSWORD`,
`PORTAL_QA_EMPLOYER_PASSWORD`, and `PORTAL_QA_ADMIN_PASSWORD`. Each must have at
least 24 characters, and all four must differ. The script has no password
default and never prints the supplied values. Do not commit them or put them
in command-line arguments. The corresponding login names remain
`member-test@workforceap.org`, `partner-test@workforceap.org`,
`employer-test@workforceap.org`, and `admin-test@workforceap.org`.

Run the existing `db:sync-test-auth` script only after target review. Preflight
rejects existing fixture rows or Auth accounts and rejects an incomplete Auth
inventory. All Prisma fixture writes share one transaction. Supabase Auth
creation is a separate service and cannot participate in that transaction; a
failure can therefore leave newly created Auth accounts. The script reports
only their exact IDs for inspection and stops. Recovery or removal of those
specific IDs needs its own reviewed operation; no automatic email-based purge
or password reset is performed.

Existing accounts created by earlier versions require a separate inventory
and credential rotation/disable decision. This source change is not evidence
that any live credential has changed.
