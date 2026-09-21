import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { PERSONAL_DATA_KEY, redactMetadataKeys } from '@/lib/security/redactMetadata';

export type WorkflowDiagnosticParams = {
  workflow: string;
  status: 'started' | 'success' | 'fallback' | 'error' | 'inspection';
  actorUserId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  summary: string;
  provider?: string | null;
  method?: string | null;
  fallbackPath?: string | null;
  failureReason?: string | null;
  metadata?: Record<string, unknown> | null;
  /**
   * Write `metadata.templateParams` verbatim instead of redacting it. Only the
   * email failure record (WAP-163, `lib/email/send.ts`) sets this: the admin
   * resend route replays that payload, and whether the snapshot should keep
   * the recipient / subject is an open retention decision with Mike
   * (20 Sep) that this store does not pre-empt.
   */
  retainTemplateParams?: boolean;
};

/**
 * `metadata.templateParams` is the one metadata block that carries personal
 * data by construction (a rendered email's payload). Unless the caller opts
 * out, keys named like email / phone / address / token / password are
 * replaced by "[redacted]" before the row is written. Every other metadata
 * key is written as given.
 */
export function redactDiagnosticMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  const copy = JSON.parse(JSON.stringify(metadata)) as Record<string, unknown>;
  if (copy.templateParams && typeof copy.templateParams === 'object') {
    copy.templateParams = redactMetadataKeys(copy.templateParams, PERSONAL_DATA_KEY);
  }
  return copy;
}

export async function recordWorkflowDiagnostic(params: WorkflowDiagnosticParams): Promise<void> {
  try {
    await prisma.workflowDiagnostic.create({
      data: {
        workflow: params.workflow,
        status: params.status,
        actorUserId: params.actorUserId ?? null,
        entityType: params.entityType ?? null,
        entityId: params.entityId ?? null,
        summary: params.summary,
        provider: params.provider ?? null,
        method: params.method ?? null,
        fallbackPath: params.fallbackPath ?? null,
        failureReason: params.failureReason ?? null,
        metadata: (params.retainTemplateParams
          ? params.metadata
            ? JSON.parse(JSON.stringify(params.metadata))
            : undefined
          : redactDiagnosticMetadata(params.metadata)) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (error) {
    console.error('[recordWorkflowDiagnostic]', error);
  }
}
