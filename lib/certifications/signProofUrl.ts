import { isAttendanceStoragePath } from '@/lib/attendance/storageKey';

export const CERT_PROOF_BUCKET = 'member-files';
const PROOF_URL_TTL_SECONDS = 3600;

interface SigningClient {
  storage: {
    from(bucket: string): {
      createSignedUrl(path: string, expiresIn: number): Promise<{ data: { signedUrl?: string } | null }>;
    };
  };
}

/**
 * Signs a stored certification proof path with the service-role client.
 * `proofUrl` is database-provided, so the helper must never be a confused
 * deputy for another feature's private objects: any attendance/ path is
 * refused (no signing call is made).
 */
export async function signCertificationProofUrl(
  supabase: SigningClient,
  proofPath: string | null | undefined,
): Promise<string | undefined> {
  const path = proofPath?.trim();
  if (!path) return undefined;
  if (isAttendanceStoragePath(path)) {
    console.error('[certifications] refused to sign an attendance/ path');
    return undefined;
  }
  const { data } = await supabase.storage.from(CERT_PROOF_BUCKET).createSignedUrl(path, PROOF_URL_TTL_SECONDS);
  return data?.signedUrl ?? undefined;
}
