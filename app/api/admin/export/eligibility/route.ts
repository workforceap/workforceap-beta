import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { buildCsv } from '@/lib/csv';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';
import {
  ELIGIBILITY_EXPORT_BASE_COLUMNS,
  buildEligibilityExportCsvRows,
  type EligibilityExportRow,
} from '@/lib/admin/eligibilityDatasheet';

const EXPORT_LIMIT = 10_000;

/**
 * GET /api/admin/export/eligibility
 *
 * WS5 datasheet CSV: adult eligibility screening fields for members.
 * In-admin companion table lives at /admin/exports (Eligibility datasheet card).
 * No Google Sheet sync — download CSV only.
 */
async function _GET() {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isAdmin(user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const orgId = await getActorOrganizationId(user.id);

    const members = await withTenantScope(orgId, (db) =>
      db.user.findMany({
        where: {
          deletedAt: null,
          AND: [MEMBER_ONLY_WHERE],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: EXPORT_LIMIT,
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          createdAt: true,
          partnerReferrals: {
            take: 1,
            orderBy: { referredAt: 'desc' },
            select: { partner: { select: { name: true } } },
          },
          applyEligibilityScreenings: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: {
              q1: true,
              q2: true,
              q3: true,
              qualifies: true,
              yesCount: true,
              receivingUnemployment: true,
              exhaustedUnemployment: true,
              layoffCompany: true,
              snapWic: true,
              publicAssistancePrograms: true,
              publicAssistanceHelpRequested: true,
              hearAbout: true,
              hearAboutOther: true,
              partnerAmbassadorReferral: true,
              createdAt: true,
            },
          },
        },
      }),
    );

    const rows: EligibilityExportRow[] = members.map((m) => ({
      id: m.id,
      fullName: m.fullName,
      email: m.email,
      phone: m.phone,
      createdAt: m.createdAt,
      partnerName: m.partnerReferrals[0]?.partner.name ?? null,
      screening: m.applyEligibilityScreenings[0] ?? null,
    }));

    const csv = buildCsv(
      [...ELIGIBILITY_EXPORT_BASE_COLUMNS],
      buildEligibilityExportCsvRows(rows),
      {
        reportTitle: 'Eligibility Screening Datasheet',
        notes:
          'WS5 adult eligibility answers (unemployment triad, SNAP/WIC with programs and help requested, hear-about, ambassador). In-admin CSV — not a Google Sheet sync.',
      },
    );

    const filename = `workforceap-eligibility-datasheet-${new Date().toISOString().slice(0, 10)}.csv`;
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('/admin/export/eligibility error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withApiGuc(_GET);
