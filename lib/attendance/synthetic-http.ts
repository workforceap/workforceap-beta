import { ZodError, z } from 'zod';
import { InMemorySyntheticAttendanceRepository } from './synthetic-repository';
import { importRequestSchema, previewRequestSchema, runSyntheticImport, runSyntheticPreview } from './synthetic-flow';
import { SYNTHETIC_LABEL, syntheticActor, type SyntheticRole } from './synthetic-fixtures';
import { attendanceProtectedOperations } from './workflow';

/**
 * LOCAL SYNTHETIC HTTP boundary (fixture-only). It is only reachable when
 * ATTENDANCE_SYNTHETIC_DEMO=local, NODE_ENV is not production and VERCEL_ENV is not
 * production. The fixture actor is chosen by the server from the action, never from
 * the request. Importing this module from a production route is a review failure.
 */
const protectedActions = ['finalize', 'student-attest', 'request-signature', 'sign', 'download-archive'] as const;
const requestSchema = z.discriminatedUnion('action', [
  importRequestSchema.extend({ action: z.literal('import') }).strict(),
  previewRequestSchema.extend({ action: z.literal('preview') }).strict(),
  z.object({ action: z.enum(protectedActions) }).passthrough(),
]);
const protectedOps: Record<(typeof protectedActions)[number], () => never> = {
  finalize: attendanceProtectedOperations.finalize,
  'student-attest': attendanceProtectedOperations.studentAttest,
  'request-signature': attendanceProtectedOperations.requestSignature,
  sign: attendanceProtectedOperations.sign,
  'download-archive': attendanceProtectedOperations.downloadArchive,
};

let repo = new InMemorySyntheticAttendanceRepository();
export function resetSyntheticAttendanceRepo(): void { repo = new InMemorySyntheticAttendanceRepository(); }
export function syntheticDemoEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ATTENDANCE_SYNTHETIC_DEMO === 'local' && env.NODE_ENV !== 'production' && env.VERCEL_ENV !== 'production';
}

export type SyntheticHttpResult = { status: number; body: Record<string, unknown> };
const fail = (status: number, error: string): SyntheticHttpResult => ({ status, body: { error, label: SYNTHETIC_LABEL } });

/** `role` is test-only; the production-shaped route handler never passes it. */
export async function handleSyntheticAttendance(method: string, rawBody: string, role?: SyntheticRole): Promise<SyntheticHttpResult> {
  if (!syntheticDemoEnabled()) return fail(404, 'NOT_FOUND');
  if (method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED');
  if (rawBody.length > 2_000_000) return fail(413, 'PAYLOAD_TOO_LARGE');
  let json: unknown;
  try { json = JSON.parse(rawBody); } catch { return fail(400, 'INVALID_JSON'); }
  try {
    const request = requestSchema.parse(json);
    if (request.action !== 'import' && request.action !== 'preview') {
      protectedOps[request.action]();
    }
    // The discriminator is routing data, not part of the strict DTO the flow validates.
    const { action, ...dto } = request;
    if (action === 'import') return { status: 200, body: runSyntheticImport(repo, syntheticActor(role ?? 'admin'), dto) };
    return { status: 200, body: await runSyntheticPreview(repo, syntheticActor(role ?? 'student'), dto) };
  } catch (error) {
    if (error instanceof ZodError) return fail(400, 'INVALID_REQUEST');
    const message = error instanceof Error ? error.message : 'ERROR';
    if (message === 'ATTENDANCE_VERIFIED_ARCHIVE_UNAVAILABLE') return fail(503, message);
    if (message === 'ATTENDANCE_FORBIDDEN' || message === 'ATTENDANCE_ENROLLMENT_NOT_FOUND') return fail(message === 'ATTENDANCE_FORBIDDEN' ? 403 : 404, message);
    if (message === 'ATTENDANCE_STALE_REVISION') return fail(409, message);
    if (message === 'ATTENDANCE_ENROLLMENT_INACTIVE') return fail(409, message);
    if (/^(INVALID_|CONFLICTING_|AMBIGUOUS_|VERIFIER_|CODE_IS_|EVIDENCE_|UNSUPPORTED_|ENROLLMENT_START_)/.test(message)) return fail(422, message);
    return fail(500, 'INTERNAL_ERROR');
  }
}
