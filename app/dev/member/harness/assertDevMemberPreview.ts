import { notFound } from 'next/navigation';

/** Dev member proofs and the B0 harness never render on production. */
export function assertDevMemberPreview(): void {
  if (process.env.VERCEL_ENV === 'production') notFound();
}
