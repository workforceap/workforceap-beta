import { Prisma } from '@prisma/client';

/** Public retry guidance only; never expose database or evidence payloads. */
export function applicationReviewFailure(error: unknown): { status: 409 | 503 | 500; error: string } {
  if ((error instanceof Error && error.message === 'APPLICATION_REVIEW_CONFLICT') ||
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')) {
    return { status: 409, error: 'This application changed. Reload and try again.' };
  }
  if (error instanceof Error && error.message === 'APPLICATION_REVIEW_TRANSACTION_UNAVAILABLE') {
    return { status: 503, error: 'Review storage is temporarily unavailable. Try again later.' };
  }
  return { status: 500, error: 'This application could not be saved. Try again later.' };
}
