# Workspace Email (`@workforceap.org`)

Optional `@workforceap.org` mailboxes for members and staff. Provisioning is
policy-dependent and runs through whatever mail host we contract with. The repo
contains only the **provider abstraction + admin hooks** — never real
credentials.

## What admins and members can do today

Admin → Members → member → Workspace email shows the saved address, if any.
Mailbox creation is not connected yet. The app disables provisioning and revocation,
and the API rejects both operations before changing member records. Existing saved
addresses are preserved, but they are not evidence that working mailboxes exist.

An email administrator must currently create the real mailbox with the organization's
email host and give the member its sign-in URL and invitation or temporary password
through an approved private channel. WorkforceAP portal credentials do not automatically
grant access to a mailbox. The app does not send mailbox access instructions today.

## Surfaces

- `lib/workspace-email/provider.ts` — `WorkspaceEmailProvider` interface,
  `NoopWorkspaceEmailProvider` stub, `getWorkspaceEmailProvider()` factory.
- `app/api/admin/members/[id]/workspace-email/route.ts` — admin-only `POST`
  (provision) and `DELETE` (revoke). Both write `AuditLog` entries
  (`workspace_email_provisioned` / `workspace_email_revoked`).
- `components/admin/AdminMemberWorkspaceEmail.tsx` — admin button surfaced on
  the member detail page.
- `User.workspaceEmail` and `User.workspaceEmailProvisioned` already exist on
  the schema; no migration needed.

## Providers

Selected via `WORKSPACE_EMAIL_PROVIDER` env var.

| Value       | Status            | Notes                                                          |
| ----------- | ----------------- | -------------------------------------------------------------- |
| `noop`      | Fixture stub only | Application factory rejects it; no mailbox or provisioning flag is created. |
| `google`    | Not implemented   | Wire up Google Workspace Admin SDK Directory API.              |
| `microsoft` | Not implemented   | Wire up Microsoft Graph user provisioning.                     |

`getWorkspaceEmailProvider()` throws a clear error for the stub and unimplemented providers
so the gap is obvious next time we want to ship a real one.

## Swapping `noop` to a real provider

1. Implement a new class against `WorkspaceEmailProvider` (e.g.
   `GoogleWorkspaceEmailProvider`) in `lib/workspace-email/`. It should call the
   real mail-host API in `provision` / `revoke` and translate failures into
   `{ success: false, error }`.
2. Add the case to `getWorkspaceEmailProvider()` so `WORKSPACE_EMAIL_PROVIDER`
   selects it.
3. Add the credentials as Vercel project env vars — never commit them.

### Required envs (when wiring real providers)

- `WORKSPACE_EMAIL_PROVIDER` — `noop` | `google` | `microsoft`.
- Google: `GOOGLE_WORKSPACE_CUSTOMER_ID`, `GOOGLE_WORKSPACE_ADMIN_SUBJECT`,
  `GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON` (JSON in env, not a file path).
- Microsoft: `MS_GRAPH_TENANT_ID`, `MS_GRAPH_CLIENT_ID`,
  `MS_GRAPH_CLIENT_SECRET`.

> **No secrets in the repo.** All credentials live in Vercel env. Local dev
> defaults to unavailable provisioning. Isolated fixtures may instantiate the stub directly.
