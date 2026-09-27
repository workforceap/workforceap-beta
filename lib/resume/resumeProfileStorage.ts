import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import {
  AtomicResumeObjectSwapError,
  replaceResumeObjectsAtomically,
  type AtomicResumeObjectSwapOptions,
  type ResumeObjectUpload,
  type ResumeProfilePaths,
} from '@/lib/resume/atomicResumeObjectSwap';
import { captureApiError } from '@/lib/observability/captureApiError';
import {
  assertMemberUploadWritable,
  isMemberUploadLifecycleError,
  MemberUploadPersistenceOutcomeError,
  MemberUploadStorageOutcomeError,
  withMemberUploadClaim,
} from '@/lib/member/uploadLifecycle';

const MEMBER_RESUME_BUCKET = 'member-resumes';

export class ResumeProfileConflictError extends Error {
  constructor() {
    super('The resume changed while this update was being saved. Please retry.');
    this.name = 'ResumeProfileConflictError';
  }
}

export function isResumeProfileConflict(error: unknown): boolean {
  return error instanceof AtomicResumeObjectSwapError
    && error.phase === 'persist'
    && error.causeValue instanceof ResumeProfileConflictError;
}

function supplied(
  paths: ResumeProfilePaths,
  field: keyof ResumeProfilePaths,
): boolean {
  return Object.prototype.hasOwnProperty.call(paths, field);
}

/**
 * Compare-and-swap resume pointers inside one transaction.
 *
 * Concurrent writers that touch the same pointer cannot both win: the loser
 * receives a conflict and its uniquely staged object is removed by
 * `replaceResumeObjectsAtomically`. Writers touching different variants may
 * proceed independently.
 */
export async function swapResumeProfilePathsWithCas(
  userId: string,
  nextPaths: ResumeProfilePaths,
  uploadOperationId: string,
  expectedPaths: ResumeProfilePaths = {},
): Promise<ResumeProfilePaths> {
  return prisma.$transaction(async (tx) => {
    await assertMemberUploadWritable(tx, userId, uploadOperationId);
    const previous = await tx.profile.findUnique({
      where: { userId },
      select: {
        resumeOriginalPath: true,
        resumeEnhancedPath: true,
      },
    });

    if (!previous) {
      if ((supplied(expectedPaths, 'resumeOriginalPath')
          && expectedPaths.resumeOriginalPath !== null)
        || (supplied(expectedPaths, 'resumeEnhancedPath')
          && expectedPaths.resumeEnhancedPath !== null)) {
        throw new ResumeProfileConflictError();
      }
      try {
        await tx.profile.create({
          data: {
            userId,
            role: 'member',
            ...(supplied(nextPaths, 'resumeOriginalPath') && {
              resumeOriginalPath: nextPaths.resumeOriginalPath,
            }),
            ...(supplied(nextPaths, 'resumeEnhancedPath') && {
              resumeEnhancedPath: nextPaths.resumeEnhancedPath,
            }),
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ResumeProfileConflictError();
        }
        throw error;
      }
      return {
        ...(supplied(nextPaths, 'resumeOriginalPath') && { resumeOriginalPath: null }),
        ...(supplied(nextPaths, 'resumeEnhancedPath') && { resumeEnhancedPath: null }),
      };
    }

    const result = await tx.profile.updateMany({
      where: {
        userId,
        ...((supplied(nextPaths, 'resumeOriginalPath')
          || supplied(expectedPaths, 'resumeOriginalPath')) && {
          resumeOriginalPath: supplied(expectedPaths, 'resumeOriginalPath')
            ? expectedPaths.resumeOriginalPath
            : previous.resumeOriginalPath,
        }),
        ...((supplied(nextPaths, 'resumeEnhancedPath')
          || supplied(expectedPaths, 'resumeEnhancedPath')) && {
          resumeEnhancedPath: supplied(expectedPaths, 'resumeEnhancedPath')
            ? expectedPaths.resumeEnhancedPath
            : previous.resumeEnhancedPath,
        }),
      },
      data: {
        ...(supplied(nextPaths, 'resumeOriginalPath') && {
          resumeOriginalPath: nextPaths.resumeOriginalPath,
        }),
        ...(supplied(nextPaths, 'resumeEnhancedPath') && {
          resumeEnhancedPath: nextPaths.resumeEnhancedPath,
        }),
      },
    });

    if (result.count !== 1) throw new ResumeProfileConflictError();

    return {
      ...(supplied(nextPaths, 'resumeOriginalPath') && {
        resumeOriginalPath: previous.resumeOriginalPath,
      }),
      ...(supplied(nextPaths, 'resumeEnhancedPath') && {
        resumeEnhancedPath: previous.resumeEnhancedPath,
      }),
    };
  });
}

/** Every production resume writer claims the member before its first upload. */
export async function replaceClaimedResumeObjects(
  options: Omit<AtomicResumeObjectSwapOptions, 'swapProfilePaths'> & {
    swapProfilePaths(nextPaths: ResumeProfilePaths, uploadOperationId: string): Promise<ResumeProfilePaths>;
  },
): Promise<{ paths: ResumeProfilePaths; previousPaths: ResumeProfilePaths }> {
  return withMemberUploadClaim({
    userId: options.userId,
    removeObjects: options.removeObjects,
    onCleanupError: options.onCleanupError,
    run: (operationId, recordAttempt) => replaceResumeObjectsAtomically({
      ...options,
      onCleanupError: (error, paths) => {
        try {
          options.onCleanupError?.(error, paths);
        } catch (reportingError) {
          // A post-commit retirement failure must not look like a failed
          // pointer swap and cause the new, referenced object to be deleted.
          console.error('[resume] cleanup error reporting failed', reportingError);
        }
      },
      uploadObject: (path, body, uploadOptions) => {
        recordAttempt(path);
        return options.uploadObject(path, body, uploadOptions)
          .catch((error) => { throw new MemberUploadStorageOutcomeError(error); });
      },
      swapProfilePaths: async (nextPaths) => {
        try {
          return await options.swapProfilePaths(nextPaths, operationId);
        } catch (error) {
          if (error instanceof ResumeProfileConflictError || isMemberUploadLifecycleError(error)) throw error;
          throw new MemberUploadPersistenceOutcomeError(error);
        }
      },
      isPersistenceOutcomeUnknown: (error) => error instanceof MemberUploadPersistenceOutcomeError,
    }),
  });
}

/** Keep immutable resume snapshots that were explicitly shared with employers. */
/** Persist a validated enhanced-text resume through the same CAS path as uploads. */
export async function saveEnhancedResumeText(
  userId: string,
  text: string,
  expectedPaths: Required<Pick<ResumeProfilePaths, 'resumeOriginalPath' | 'resumeEnhancedPath'>>,
): Promise<string> {
  const storage = getSupabaseAdmin().storage.from(MEMBER_RESUME_BUCKET);
  const upload: ResumeObjectUpload = {
    field: 'resumeEnhancedPath',
    extension: 'txt',
    contentType: 'text/plain; charset=utf-8',
    body: text,
  };
  const swapped = await replaceClaimedResumeObjects({
    userId,
    uploads: [upload],
    uploadObject: (path, body, options) => storage.upload(path, body, options),
    removeObjects: (paths) => storage.remove(paths),
    swapProfilePaths: (nextPaths, operationId) => swapResumeProfilePathsWithCas(
      userId,
      nextPaths,
      operationId,
      expectedPaths,
    ),
    onCleanupError: (error, paths) => {
      captureApiError(error, {
        route: 'resume-storage object cleanup',
        userId,
        extra: { orphanedObjectCount: paths.length },
      });
    },
  });
  const path = swapped.paths.resumeEnhancedPath;
  if (!path) throw new Error('Resume profile swap did not return an enhanced path');
  return path;
}
