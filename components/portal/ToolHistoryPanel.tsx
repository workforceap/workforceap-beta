import Link from 'next/link';
import type { AIToolType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { isMissingPrismaEnumValue } from '@/lib/db/prismaEnumFallback';
import ToolHistoryPanelClient from './ToolHistoryPanelClient';

export default async function ToolHistoryPanel({
  userId,
  toolType,
  toolTypes,
  inputSummaryStartsWith,
  title = 'Recent saved runs',
  limit = 5,
  emptyMessage = 'No saved runs yet for this tool.',
}: {
  userId: string;
  toolType?: AIToolType;
  toolTypes?: AIToolType[];
  inputSummaryStartsWith?: string;
  title?: string;
  limit?: number;
  emptyMessage?: string;
}) {
  const resolvedToolTypes = (toolTypes?.length ? toolTypes : toolType ? [toolType] : []) as AIToolType[];
  if (resolvedToolTypes.length === 0) return null;

  const historyHrefTool = resolvedToolTypes[0];
  let rows: Array<{ id: string; toolType: string; inputSummary: string; output: string; createdAt: Date }> = [];
  let historyUnavailable = false;

  try {
    rows = await prisma.aIToolResult.findMany({
      where: {
        userId,
        toolType: resolvedToolTypes.length === 1 ? resolvedToolTypes[0] : { in: resolvedToolTypes },
        ...(inputSummaryStartsWith ? { inputSummary: { startsWith: inputSummaryStartsWith } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, toolType: true, inputSummary: true, output: true, createdAt: true },
    });
  } catch (error) {
    const missingEnum = resolvedToolTypes.some((value) => isMissingPrismaEnumValue(error, value));
    if (!missingEnum) throw error;
    historyUnavailable = true;
    console.error('[ToolHistoryPanel] missing enum value', { userId, toolTypes: resolvedToolTypes });
  }

  if (historyUnavailable) {
    return (
      <section className="portal-card portal-card--flat" style={{ padding: '1rem', borderRadius: 12, marginTop: '1rem' }}>
        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-on-surface-variant)' }}>
          Saved history is temporarily unavailable. Please try again in a few minutes.
        </p>
      </section>
    );
  }

  return (
    <section className="portal-card portal-card--flat" style={{ padding: '1rem', borderRadius: 12, marginTop: '1rem' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          marginBottom: '0.75rem',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-on-surface)' }}>{title}</h3>
        <Link
          href={`/dashboard/ai-tools/history?tool=${historyHrefTool}`}
          style={{
            fontSize: '0.8125rem',
            color: 'var(--color-accent)',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          View all
        </Link>
      </div>

      {rows.length === 0 ? (
        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-on-surface-variant)' }}>{emptyMessage}</p>
      ) : (
        <ToolHistoryPanelClient
          rows={rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))}
        />
      )}
    </section>
  );
}
