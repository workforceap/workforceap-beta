import { randomUUID } from 'node:crypto';

export type ResumeProfilePathField = 'resumeOriginalPath' | 'resumeEnhancedPath';

export type ResumeProfilePaths = Partial<
  Record<ResumeProfilePathField, string | null>
>;

export interface ResumeObjectUpload {
  field: ResumeProfilePathField;
  extension: string;
  contentType: string;
  /**
   * Binary payloads cross this boundary as a byte view, never as a bare
   * `ArrayBuffer`.
   *
   * Supabase Storage accepts either, but an `ArrayBuffer` boundary forces every
   * producer to surrender a whole backing store, and the obvious way to get one
   * from bytes already in hand is `view.buffer` — which uploads the entire
   * allocation rather than the view. For a pooled Node `Buffer` that is
   * unrelated adjacent heap memory, so the failure is silent and leaks bytes
   * instead of erroring. A `Uint8Array` carries its own offset and length, so it
   * can only ever transmit the bytes it describes. `Buffer` extends
   * `Uint8Array`, so Buffer-producing callers satisfy this unchanged.
   */
  body: Uint8Array | string;
}

interface StorageResult {
  error: unknown | null;
}

export interface AtomicResumeObjectSwapOptions {
  userId: string;
  uploads: readonly ResumeObjectUpload[];
  /** Profile pointers to clear in the same CAS as the staged uploads. */
  clearFields?: readonly ResumeProfilePathField[];
  uploadObject(
    path: string,
    body: ResumeObjectUpload['body'],
    options: { upsert: false; contentType: string },
  ): Promise<StorageResult>;
  removeObjects(paths: string[]): Promise<StorageResult>;
  /**
   * Atomically update the supplied profile fields and return their prior values.
   * The callback should perform its read and upsert in one database transaction.
   */
  swapProfilePaths(nextPaths: ResumeProfilePaths): Promise<ResumeProfilePaths>;
  /** An unknown DB commit must retain the staged key for reconciliation. */
  isPersistenceOutcomeUnknown?(error: unknown): boolean;
  makeVersionId?: () => string;
  onCleanupError?: (error: unknown, paths: readonly string[]) => void;
}

interface ResumeObjectCleanupOptions {
  paths: readonly string[];
  removeObjects(paths: string[]): Promise<StorageResult>;
  attempts?: number;
  onCleanupError?: (error: unknown, paths: readonly string[]) => void;
}

/** Retry best-effort storage cleanup and surface a terminal orphan for alerting. */
export async function removeResumeObjectsWithRetry(
  options: ResumeObjectCleanupOptions,
): Promise<boolean> {
  const paths = [...new Set(options.paths)];
  if (paths.length === 0) return true;

  let lastError: unknown = null;
  const attempts = Math.max(1, options.attempts ?? 3);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const { error } = await options.removeObjects(paths);
      if (!error) return true;
      lastError = error;
    } catch (error) {
      lastError = error;
    }
  }
  options.onCleanupError?.(lastError, paths);
  return false;
}

export class AtomicResumeObjectSwapError extends Error {
  readonly phase: 'upload' | 'persist';
  readonly field: ResumeProfilePathField | null;
  readonly causeValue: unknown;

  constructor(
    phase: 'upload' | 'persist',
    causeValue: unknown,
    field: ResumeProfilePathField | null = null,
  ) {
    const detail = causeValue instanceof Error
      ? causeValue.message
      : typeof causeValue === 'object' && causeValue !== null && 'message' in causeValue
        ? String((causeValue as { message?: unknown }).message ?? '')
        : String(causeValue ?? 'unknown error');
    super(`Resume ${phase} failed${detail ? `: ${detail}` : ''}`);
    this.name = 'AtomicResumeObjectSwapError';
    this.phase = phase;
    this.field = field;
    this.causeValue = causeValue;
  }
}

function objectPrefix(field: ResumeProfilePathField): string {
  return field === 'resumeOriginalPath' ? 'resume-original' : 'resume-enhanced';
}

function safeVersionId(raw: string): string {
  const normalized = raw.replace(/[^A-Za-z0-9_-]/g, '');
  if (!normalized) throw new Error('Resume object version ID is invalid');
  return normalized;
}

/** A storage path may only be read or retired by the user directory that owns it. */
export function isResumeObjectPathOwnedByUser(userId: string, path: string): boolean {
  if (!userId || !path || path.includes('\\') || path.includes('\0')) return false;
  const parts = path.split('/');
  return parts.length === 2 && parts[0] === userId && Boolean(parts[1])
    && parts[1] !== '.' && parts[1] !== '..';
}

/** Fixed-key profile objects predate immutable application resume snapshots. */
export function isLegacyResumeProfilePath(userId: string, path: string): boolean {
  if (!isResumeObjectPathOwnedByUser(userId, path)) return false;
  const objectName = path.slice(userId.length + 1);
  return /^(?:resume-original\.(?:pdf|doc|docx|txt)|resume-enhanced\.txt)$/.test(objectName);
}

/** An employer may download only the immutable snapshot created for this application. */
export function isApplicationResumeSnapshotPath(
  userId: string,
  applicationId: string,
  path: string,
): boolean {
  if (!applicationId || !isResumeObjectPathOwnedByUser(userId, path)) return false;
  const objectName = path.slice(userId.length + 1);
  return ['pdf', 'doc', 'docx', 'txt'].some(
    (extension) => objectName === `application-${applicationId}-resume.${extension}`,
  );
}

/**
 * Stage new resume objects under unique immutable keys and swap profile
 * pointers. Any upload or database failure removes staged objects and leaves
 * the prior profile pointers and blobs untouched.
 *
 * After the pointer swap succeeds, replaced profile objects are retired.
 * Employer applications copy the selected resume to a separate immutable
 * application snapshot before persisting, so profile autosaves do not need to
 * retain an unbounded version history.
 */
export async function replaceResumeObjectsAtomically(
  options: AtomicResumeObjectSwapOptions,
): Promise<{ paths: ResumeProfilePaths; previousPaths: ResumeProfilePaths }> {
  if (options.uploads.length === 0 && !options.clearFields?.length) {
    throw new Error('At least one resume object or cleared field is required');
  }

  const seenFields = new Set<ResumeProfilePathField>();
  for (const upload of options.uploads) {
    if (seenFields.has(upload.field)) {
      throw new Error(`Duplicate resume profile field: ${upload.field}`);
    }
    seenFields.add(upload.field);
  }
  for (const field of options.clearFields ?? []) {
    if (seenFields.has(field)) {
      throw new Error(`Duplicate resume profile field: ${field}`);
    }
    seenFields.add(field);
  }

  const stagedPaths: string[] = [];
  const nextPaths: ResumeProfilePaths = {};
  const makeVersionId = options.makeVersionId ?? randomUUID;

  const cleanup = async (paths: string[]): Promise<void> => {
    await removeResumeObjectsWithRetry({
      paths,
      removeObjects: options.removeObjects,
      onCleanupError: options.onCleanupError,
    });
  };

  for (const field of options.clearFields ?? []) nextPaths[field] = null;

  try {
    for (const upload of options.uploads) {
      const version = safeVersionId(makeVersionId());
      const path = `${options.userId}/${objectPrefix(upload.field)}-${version}.${upload.extension}`;
      const { error } = await options.uploadObject(path, upload.body, {
        upsert: false,
        contentType: upload.contentType,
      });
      if (error) {
        throw new AtomicResumeObjectSwapError('upload', error, upload.field);
      }
      stagedPaths.push(path);
      nextPaths[upload.field] = path;
    }
  } catch (error) {
    await cleanup(stagedPaths);
    throw error;
  }

  let previousPaths: ResumeProfilePaths;
  try {
    previousPaths = await options.swapProfilePaths(nextPaths);
  } catch (error) {
    if (options.isPersistenceOutcomeUnknown?.(error)) throw error;
    await cleanup(stagedPaths);
    throw new AtomicResumeObjectSwapError('persist', error);
  }

  const retiredPaths = (Object.keys(nextPaths) as ResumeProfilePathField[])
    .map((field) => previousPaths[field])
    .filter((path): path is string => Boolean(path))
    .filter((path) => !Object.values(nextPaths).includes(path))
    .filter((path) => isResumeObjectPathOwnedByUser(options.userId, path))
    // Legacy applications reference the old fixed profile keys. Preserve those
    // bounded objects until their employer download performs the safe snapshot
    // backfill; GDPR folder deletion still removes them with the account.
    .filter((path) => !isLegacyResumeProfilePath(options.userId, path));
  await cleanup([...new Set(retiredPaths)]);

  return { paths: nextPaths, previousPaths };
}
