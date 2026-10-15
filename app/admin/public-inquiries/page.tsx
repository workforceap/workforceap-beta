import type { Metadata } from 'next';
import type { PublicInquiry } from '@prisma/client';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope } from '@/lib/tenant/adminPageScope';
import { PUBLIC_LEAD_RETENTION_DAYS } from '@/lib/retention/config';
import { DesignSurface, PageOpener, DataTable, StatusTag, type Column } from '@/components/portal/kit';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({ title: 'Public inquiries', description: 'Read contact, sponsorship and careers inquiries.', path: '/admin/public-inquiries' });
}

const PAGE_SIZE = 25;
const notificationLabel: Record<string, string> = {
  pending: 'Notification pending', accepted: 'Provider accepted', failed: 'Notification failed', unavailable: 'Email unavailable',
};

function InquiryDetails({ inquiry }: { inquiry: PublicInquiry }) {
  return (
    <details>
      <summary className="wa-kit-focus">{inquiry.topic}</summary>
      <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{inquiry.message}</p>
      {inquiry.organizationName && <p>Organization: {inquiry.organizationName}</p>}
      {inquiry.interestArea && <p>Interest: {inquiry.interestArea}</p>}
      {inquiry.seats !== null && <p>Seats: {inquiry.seats}</p>}
      {inquiry.roleTitle && <p>Role: {inquiry.roleTitle}</p>}
      <p>SMS preferred: {inquiry.smsPreferred ? 'Yes' : 'No'}</p>
      <p>Reference: {inquiry.id}</p>
    </details>
  );
}

const columns: Column<PublicInquiry>[] = [
  { key: 'contact', header: 'Contact', render: (row) => <><strong>{row.firstName} {row.lastName}</strong><p>{row.email}</p>{row.phone && <p>{row.phone}</p>}</> },
  { key: 'kind', header: 'Source' },
  { key: 'message', header: 'Inquiry', render: (row) => <InquiryDetails inquiry={row} /> },
  { key: 'notificationStatus', header: 'Team email', render: (row) => <StatusTag tone={row.notificationStatus === 'accepted' ? 'ok' : 'warn'}>{notificationLabel[row.notificationStatus] ?? 'Status unknown'}</StatusTag> },
  { key: 'createdAt', header: 'Received', render: (row) => <time dateTime={row.createdAt.toISOString()}>{row.createdAt.toLocaleString('en-US', { timeZone: 'UTC' })} UTC</time> },
];

export default async function PublicInquiriesPage({ searchParams }: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/public-inquiries');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');
  const params = await searchParams;
  const requested = Number(params?.page);
  const page = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, 10000) : 1;
  const { inquiries, total } = await withAdminPageScope(scope, async (db) => {
    const [inquiries, total] = await Promise.all([
      db.publicInquiry.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
      db.publicInquiry.count(),
    ]);
    return { inquiries, total };
  });
  return (
    <DesignSurface surface="dense">
      <PageOpener kicker="Administration" title="Public inquiries" lede="Contact, sponsorship and careers inquiries received through public forms." />
      <p>Inquiries are retained for {PUBLIC_LEAD_RETENTION_DAYS} days and then removed by scheduled cleanup. Provider acceptance does not confirm inbox delivery.</p>
      <DataTable columns={columns} rows={inquiries} rowKey={(row) => row.id} mobile="scroll"
        empty={{ title: 'No public inquiries yet', description: 'New submissions will appear here after they are saved.' }} />
      <nav aria-label="Inquiry pages" className="wa-flex wa-items-center wa-justify-between wa-gap-3 wa-mt-4">
        {page > 1 ? <Link href={`/admin/public-inquiries?page=${page - 1}`} className="wa-kit-cta wa-kit-cta--ghost">Previous</Link> : <span />}
        <span>{total} inquiries · Page {page}</span>
        {page * PAGE_SIZE < total && <Link href={`/admin/public-inquiries?page=${page + 1}`} className="wa-kit-cta wa-kit-cta--ghost">Next</Link>}
      </nav>
    </DesignSurface>
  );
}
