export const PROFILE_PHOTO_BUCKET = 'member-files';
export const PROFILE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PROFILE_PHOTO_OUTPUT_SIZE = 400;
export const PROFILE_PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';

const PROFILE_PHOTO_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);

const PROFILE_PHOTO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export function profilePhotoStoragePath(userId: string, versionId?: string): string {
  return `profile-photos/${userId}/${versionId ? `photo-${versionId}.webp` : 'photo.webp'}`;
}

export function profilePhotoPrefixForUser(userId: string): string {
  return `profile-photos/${userId}`;
}

export function isProfilePhotoStoragePath(userId: string, path: string): boolean {
  if (!userId || userId.includes('/') || userId.includes('..')) return false;
  const normalized = path.replace(/^\/+/, '').replace(/\/+/g, '/');
  const prefix = `profile-photos/${userId}/`;
  return normalized.startsWith(prefix) && normalized.length > prefix.length;
}

export function resolveProfilePhotoContentType(fileName: string): string | null {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (!PROFILE_PHOTO_EXTENSIONS.has(ext)) return null;
  return PROFILE_PHOTO_MIME[ext] ?? null;
}

export function profilePhotoStorageErrorMessage(error: { message?: string } | null): string {
  const message = error?.message ?? '';
  if (/not found|does not exist|Bucket/i.test(message)) {
    return `Storage is not configured. Create the ${PROFILE_PHOTO_BUCKET} bucket in Supabase Storage.`;
  }
  return 'Failed to save profile photo';
}
