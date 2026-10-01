import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { profilePhotoPrefixForUser } from '@/lib/portal/memberProfilePhoto';
import { claimEnrollmentAgreementErasure } from '@/lib/enrollmentAgreements/operationLock';

export const MEMBER_RESUME_BUCKET = 'member-resumes';
export const MEMBER_FILES_BUCKET = 'member-files';

/**
 * Prefixes a member's own uploads live under. Resume originals/enhanced
 * text and voice-interview recordings sit at `{userId}/…` in
 * `member-resumes`. Certificate proofs sit at `cert-files/{userId}/…` and
 * profile photos at `profile-photos/{userId}/…` and enrollment agreements at
 * `enrollment-agreements/{userId}/…` in `member-files`. Employer
 * logos and org branding are not member PII and are not deleted here.
 */
export const MEMBER_STORAGE_PREFIXES = [
  { bucket: MEMBER_RESUME_BUCKET, prefixFor: (userId: string) => userId },
  { bucket: MEMBER_FILES_BUCKET, prefixFor: (userId: string) => `cert-files/${userId}` },
  { bucket: MEMBER_FILES_BUCKET, prefixFor: (userId: string) => profilePhotoPrefixForUser(userId) },
  { bucket: MEMBER_FILES_BUCKET, prefixFor: (userId: string) => `enrollment-agreements/${userId}` },
] as const;

const LIST_PAGE = 100;
const REMOVE_BATCH = 100;

export type StorageListItem = {
  name: string;
  id?: string | null;
  metadata?: Record<string, unknown> | null;
};

type StorageBucketApi = {
  list: (
    path?: string,
    options?: { limit?: number; offset?: number },
  ) => Promise<{ data: StorageListItem[] | null; error: { message?: string } | null }>;
  remove: (
    paths: string[],
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

export type MemberStorageAdmin = {
  storage: { from: (bucket: string) => StorageBucketApi };
};

export type MemberStorageObject = { bucket: string; path: string };

export type DeleteUserStorageResult =
  | { ok: true; deleted: MemberStorageObject[] }
  | { ok: false; error: string; deleted: MemberStorageObject[] };

function isSafeUserId(userId: string): boolean {
  return Boolean(userId) && !userId.includes('/') && !userId.includes('\\') && !userId.includes('..');
}

function isNotFoundMessage(message: string | undefined): boolean {
  return /not found|does not exist|no such file|bucket not found/i.test(message ?? '');
}

function isFolder(item: StorageListItem): boolean {
  return item.id == null;
}

function normalizeObjectPath(path: string): string {
  return path.replace(/^\/+/, '').replace(/\/+/g, '/');
}

export function parseMemberStoragePath(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) {
    const match = trimmed.match(
      /\/storage\/v1\/object\/(?:public|sign|authenticated)\/(?:member-resumes|member-files)\/(.+?)(?:\?|$)/i,
    );
    return match?.[1] ? normalizeObjectPath(decodeURIComponent(match[1])) : null;
  }
  if (trimmed.includes('..')) return null;
  return normalizeObjectPath(trimmed);
}

export function isMemberOwnedStoragePath(
  userId: string,
  bucket: string,
  path: string,
): boolean {
  if (!isSafeUserId(userId) || !path || path.includes('\\') || path.includes('..')) return false;
  const normalized = normalizeObjectPath(path);
  if (bucket === MEMBER_RESUME_BUCKET) {
    return normalized.startsWith(`${userId}/`) && normalized.length > userId.length + 1;
  }
  if (bucket === MEMBER_FILES_BUCKET) {
    const certPrefix = `cert-files/${userId}/`;
    const photoPrefix = `${profilePhotoPrefixForUser(userId)}/`;
    const agreementPrefix = `enrollment-agreements/${userId}/`;
    if (normalized.startsWith(certPrefix) && normalized.length > certPrefix.length) return true;
    if (normalized.startsWith(agreementPrefix) && normalized.length > agreementPrefix.length) return true;
    return normalized.startsWith(photoPrefix) && normalized.length > photoPrefix.length;
  }
  return false;
}

async function listPrefix(
  api: StorageBucketApi,
  prefix: string,
): Promise<{ paths: string[]; error: string | null }> {
  const paths: string[] = [];
  const dirs = [prefix.replace(/\/+$/, '')];

  while (dirs.length > 0) {
    const dir = dirs.pop()!;
    let offset = 0;
    while (true) {
      const { data, error } = await api.list(dir, { limit: LIST_PAGE, offset });
      if (error) {
        if (isNotFoundMessage(error.message)) break;
        return { paths, error: error.message ?? 'Failed to list storage objects' };
      }
      const items = data ?? [];
      for (const item of items) {
        if (!item.name || item.name === '.' || item.name === '..') continue;
        const full = `${dir}/${item.name}`;
        if (isFolder(item)) {
          dirs.push(full);
        } else {
          paths.push(full);
        }
      }
      if (items.length < LIST_PAGE) break;
      offset += LIST_PAGE;
    }
  }

  return { paths, error: null };
}

async function removePaths(
  api: StorageBucketApi,
  paths: string[],
): Promise<{ deleted: string[]; error: string | null }> {
  const deleted: string[] = [];
  for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
    const batch = paths.slice(i, i + REMOVE_BATCH);
    const { error } = await api.remove(batch);
    if (error) {
      if (isNotFoundMessage(error.message)) {
        deleted.push(...batch);
        continue;
      }
      return { deleted, error: error.message ?? 'Failed to delete storage objects' };
    }
    deleted.push(...batch);
  }
  return { deleted, error: null };
}

/**
 * Delete every object a member uploaded to `member-resumes` /
 * `member-files`. Listing prefixes catches leftovers after columns are
 * nulled. Extra known paths (resume columns, cert proofs) are a safety
 * net for objects that listing might miss.
 *
 * Fail-closed: any list/remove error other than "not found" is a failure.
 * Callers must not claim the account was erased when `ok` is false.
 */
export async function deleteUserStorageObjects(
  userId: string,
  options?: {
    supabaseAdmin?: MemberStorageAdmin;
    extraPaths?: MemberStorageObject[];
    /** Dependency injection for tests; production always reserves the DB fence. */
    claimAgreementErasure?: (memberId: string) => Promise<void>;
  },
): Promise<DeleteUserStorageResult> {
  if (!isSafeUserId(userId)) {
    return { ok: false, error: 'Invalid user id for storage deletion', deleted: [] };
  }

  // Reserve erasure before even listing unrelated member files. Uploads claim
  // the same persistent fence before staging bytes, so no agreement can appear
  // after this deletion's storage listing. An existing erasure claim is safe
  // to retry; an active/uncertain upload blocks all deletion without a TTL.
  try {
    await (options?.claimAgreementErasure ?? claimEnrollmentAgreementErasure)(userId);
  } catch {
    return {
      ok: false,
      error: 'Enrollment agreement erasure could not be reserved. Retry after any upload finishes.',
      deleted: [],
    };
  }

  let admin: MemberStorageAdmin;
  try {
    admin = options?.supabaseAdmin ?? getSupabaseAdmin();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Storage admin client is not configured';
    return { ok: false, error: message, deleted: [] };
  }

  const byBucket = new Map<string, Set<string>>();
  const deleted: MemberStorageObject[] = [];

  for (const { bucket, prefixFor } of MEMBER_STORAGE_PREFIXES) {
    const listed = await listPrefix(admin.storage.from(bucket), prefixFor(userId));
    if (listed.error) {
      return { ok: false, error: `${bucket}: ${listed.error}`, deleted };
    }
    const set = byBucket.get(bucket) ?? new Set<string>();
    for (const path of listed.paths) set.add(path);
    byBucket.set(bucket, set);
  }

  for (const extra of options?.extraPaths ?? []) {
    const path = parseMemberStoragePath(extra.path);
    if (!path || !isMemberOwnedStoragePath(userId, extra.bucket, path)) continue;
    const set = byBucket.get(extra.bucket) ?? new Set<string>();
    set.add(path);
    byBucket.set(extra.bucket, set);
  }

  for (const [bucket, paths] of byBucket) {
    const unique = [...paths];
    if (unique.length === 0) continue;
    const removed = await removePaths(admin.storage.from(bucket), unique);
    deleted.push(...removed.deleted.map((path) => ({ bucket, path })));
    if (removed.error) {
      return { ok: false, error: `${bucket}: ${removed.error}`, deleted };
    }
  }

  return { ok: true, deleted };
}

export const ACCOUNT_STORAGE_DELETE_FAILED =
  'Stored files could not be deleted. Account was not erased. Please try again or contact support.';
