/**
 * Workspace email provider abstraction.
 *
 * Real provisioning of @workforceap.org mailboxes happens through whatever
 * mail host is configured (Google Workspace, Microsoft 365, etc.). This file
 * defines the interface that surface code (admin UI + API) calls and ships a
 * Noop stub so we can exercise the flow locally without real credentials.
 *
 * Selection happens via the `WORKSPACE_EMAIL_PROVIDER` env var. Real provider
 * implementations are intentionally unimplemented — see docs/WORKSPACE_EMAIL.md
 * for what's required to wire them up. No secrets in the repo.
 */

export type WorkspaceEmailProviderId = 'google' | 'microsoft' | 'noop';

export const WORKSPACE_EMAIL_DOMAIN = 'workforceap.org';

export type WorkspaceEmailUserRef = {
  id: string;
  email: string;
  fullName: string | null;
  workspaceEmail: string | null;
};

export type ProvisionInput = {
  user: WorkspaceEmailUserRef;
  /** Optional override for the local-part. Defaults to a slug derived from fullName/email. */
  requestedLocalPart?: string;
};

export type ProvisionResult = {
  workspaceEmail: string;
  success: boolean;
  /** Provider-supplied error message when success is false. */
  error?: string;
};

export type RevokeInput = {
  user: WorkspaceEmailUserRef;
};

export type RevokeResult = {
  success: boolean;
  error?: string;
};

export interface WorkspaceEmailProvider {
  readonly id: WorkspaceEmailProviderId;
  provision(input: ProvisionInput): Promise<ProvisionResult>;
  revoke(input: RevokeInput): Promise<RevokeResult>;
}

/**
 * Build a safe local-part from a requested value or the user's name/email.
 * Lowercases, strips non-[a-z0-9.-], collapses repeats, and trims separators.
 */
export function deriveLocalPart(input: ProvisionInput): string {
  const raw =
    input.requestedLocalPart ??
    (input.user.fullName ? input.user.fullName.replace(/\s+/g, '.') : input.user.email.split('@')[0] ?? input.user.id);

  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/^[.\-]+|[.\-]+$/g, '');

  return cleaned || `user.${input.user.id.slice(0, 8)}`;
}

/**
 * Stub provider: doesn't talk to any mail host. Logs the intended action and
 * returns a placeholder address so local development and tests work.
 */
export class NoopWorkspaceEmailProvider implements WorkspaceEmailProvider {
  readonly id = 'noop' as const;

  async provision(input: ProvisionInput): Promise<ProvisionResult> {
    const localPart = deriveLocalPart(input);
    const workspaceEmail = `${localPart}@${WORKSPACE_EMAIL_DOMAIN}`;
    console.log(
      `[workspace-email:noop] provision requested user=${input.user.id} -> ${workspaceEmail} (no real mailbox created)`,
    );
    return { workspaceEmail, success: true };
  }

  async revoke(input: RevokeInput): Promise<RevokeResult> {
    console.log(
      `[workspace-email:noop] revoke requested user=${input.user.id} previousEmail=${input.user.workspaceEmail ?? '(none)'}`,
    );
    return { success: true };
  }
}

function readProviderId(): WorkspaceEmailProviderId {
  const raw = (process.env.WORKSPACE_EMAIL_PROVIDER ?? 'noop').toLowerCase();
  if (raw === 'google' || raw === 'microsoft' || raw === 'noop') return raw;
  throw new Error(
    `Invalid WORKSPACE_EMAIL_PROVIDER: "${String(process.env.WORKSPACE_EMAIL_PROVIDER)}". ` +
    `Expected one of: google, microsoft, noop.`
  );
}

/**
 * Pick a real provider implementation from env. The local stub must never
 * mark a member's mailbox provisioned or revoked through the application.
 * Instantiate NoopWorkspaceEmailProvider directly in isolated fixtures only.
 */
/**
 * Non-throwing availability check so admin UIs can disable the provisioning
 * action (with the reason) instead of letting the POST fail after the fact.
 */
export function getWorkspaceEmailAvailability(): { available: boolean; reason?: string } {
  try {
    getWorkspaceEmailProvider();
    return { available: true };
  } catch (err) {
    return { available: false, reason: err instanceof Error ? err.message : 'Provider unavailable' };
  }
}

export function getWorkspaceEmailProvider(): WorkspaceEmailProvider {
  const id = readProviderId();
  switch (id) {
    case 'noop':
      throw new Error(
        'Mailbox creation is not connected. An email administrator must create the mailbox with the organization’s email provider and share its sign-in instructions.',
      );
    case 'google':
      throw new Error(
        'WORKSPACE_EMAIL_PROVIDER=google is not implemented. Wire up the Google Workspace Admin SDK Directory API and supply credentials via env (see docs/WORKSPACE_EMAIL.md).',
      );
    case 'microsoft':
      throw new Error(
        'WORKSPACE_EMAIL_PROVIDER=microsoft is not implemented. Wire up Microsoft Graph user provisioning and supply credentials via env (see docs/WORKSPACE_EMAIL.md).',
      );
    default: {
      const _exhaustive: never = id;
      throw new Error(`Unknown WORKSPACE_EMAIL_PROVIDER: ${String(_exhaustive)}`);
    }
  }
}
