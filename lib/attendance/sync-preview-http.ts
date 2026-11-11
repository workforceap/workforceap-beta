/**
 * Admin-only sync-preview boundary. Stateless and read-only. Identity, organization and the
 * source rows come from injected server-side dependencies; the body carries only an
 * enrollment id and a period. Errors expose reason codes only, never provider payloads.
 */
import { ZodError, z } from 'zod';
import type { Actor } from './workflow';
import { buildSyncPreview, type SyncInput } from './sync-preview';

export const syncPreviewRequestSchema = z.object({
  enrollmentId: z.string().uuid(),
  kind: z.enum(['weekly', 'monthly', 'yearly']),
  selectedDate: z.string().max(10),
}).strict();

export type SyncPreviewDeps = {
  getUserId(): Promise<string | null>;
  resolveAdminActor(userId: string): Promise<Actor | null>;
  /** Must read inside the actor's organization only; null when the enrollment is not in it. */
  loadSyncInput(organizationId: string, request: z.infer<typeof syncPreviewRequestSchema>): Promise<SyncInput | null>;
};
export type SyncPreviewResult = { status: number; body: Record<string, unknown> };
const fail = (status: number, error: string): SyncPreviewResult => ({ status, body: { error } });

export async function handleAdminSyncPreview(method: string, rawBody: string, deps: SyncPreviewDeps): Promise<SyncPreviewResult> {
  if (method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED');
  const userId = await deps.getUserId();
  if (!userId) return fail(401, 'UNAUTHENTICATED');
  const actor = await deps.resolveAdminActor(userId);
  if (!actor || !actor.permissions.includes('attendance:admin')) return fail(403, 'ATTENDANCE_FORBIDDEN');
  if (rawBody.length > 20_000) return fail(413, 'PAYLOAD_TOO_LARGE');
  let json: unknown;
  try { json = JSON.parse(rawBody); } catch { return fail(400, 'INVALID_JSON'); }
  try {
    const request = syncPreviewRequestSchema.parse(json);
    const input = await deps.loadSyncInput(actor.organizationId, request);
    if (!input || input.enrollment.organizationId !== actor.organizationId || input.enrollment.enrollmentId !== request.enrollmentId) return fail(404, 'ATTENDANCE_ENROLLMENT_NOT_FOUND');
    return { status: 200, body: buildSyncPreview(input) as unknown as Record<string, unknown> };
  } catch (error) {
    if (error instanceof ZodError) return fail(400, 'INVALID_REQUEST');
    const message = error instanceof Error ? error.message : '';
    if (message === 'ATTENDANCE_ENROLLMENT_NOT_FOUND') return fail(404, message);
    if (message === 'ATTENDANCE_ENROLLMENT_INACTIVE') return fail(409, message);
    if (/^(INVALID_|ENROLLMENT_START_|UNSUPPORTED_)/.test(message)) return fail(422, message);
    return fail(500, 'INTERNAL_ERROR');
  }
}
