/**
 * LOCAL SYNTHETIC entry point for the sync preview. Reachable only when
 * ATTENDANCE_SYNC_PREVIEW_DEMO=local and NODE_ENV/VERCEL_ENV are not production.
 * It reads no database: the actor and the source rows are fixtures chosen by the server.
 * Wiring real data is a separate, gated change (needs WFS policy + verified duration source).
 */
import { handleAdminSyncPreview, type SyncPreviewResult } from './sync-preview-http';
import { baseSyncInput } from './sync-preview-fixtures';
import { syntheticActor, SYNTHETIC_ENROLLMENT, SYNTHETIC_LABEL, type SyntheticRole } from './synthetic-fixtures';

export function syncPreviewDemoEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ATTENDANCE_SYNC_PREVIEW_DEMO === 'local' && env.NODE_ENV !== 'production' && env.VERCEL_ENV !== 'production';
}
export async function handleSyntheticSyncPreview(method: string, rawBody: string, role: SyntheticRole = 'admin'): Promise<SyncPreviewResult> {
  if (!syncPreviewDemoEnabled()) return { status: 404, body: { error: 'NOT_FOUND', label: SYNTHETIC_LABEL } };
  const actor = syntheticActor(role);
  return handleAdminSyncPreview(method, rawBody, {
    getUserId: async () => actor.userId,
    resolveAdminActor: async () => actor,
    loadSyncInput: async (organizationId, request) => {
      if (organizationId !== actor.organizationId || request.enrollmentId !== SYNTHETIC_ENROLLMENT) return null;
      return baseSyncInput({
        points: [{ statementId: 'synthetic-stmt-1', organizationId, timestamp: '2026-09-08T15:00:00Z', verb: 'activity', courseId: 'course-a',
          actor: { accountName: 'acct-member', homePage: 'https://synthetic.invalid/accounts' } }],
        period: { kind: request.kind, selectedDate: request.selectedDate, startMonth: request.kind === 'yearly' ? 9 : null },
      });
    },
  });
}
