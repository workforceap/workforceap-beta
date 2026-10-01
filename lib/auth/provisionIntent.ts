import type { getSupabaseAdmin } from '@/lib/supabase-admin';

/** Server-authored evidence for a later Auth-only provisioning policy. */
export type ProvisionIntent = {
  role: 'member' | 'admin' | 'super_admin' | 'case_manager' | 'partner' | 'employer' | 'counselor';
  organizationId: string;
  source:
    | 'admin_user_create'
    | 'admin_member_create'
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
type CreateResult = Awaited<ReturnType<Admin['auth']['admin']['createUser']>>;

/**
 * A successful invite can return an existing unconfirmed Auth user. Only a
 * successful createUser response proves this request created the identity.
 * Post-create stamping is preparatory evidence; a provider update failure
 * must not change the existing signup or account-recovery flow.
 */
export async function stampCreatedAuthUserProvisionIntent(
  admin: Admin,
  created: CreateResult,
  intent: ProvisionIntent,
): Promise<boolean> {
  const user = !created.error ? created.data.user : null;
  if (!user?.id) return false;
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
    console.error('[provisionIntent] Could not stamp newly created Auth user', error);
    return false;
  }
}
