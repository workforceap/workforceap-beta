import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import { prisma } from '@/lib/db/prisma';
import { captureApiError } from '@/lib/observability/captureApiError';
import PageHeader from '@/components/portal/PageHeader';
import EmailTemplatesClient from '@/components/admin/EmailTemplatesClient';
import { DesignSurface } from '@/components/portal/kit';
import {
  EmailTemplatesKit,
  type EmailTemplateRow,
} from '@/components/portal/kit/pages/admin-subviews/EmailTemplatesKit';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'Admin – Email Templates',
    description: 'Preview and manage email templates.',
    path: '/admin/email-templates',
  });
}

/** Cap the lean kit table so first paint stays cheap. */
const BOARD_LIMIT = 200;

/** "Jun 10" — short month + day. */
function formatUpdated(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default async function AdminEmailTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ ui?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/email-templates');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const { ui } = await searchParams;

  if (ui !== 'legacy') {
    return renderKit();
  }

  return renderLegacy(user.id, user.email ?? '');
}

/** Design-kit default: dense roster of transactional templates → <EmailTemplatesKit/>. */
async function renderKit() {
  let rows: EmailTemplateRow[] = [];

  try {
    const templates = await prisma.emailTemplate.findMany({
      take: BOARD_LIMIT,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        key: true,
        name: true,
        subject: true,
        variables: true,
        active: true,
        updatedAt: true,
      },
    });

    rows = templates.map((t): EmailTemplateRow => ({
      id: t.id,
      key: t.key,
      name: t.name,
      subject: t.subject,
      variableCount: t.variables.length,
      active: t.active,
      updated: formatUpdated(t.updatedAt),
    }));
  } catch (error) {
    // Core query failed — fall back to the proven legacy view rather than
    // rendering a fabricated/empty kit.
    captureApiError(error, { route: 'admin/email-templates', extra: { view: 'kit' } });
    redirect('/admin/email-templates?ui=legacy');
  }

  return (
    <DesignSurface surface="dense">
      <EmailTemplatesKit templates={rows} />
    </DesignSurface>
  );
}

/** Legacy email-template manager: list + live preview + editor + test-send. */
async function renderLegacy(adminUserId: string, adminEmail: string) {
  const templates = await prisma.emailTemplate.findMany({
    orderBy: { name: 'asc' },
  });

  return (
    <div>
      <PageHeader
        title="Email Templates"
        subtitle={`${templates.length} template${templates.length !== 1 ? 's' : ''}`}
      />
      <EmailTemplatesClient
        templates={templates.map((t) => ({
          ...t,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
        }))}
        adminEmail={adminEmail}
        adminUserId={adminUserId}
      />
    </div>
  );
}
