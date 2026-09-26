import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope } from '@/lib/tenant/adminPageScope';
import { prisma } from '@/lib/db/prisma';
import { getProgramBySlug } from '@/lib/content/programs';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { isCurriculumOwnerVerified } from '@/shared/programCurricula';
import { getProgramCoursesForCurriculumVersion } from '@/lib/member/curriculumAssignment';
import { buildDefaultLineItems, resolveProgramPricing } from '@/lib/billing/packetDefaults';
import { getDefaultBillTo, getDefaultSigner, getTrainingProviderIdentity } from '@/lib/billing/providerIdentity';
import { resolveAssignedCounselorContact, serializeBillingPacket } from '@/lib/billing/packetAccess';
import { resolveBillableEnrollments } from '@/lib/billing/billableEnrollments';
import { checkBillingProviderOrg } from '@/lib/billing/providerOrg';
import PageHeader from '@/components/portal/PageHeader';
import BillingPacketClient, { type BillingProgramOption } from './BillingPacketClient';
import { DRAFT_CURRICULUM_REASON } from '@/lib/billing/packetText';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'J5 Invoice & J6 Cover Letter',
    description: 'Create, sign and send the training invoice packet for a member.',
    path: '/admin/members',
  });
}

/**
 * Admin signing desk for one member: prefilled J5 line items (classes with
 * the tuition spread by contact hours, plus catalog fees), a J6 cover letter
 * draft, signature capture, and the send-to-counselor-and-student button.
 */
export default async function AdminMemberBillingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/members');
  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  const { id } = await params;
  const member = await withAdminPageScope(scope, (db) =>
    db.user.findFirst({
      where: { id },
      select: {
        id: true,
        fullName: true,
        email: true,
        organizationId: true,
        deletedAt: true,
      },
    }),
  );
  if (!member || member.deletedAt) notFound();

  const orgCheck = checkBillingProviderOrg(await getActorOrganizationId(user.id).catch(() => null), member.organizationId);
  if (!orgCheck.ok) {
    return (
      <div>
        <PageHeader
          breadcrumbs={[
            { label: 'Members', href: '/admin/members' },
            { label: member.fullName, href: `/admin/members/${member.id}` },
            { label: 'J5 / J6 billing' },
          ]}
          title="J5 / J6 billing is not available"
          subtitle={orgCheck.error}
        />
      </div>
    );
  }

  // Programs this member can be billed for (same rule the POST enforces):
  // canonical enrollments, or the legacy pointer only when there are none.
  const enrollments = await resolveBillableEnrollments(member.id, member.organizationId);
  const slugs = enrollments.map((e) => e.programSlug);

  const [catalogRows, packets, counselor] = await Promise.all([
    slugs.length
      ? prisma.organizationProgramCatalog.findMany({
          where: { organizationId: member.organizationId, programSlug: { in: slugs } },
          select: { programSlug: true, name: true, cost: true, certCost: true, bookCost: true, miscCost: true },
        })
      : Promise.resolve([]),
    prisma.trainingBillingPacket.findMany({
      where: { memberId: member.id, organizationId: member.organizationId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { sends: true },
    }),
    resolveAssignedCounselorContact(member.id, member.organizationId),
  ]);

  const programs: BillingProgramOption[] = slugs
    .map((slug, index) => {
      const program = getProgramBySlug(slug);
      const catalog = catalogRows.find((row) => row.programSlug === slug) ?? null;
      const title = program?.title ?? catalog?.name ?? slug;
      if (!program && !catalog) return null;
      const enrollment = enrollments[index];
      const courses = program ? getProgramCoursesForCurriculumVersion(program, enrollment?.curriculumVersion) : [];
      const pricing = resolveProgramPricing({ slug }, catalog);
      // Same rule as the funder-facing price list: a draft curriculum's hours
      // and price never go on an official document.
      const verified = isCurriculumOwnerVerified(program?.curriculum);
      return {
        slug,
        title,
        lineItems: verified ? buildDefaultLineItems({ courses, pricing, programTitle: title }) : [],
        pricingSource: pricing.source,
        priceListMaximum: verified && pricing.source === 'price_list_default' ? pricing.tuition : null,
        isPrimary: enrollment?.isPrimary ?? false,
        unavailableReason: verified ? null : DRAFT_CURRICULUM_REASON,
      };
    })
    .filter((p): p is BillingProgramOption => p !== null);

  const provider = getTrainingProviderIdentity();
  const signer = getDefaultSigner();
  const billTo = getDefaultBillTo();

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: 'Members', href: '/admin/members' },
          { label: member.fullName, href: `/admin/members/${member.id}` },
          { label: 'J5 / J6 billing' },
        ]}
        title={`J5 invoice & J6 cover letter — ${member.fullName}`}
        subtitle={`${member.email}${counselor ? ` · Counselor: ${counselor.fullName}` : ' · No counselor assigned yet'}`}
        action={
          <Link href={`/admin/members/${member.id}`} className="btn btn-outline" style={{ minHeight: 44, justifyContent: 'center' }}>
            Back to member
          </Link>
        }
      />
      <BillingPacketClient
        memberId={member.id}
        memberName={member.fullName}
        memberEmail={member.email}
        programs={programs}
        billTo={billTo}
        signer={{ name: signer.name, title: signer.title }}
        providerName={provider.legalName}
        counselorLabel={counselor ? `${counselor.fullName} (${counselor.email})` : null}
        initialPackets={packets.map((row) => serializeBillingPacket(row, programs.find((p) => p.slug === row.programSlug)?.title))}
      />
    </div>
  );
}
