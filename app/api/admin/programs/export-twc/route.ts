import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { withTenantScope } from '@/lib/tenant/withTenantScope';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { csvEscape } from '@/lib/csv';

/**
 * Track A — Tenant Isolation Hardening (Sprint A.2 batch 4).
 * The TWC catalog export goes through `withTenantScope` so an admin
 * from Org A only exports their own tenant's program catalog. The
 * Texas Workforce Commission report is a per-funder artefact, so
 * cross-tenant exposure here would also be a compliance issue.
 */

function formatDate(d: Date | null | undefined): string {
  if (!d) return 'Rolling';
  try {
    return d.toISOString().slice(0, 10);
  } catch {
    return 'Rolling';
  }
}

async function _GET() {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!(await isAdmin(user.id))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  
    const orgId = await getActorOrganizationId(user.id);
    const rows = await withTenantScope(orgId, (db) =>
      db.organizationProgramCatalog.findMany({
        where: { status: 'active' },
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
        take: 100,
      }),
    );
  
    const header = [
      'Program name',
      'Short description (200 chars)',
      'Duration',
      'Tuition cost',
      'Certification exam cost',
      'Book/materials cost',
      'Miscellaneous fees',
      'Total cost',
      'Start date',
      'End date',
      'Certifications earned',
    ];
  
    const lines = [header.map(csvEscape).join(',')];
  
    for (const r of rows) {
      const tuition = r.cost ?? 0;
      const cert = r.certCost ?? 0;
      const book = r.bookCost ?? 0;
      const misc = r.miscCost ?? 0;
      const total = tuition + cert + book + misc;
      const desc = (r.description ?? r.name).slice(0, 200);
      const certs = (r.certifications ?? []).join(', ');
  
      lines.push(
        [
          r.name,
          desc,
          r.duration ?? '',
          String(tuition),
          String(cert),
          String(book),
          String(misc),
          String(total),
          formatDate(r.programStartDate),
          formatDate(r.programEndDate),
          certs,
        ]
          // Shared escaper: quotes and neutralises a leading = + - @ TAB CR (S01/P02).
          .map((c) => csvEscape(String(c ?? '')))
          .join(',')
      );
    }
  
    const csv = `${lines.join('\r\n')}\r\n`;
    const filename = `workforceap-twc-program-export-${new Date().toISOString().slice(0, 10)}.csv`;
  
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('/admin/programs/export-twc:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
export const GET = withApiGuc(_GET);
