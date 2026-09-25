import type { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { User } from '@supabase/supabase-js';

/** Server-authored evidence for a later Auth-only provisioning policy. */
export type ProvisionIntent = {
  role: 'member' | 'admin' | 'super_admin' | 'case_manager' | 'partner' | 'employer' | 'counselor';
  organizationId: string;
  source:
    | 'admin_user_create'
    | 'admin_member_create'
    | 'admin_partner_invite'
    | 'coursera_reconcile'
    | 'counselor_walk_in'
    | 'employer_signup'
    | 'partner_signup'
    | 'invitation_accept';
};

export function provisionIntentAppMetadata(intent: ProvisionIntent) {
  const organizationId = intent.organizationId.trim();
  if (!organizationId) throw new Error('Provision intent requires an organization');

  return {
    wap_provision_intent: {
      version: 1,
      role: intent.role,
      organization_id: organizationId,
      source: intent.source,
    },
  } as const;
}

type Admin = ReturnType<typeof getSupabaseAdmin>;
type InviteResult = Awaited<ReturnType<Admin['auth']['admin']['inviteUserByEmail']>>;

/**
 * Invites have no app_metadata option. Stamp only the user returned by a
 * successful invite, never an ID recovered from a duplicate-email error.
 * This is preparatory evidence; a provider update failure must not change
 * the existing invite or account-recovery flow.
 */
export async function stampNewInviteProvisionIntent(
  admin: Admin,
  invite: InviteResult,
  intent: ProvisionIntent,
): Promise<boolean> {
  const user = !invite.error ? invite.data.user : null;
  if (!user?.id) return false;

  return stampNewAuthUserProvisionIntent(admin, user, intent);
}

/** Call only for a user just created by this request, never a duplicate lookup. */
export async function stampNewAuthUserProvisionIntent(
  admin: Admin,
  user: Pick<User, 'id' | 'app_metadata'>,
  intent: ProvisionIntent,
): Promise<boolean> {
  try {
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      app_metadata: {
        ...user.app_metadata,
        ...provisionIntentAppMetadata(intent),
      },
    });
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('[provisionIntent] Could not stamp newly invited Auth user', error);
    return false;
  }
}
