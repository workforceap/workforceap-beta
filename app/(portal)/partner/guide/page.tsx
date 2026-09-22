import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { unlinkedPartnerHref } from '@/lib/auth/portalGuards';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { getPartnerForUser } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import PartnerReferralShare from '@/components/partner/PartnerReferralShare';
import PartnerReferralResourcesSection from '@/components/partner/PartnerReferralResourcesSection';
import { buildPartnerReferralLink } from '@/lib/partner/referralLink';
import PageHeader from '@/components/portal/PageHeader';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
  title: 'Partner referral guide',
  description: 'How to refer members and track progress in the partner portal.',
  path: '/partner/guide',
});
}

const FAQS = [
  {
    q: "What if someone does not qualify?",
    a: "If a candidate does not meet program requirements, let them know what the gaps are and encourage them to reapply when they're ready. Some candidates may qualify for a different program track — our team can help assess.",
  },
  {
    q: 'How do I know if my referral was accepted?',
    a: 'Referred members appear on your dashboard once their application is received. You can see their enrollment status and progress stages in real time.',
  },
  {
    q: 'Can I refer someone who is already employed?',
    a: "Yes — we work with people who are underemployed or actively trying to change careers. If they're committed to the process, they can benefit from the program.",
  },
  {
    q: 'What if they need additional support?',
    a: 'Open Messages from the referred member’s profile to ask the WorkforceAP team for help. Review the member context, describe the support needed, and send when ready.',
  },
];

export default async function PartnerGuidePage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/partner/guide');

  const ctx = await getPartnerForUser(user.id);
  if (!ctx) redirect(await unlinkedPartnerHref(user.id));

  // Referral impact stats
  const [totalReferred, assessmentCount, placedCount] = await Promise.all([
    prisma.application.count({ where: { referralPartnerId: ctx.partnerId } }),
    prisma.user.count({
      where: {
        applications: { some: { referralPartnerId: ctx.partnerId } },
        assessmentCompleted: true,
      },
    }),
    prisma.user.count({
      where: {
        applications: { some: { referralPartnerId: ctx.partnerId } },
        jobPostingApplications: { some: { status: 'hired' } },
      },
    }),
  ]);

  const partnerName = ctx.partner.name;
  const partner = await prisma.partner.findUnique({
    where: { id: ctx.partnerId },
    select: { referralCode: true, slug: true },
  });
  const { referralCode, url: referralApplyUrl } = buildPartnerReferralLink({
    referralCode: partner?.referralCode,
    slug: partner?.slug ?? ctx.partner.slug,
  });

  return (
    <div style={{ maxWidth: '56rem', margin: '0 auto', paddingBottom: '6rem' }} className="md:wa-pb-12">
      <PageHeader
        title="How to Refer Members to WorkforceAP"
        subtitle={`A practical guide for ${partnerName} staff.`}
        action={
          <Link href="/partner" className="btn btn-outline btn-sm">
            Back to dashboard
          </Link>
        }
      />

      <PartnerReferralShare url={referralApplyUrl} referralCode={referralCode} />

      {/* Who is WorkforceAP for */}
      <section className="portal-card portal-card--flat" style={{ padding: '2rem', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--color-on-surface)', marginBottom: '0.75rem', letterSpacing: '-0.02em' }}>
          Who is WorkforceAP for?
        </h2>
        <p style={{ fontSize: '0.9375rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.7, marginBottom: '1rem' }}>
          Job seekers who are <strong style={{ color: 'var(--color-on-surface)' }}>unemployed, underemployed, or changing careers</strong>.
        </p>
        <p style={{ fontSize: '0.9375rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.7 }}>
          Your referrals connect people with career support, training pathways, and employer connections.
          WorkforceAP must confirm training eligibility, enrollment approval, and any required funding before training begins.
        </p>
      </section>

      {/* 3-Step Referral Process */}
      <section style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--color-on-surface)', marginBottom: '1.25rem', letterSpacing: '-0.02em' }}>
          3-step referral process
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {[
            {
              num: '1',
              title: 'Identify a candidate',
              desc: 'Look for someone who is committed, available, and motivated to work. They should be ready to engage — not just interested.',
              detail: 'Criteria: unemployed, underemployed, or career-changing. Committed to training and available to participate.',
              icon: 'person_search',
            },
            {
              num: '2',
              title: 'Send them to Apply',
              desc: 'Share your organization’s referral link above, or copy an outreach template below.',
              detail: 'Keep the referral code in the link. A general application link does not carry your organization’s attribution.',
              icon: 'open_in_new',
              link: { label: 'Open your attributed application link', href: referralApplyUrl },
            },
            {
              num: '3',
              title: 'Track their progress',
              desc: 'Referred members appear on your dashboard with stage updates as they move through the program.',
              detail: 'You\'ll see when they enroll, complete assessments, and reach hiring outcomes.',
              icon: 'monitoring',
              link: { label: 'View your dashboard', href: '/partner' },
            },
          ].map((step) => (
            <div key={step.num} style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start' }}>
              <div style={{
                width: '2.75rem',
                height: '2.75rem',
                borderRadius: '50%',
                background: 'var(--color-accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontSize: '0.875rem',
                fontWeight: 800,
                color: 'var(--color-on-accent)',
              }}>
                {step.num}
              </div>
              <div className="portal-card portal-card--flat" style={{ flex: 1, padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.5rem' }}>
                  <span className="material-symbols-outlined" style={{ color: 'var(--wa-accent-text)', fontSize: '1.125rem' }} aria-hidden="true">{step.icon}</span>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-on-surface)', letterSpacing: '-0.01em' }}>{step.title}</h3>
                </div>
                <p style={{ fontSize: '0.9375rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.6, marginBottom: '0.75rem' }}>
                  {step.desc}
                </p>
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.55, background: 'var(--surface-container-low)', padding: '0.75rem', borderRadius: '0.5rem', borderLeft: '3px solid color-mix(in srgb, var(--color-accent) 30%, transparent)' }}>
                  {step.detail}
                </p>
                {step.link && (
                  <Link href={step.link.href} style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.375rem',
                    marginTop: '0.875rem',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    color: 'var(--wa-accent-text)',
                    textDecoration: 'none',
                  }}>
                    {step.link.label}
                    <span className="material-symbols-outlined" style={{ fontSize: '0.875rem' }} aria-hidden="true">arrow_forward</span>
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <PartnerReferralResourcesSection partnerName={partnerName} referralApplyUrl={referralApplyUrl} />

      {/* Referral Impact */}
      <section style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--color-on-surface)', marginBottom: '1rem', letterSpacing: '-0.02em' }}>
          Your referral impact
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          {[
            { label: 'Members referred', value: totalReferred, icon: 'group_add' },
            { label: 'Completed assessment', value: assessmentCount, icon: 'assignment_turned_in' },
            { label: 'Placed in jobs', value: placedCount, icon: 'work' },
          ].map((stat) => (
            <div key={stat.label} className="portal-card portal-card--flat" style={{ padding: '1.5rem', textAlign: 'center' }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--wa-accent-text)', fontSize: '1.5rem', display: 'block', marginBottom: '0.75rem' }} aria-hidden="true">{stat.icon}</span>
              <p className="wa-tabular-nums" style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-on-surface)', letterSpacing: '-0.04em', lineHeight: 1, marginBottom: '0.375rem' }}>
                {stat.value}
              </p>
              <p style={{ fontSize: '0.8125rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-on-surface-variant)' }}>
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section style={{ marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--color-on-surface)', marginBottom: '1.25rem', letterSpacing: '-0.02em' }}>
          Common questions
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {FAQS.map((faq) => (
            <div key={faq.q} className="portal-card portal-card--flat" style={{ padding: '1.25rem' }}>
              <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--color-on-surface)', marginBottom: '0.5rem', letterSpacing: '-0.01em' }}>
                {faq.q}
              </h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.65 }}>
                {faq.a}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Contact */}
      <div style={{
        padding: '1.5rem 2rem',
        background: 'var(--surface-container-lowest)',
        border: '1px solid color-mix(in srgb, var(--outline-variant) 40%, transparent)',
        borderRadius: '0.875rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        flexWrap: 'wrap',
      }}>
        <span className="material-symbols-outlined" style={{ color: 'var(--wa-accent-text)', fontSize: '1.5rem', flexShrink: 0 }} aria-hidden="true">mail</span>
        <div>
          <p style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--color-on-surface)', marginBottom: '0.125rem' }}>Questions?</p>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
            Reach us at{' '}
            <a href="mailto:partnersupport@workforceap.org" style={{ color: 'var(--wa-accent-text)', fontWeight: 600, textDecoration: 'none' }}>
              partnersupport@workforceap.org
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
