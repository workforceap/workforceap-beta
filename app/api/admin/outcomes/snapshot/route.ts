import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isSuperAdmin } from '@/lib/auth/roles';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { getBoardSnapshot, BoardOutcomesPeriod, formatBoardSnapshotMarkdown, formatBoardSnapshotPdf } from '@/lib/admin/boardOutcomes';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { dataToCsv, csvDownloadResponse, exportFilename } from '@/lib/csv/export';
import { auditLog } from '@/lib/audit';
import { logAuditEvent, auditRequestMeta } from '@/lib/audit/log';

async function _GET(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const superAdmin = await isSuperAdmin(user.id);
    const orgId = superAdmin ? null : await getActorOrganizationId(user.id);

    const { searchParams } = new URL(request.url);
    const period = (searchParams.get('period') ?? 'all-time') as BoardOutcomesPeriod;
    const format = searchParams.get('format') ?? 'json';

    const snapshot = await getBoardSnapshot(period, orgId ?? undefined);

    auditLog({ actorUserId: user.id, action: 'admin_outcomes_snapshot_view', targetType: 'OutcomesSnapshot', targetId: period, metadata: { orgId: orgId ?? null } }).catch((err) => console.error('[audit] admin_outcomes_snapshot_view:', err));
    await logAuditEvent({
      user: { id: user.id, role: 'admin' },
      verb: 'viewed',
      object: { type: 'OutcomesSnapshot', id: period },
      result: { success: true },
      request: auditRequestMeta(request),
      orgId: orgId ?? null,
    });

    if (format === 'csv') {
      const csv = dataToCsv(
        [
          { key: 'stage', header: 'Stage', accessor: (r) => r.stage },
          { key: 'count', header: 'Count', accessor: (r) => r.count },
          { key: 'previousCount', header: 'Previous Stage Count', accessor: (r) => r.previousCount ?? '' },
          { key: 'conversionRate', header: 'Conversion Rate', accessor: (r) => r.conversionRate != null ? `${r.conversionRate}%` : '' },
        ],
        snapshot.funnelWaterfall,
        { reportTitle: `WorkforceAP Outcomes — ${snapshot.outcomes.period.label}`, notes: `Generated ${snapshot.generatedAt.toISOString()}` },
      );
      return csvDownloadResponse(csv, exportFilename('outcomes-snapshot'));
    }

    if (format === 'md') {
      const md = formatBoardSnapshotMarkdown(snapshot);
      return new NextResponse(md, {
        status: 200,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="${exportFilename('outcomes-snapshot', 'md')}"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    if (format === 'pdf') {
      const pdf = await formatBoardSnapshotPdf(snapshot);
      return new NextResponse(new Uint8Array(pdf), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${exportFilename('outcomes-snapshot', 'pdf')}"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    return NextResponse.json({ snapshot });
  } catch (err) {
    console.error('/admin/outcomes/snapshot:', err);
    return NextResponse.json(
      { error: 'Unable to build the outcomes snapshot. Please try again in a few minutes.' },
      { status: 500 },
    );
  }
}
export const GET = withApiGuc(_GET);
