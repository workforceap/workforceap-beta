import type { Metadata } from 'next';
import type { PartnerSignupRequest } from '@prisma/client';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { isSuperAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { crossTenantOK } from '@/lib/tenant/withTenantScope';
import { DesignSurface, PageOpener, DataTable, type Column } from '@/components/portal/kit';
import AdminDataLoadError from '@/components/admin/AdminDataLoadError';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({ title: 'Partner signup intake', description: 'Read original partner signup submissions.', path: '/admin/partner-signups' });
}

const PAGE_SIZE = 25;
const recorded = (value: string | null) => value?.trim() || 'Not recorded';

const columns: Column<PartnerSignupRequest>[] = [
  { key: 'organizationName', header: 'Organization', render: (row) => <><strong>{row.organizationName}</strong><p>{row.orgType}</p></> },
  { key: 'contact', header: 'Contact', render: (row) => <><strong>{row.contactName}</strong><p>{row.contactEmail}</p><p>{recorded(row.contactPhone)}</p></> },
  { key: 'intake', header: 'Submitted details', render: (row) => (
    <dl className="wa-m-0">
      <dt>Service area</dt><dd>{recorded(row.serveArea)}</dd>
      <dt>Expected monthly referrals</dt><dd>{recorded(row.expectedMonthly)}</dd>
      <dt>How they heard about WorkforceAP</dt><dd style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{recorded(row.hearAbout)}</dd>
    </dl>
  ) },
  { key: 'status', header: 'Recorded status' },
  { key: 'createdAt', header: 'Submitted', render: (row) => <time dateTime={row.createdAt.toISOString()}>{row.createdAt.toLocaleString('en-US', { timeZone: 'UTC' })} UTC</time> },
];

export default async function PartnerSignupsPage({ searchParams }: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/partner-signups');
  if (!(await isSuperAdmin(user.id))) redirect('/admin/partners');

  const params = await searchParams;
  const requested = Number(params?.page);
  const page = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, 10000) : 1;
  // These historical submissions have no tenant/account foreign key. Only a
  // platform super admin can read them; never infer ownership from contact data.
  const data = await crossTenantOK(() => Promise.all([
    prisma.partnerSignupRequest.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE }),
    prisma.partnerSignupRequest.count(),
  ])).catch(() => null);
  if (!data) return <AdminDataLoadError title="Could not load partner signup intake" />;
  const [signups, total] = data;

  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener kicker="Partners" title="Partner signup intake" lede="Original partner signup details, shown as submitted."
        action={<Link href="/admin/partners" className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus">Partner directory</Link>} />
      <p>Recorded signup status does not confirm the current status of a partner account. Review partner accounts in the directory.</p>
      <DataTable columns={columns} rows={signups} rowKey={(row) => row.id} mobile="scroll"
        empty={{ title: 'No partner signup submissions', description: 'Submitted partner signup details will appear here.' }} />
      <nav aria-label="Partner signup pages" className="wa-flex wa-items-center wa-justify-between wa-gap-3 wa-mt-4">
        {page > 1 ? <Link href={`/admin/partner-signups?page=${page - 1}`} className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus">Previous</Link> : <span />}
        <span>{total} submissions · Page {page}</span>
        {page * PAGE_SIZE < total && <Link href={`/admin/partner-signups?page=${page + 1}`} className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus">Next</Link>}
      </nav>
    </DesignSurface>
  );
}
