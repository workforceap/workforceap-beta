import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { unlinkedEmployerHref } from '@/lib/auth/portalGuards';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { getEmployerForUser } from '@/lib/auth/roles';
import EmployerPageOpener from '@/components/employer/EmployerPageOpener';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('employer');
  return buildPageMetadataAsync({
    title: t('employerGuideMetaTitle'),
    description: t('employerGuideMetaDesc'),
    path: '/employer/guide',
  });
}

const DIFFERENTIATORS = [
  'Completed career readiness training',
  'Practiced interviews with a coach',
  'Resume reviewed and optimized',
  'Assigned a counselor — supported through onboarding',
];

const QUICK_NAV = [
  { icon: 'post_add', label: 'Post a Job', href: '/employer/jobs/new' },
  { icon: 'group', label: 'Browse Pipeline', href: '/employer/pipeline' },
  { icon: 'inbox', label: 'View Applications', href: '/employer/applications' },
  { icon: 'bar_chart', label: 'Hiring Outcomes', href: '/employer' },
  { icon: 'settings', label: 'Settings', href: '/employer/settings' },
];

const FAQS = [
  {
    q: 'Is there a cost to post jobs?',
    a: 'No — posting jobs through WorkforceAP is offered at no cost to members. You only pay when you choose to participate in the 10% giveback after a successful hire.',
  },
  {
    q: "What's the 10% giveback?",
    a: "When you hire a WorkforceAP member, we invite you to give back 10% of their first-year salary to fund the next candidate's training. It's optional — not a fee — but it's how we keep the program at no cost to members.",
  },
  {
    q: 'How are candidates screened?',
    a: 'Every candidate completes a career readiness assessment, interview practice, and resume review before reaching you. Our team also reviews all candidates manually before adding them to your pipeline.',
  },
  {
    q: 'How long until I see candidates?',
    a: 'You can start seeing matched candidates within 1–2 business days of posting a role, depending on your location and requirements.',
  },
  {
    q: 'What industries do you serve?',
    a: 'We work across tech, healthcare, logistics, finance, and professional services. If you have specific hiring needs, reach out and we can talk through fit.',
  },
];

export default async function EmployerGuidePage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/employer/guide');

  const ctx = await getEmployerForUser(user.id);
  if (!ctx) redirect(await unlinkedEmployerHref(user.id));

  const t = await getTranslations('employer');

  return (
    <>
    <div className="wa-pb-24 md:wa-pb-0" style={{ maxWidth: '64rem', margin: '0 auto' }}>
      <EmployerPageOpener
        kicker={t('employerGuideTitle')}
        title={t('employerGuideHeadline')}
        subtitle={t('employerGuideBody')}
        action={
          <Link href="/employer" className="btn btn-outline btn-sm">
            {t('backToDashboard')}
          </Link>
        }
      />

      {/* 3-Step Flow */}
      <section style={{ marginBottom: '3.5rem' }}>
        <div className="employer-guide-steps">
          {[
            {
              num: '01',
              title: 'Post a Job',
              desc: 'Describe the role. We match it to qualified members who have already completed readiness training.',
              cta: 'Post a Job',
              href: '/employer/jobs/new',
              icon: 'post_add',
            },
            {
              num: '02',
              title: 'Review Candidates',
              desc: 'WorkforceAP pre-screens candidates before you see them. Every person in your pipeline has been assessed and coached.',
              cta: 'View Pipeline',
              href: '/employer/pipeline',
              icon: 'manage_accounts',
            },
            {
              num: '03',
              title: 'Hire & Give Back',
              desc: 'When you hire a WorkforceAP member, a 10% first-year salary giveback supports the program and trains the next candidate. No upfront cost.',
              cta: null,
              href: null,
              icon: 'handshake',
            },
          ].map((step, i) => (
            <div key={step.num} className="portal-card portal-card--flat" style={{ padding: '2rem', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: '1rem', right: '1.25rem', fontSize: '3.5rem', fontWeight: 900, color: 'var(--color-accent)', opacity: 0.06, lineHeight: 1, letterSpacing: '-0.05em', userSelect: 'none' }}>
                {step.num}
              </div>
              <div style={{
                width: '2.75rem',
                height: '2.75rem',
                borderRadius: '0.75rem',
                background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '1.25rem',
              }}>
                <span className="material-symbols-outlined" style={{ color: 'var(--color-accent)', fontSize: '1.25rem' }} aria-hidden="true">{step.icon}</span>
              </div>
              <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--color-on-surface)', marginBottom: '0.625rem', letterSpacing: '-0.02em' }}>
                {step.title}
              </h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.65, marginBottom: step.cta ? '1.25rem' : 0 }}>
                {step.desc}
              </p>
              {step.cta && step.href && (
                <Link
                  href={step.href}
                  className="hover:wa-opacity-90 active:wa-scale-[0.98] wa-transition-[opacity,transform] motion-reduce:wa-transition-none"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.375rem',
                    padding: '0.5625rem 1.125rem',
                    background: 'var(--color-accent)',
                    color: 'var(--color-on-accent)',
                    borderRadius: '0.5rem',
                    fontSize: '0.8125rem',
                    fontWeight: 700,
                    textDecoration: 'none',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {step.cta}
                  <span className="material-symbols-outlined" style={{ fontSize: '0.875rem' }} aria-hidden="true">arrow_forward</span>
                </Link>
              )}
              {i === 2 && (
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', fontStyle: 'italic', marginTop: '0.75rem' }}>
                  Optional but appreciated — it funds the next candidate's training.
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', marginBottom: '3.5rem' }}>
        {/* Candidate differentiators */}
        <section className="portal-card portal-card--flat" style={{ padding: '2rem' }}>
          <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--color-on-surface)', marginBottom: '1.25rem', letterSpacing: '-0.02em' }}>
            What sets WorkforceAP candidates apart
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            {DIFFERENTIATORS.map((item) => (
              <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.875rem' }}>
                <div style={{
                  width: '1.5rem',
                  height: '1.5rem',
                  borderRadius: '50%',
                  background: 'color-mix(in srgb, var(--color-green) 15%, transparent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: '0.125rem',
                }}>
                  <span className="material-symbols-outlined" style={{ color: 'var(--color-green)', fontSize: '0.875rem' }} aria-hidden="true">check</span>
                </div>
                <p style={{ fontSize: '0.9375rem', color: 'var(--color-on-surface)', lineHeight: 1.5 }}>{item}</p>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '1.75rem', paddingTop: '1.5rem', borderTop: '1px solid color-mix(in srgb, var(--outline-variant) 12%, transparent)' }}>
            <Link
              href="/employer/jobs/new"
              className="hover:wa-opacity-90 active:wa-scale-[0.98] wa-transition-[opacity,transform] motion-reduce:wa-transition-none"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '0.75rem',
                background: 'linear-gradient(135deg, var(--color-accent), #670024)',
                color: 'var(--color-on-accent)',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: 700,
                textDecoration: 'none',
                boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '1rem' }} aria-hidden="true">post_add</span>
              Post your first job
            </Link>
          </div>
        </section>

        {/* Quick nav */}
        <section>
          <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--color-on-surface)', marginBottom: '1.25rem', letterSpacing: '-0.02em' }}>
            Your portal
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {QUICK_NAV.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="hover:wa-bg-[var(--surface-container-low)] wa-transition-colors wa-duration-150 motion-reduce:wa-transition-none"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '1rem 1.125rem',
                  background: 'var(--surface-container-lowest)',
                  border: '1px solid color-mix(in srgb, var(--outline-variant) 12%, transparent)',
                  borderRadius: '0.625rem',
                  textDecoration: 'none',
                }}
              >
                <span className="material-symbols-outlined" style={{ color: 'var(--color-accent)', fontSize: '1.25rem' }} aria-hidden="true">{item.icon}</span>
                <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--color-on-surface)', flex: 1 }}>{item.label}</span>
                <span className="material-symbols-outlined" style={{ color: 'var(--color-on-surface-variant)', opacity: 0.4, fontSize: '1rem' }} aria-hidden="true">chevron_right</span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* FAQ */}
      <section style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--color-on-surface)', marginBottom: '1.25rem', letterSpacing: '-0.02em' }}>
          Common questions
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))', gap: '1rem' }}>
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

      {/* Contact CTA */}
      <div style={{
        padding: '2rem',
        background: 'var(--surface-container-lowest)',
        border: '1px solid color-mix(in srgb, var(--outline-variant) 14%, transparent)',
        borderRadius: '0.875rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
      }}>
        <div>
          <p style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-on-surface)', marginBottom: '0.25rem' }}>
            Have questions? We're here.
          </p>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)' }}>
            Email us at{' '}
            <a href="mailto:partnerships@workforceap.org" style={{ color: 'var(--color-accent)', fontWeight: 600, textDecoration: 'none' }}>
              partnerships@workforceap.org
            </a>
          </p>
        </div>
        <Link
          href="/employer/jobs/new"
          className="hover:wa-opacity-90 active:wa-scale-[0.98] wa-transition-[opacity,transform] motion-reduce:wa-transition-none"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.375rem',
            padding: '0.625rem 1.25rem',
            background: 'var(--color-accent)',
            color: 'var(--color-on-accent)',
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
            fontWeight: 700,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Post a job
          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }} aria-hidden="true">arrow_forward</span>
        </Link>
      </div>
    </div>
    </>
  );
}
