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
};

/**
 * `metadata.templateParams` (the email wrapper payload stored by failed sends)
 * is the one metadata block that carries personal data by construction:
 * recipients, names, contact details. It is redacted key-by-key before the
 * row is written, so `workflow_diagnostics` never becomes a second store of
 * member contact data. Every other metadata key is written as given.
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
        metadata: redactDiagnosticMetadata(params.metadata) as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (error) {
    console.error('[recordWorkflowDiagnostic]', error);
  }
}
