import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { isAdmin, isCounselor } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('counselor');
  return buildPageMetadataAsync({
    title: t('counselorGuideMetaTitle'),
    description: t('counselorGuideMetaDesc'),
    path: '/counselor/guide',
  });
}

const CAPABILITIES = [
  { icon: 'monitoring', text: 'View member progress — enrollment stage, tools used, readiness score' },
  { icon: 'forum', text: 'Message members directly from your portal' },
  { icon: 'flag', text: 'Flag issues or escalate to program staff' },
  { icon: 'edit_note', text: 'Log session notes for each member' },
  { icon: 'verified', text: 'Mark milestones — interview completed, job offer, placement' },
];

const JOURNEY_STAGES = [
  { stage: 1, label: 'Profile complete', desc: 'Member has filled out profile, skills, and goals.' },
  { stage: 2, label: 'Assessment done', desc: 'Career readiness assessment completed.' },
  { stage: 3, label: 'Career tools used', desc: 'Resume rewritten, interview practiced.' },
  { stage: 4, label: 'Interview ready', desc: 'Passed mock interview, cleared for live interviews.' },
  { stage: 5, label: 'Active job search', desc: 'Applying to matched roles.' },
  { stage: 6, label: 'Placed', desc: 'Member has accepted an offer.', done: true },
];

const QUICK_ACTIONS = [
  { icon: 'forum', label: 'Message a member', href: '/counselor/messages' },
  { icon: 'edit_note', label: 'Log a session note', href: '/counselor/students' },
  { icon: 'warning', label: 'View flagged members', href: '/counselor/students' },
  { icon: 'group_add', label: 'View all members', href: '/counselor/students' },
];

const FAQS = [
  {
    q: 'Where should members check Coursera or course progress?',
    a: 'Send them to My Training (portal menu). That is the single training hub — course list, Coursera launches, and progress %. The Dashboard home page is an overview and links there; it does not replace My Training.',
  },
  {
    q: 'How do I get assigned new members?',
    a: 'New assignments are made by the WorkforceAP admin team. When a new member is assigned to you, you\'ll see them appear in your member roster. Reach out to program staff if you need to adjust your caseload.',
  },
  {
    q: 'Can I see what AI tools my members have used?',
    a: 'Yes — open any member\'s profile from your member list to see their tool history, assessment scores, and readiness stage.',
  },
  {
    q: 'How do I flag a member for additional support?',
    a: 'From a member\'s profile page, use the flag or escalate option. This notifies the WorkforceAP program staff that extra support is needed.',
  },
  {
    q: 'How do I mark a placement?',
    a: 'Open the member\'s profile and use the milestone tracking section to record a placement. Include the employer name and start date if available.',
  },
];

export default async function CounselorGuidePage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/counselor/guide');

  const allowed = (await isCounselor(user.id)) || (await isAdmin(user.id));
  if (!allowed) redirect('/dashboard');

  const t = await getTranslations('counselor');

  const counselor = await prisma.counselor.findFirst({
    where: { userId: user.id, active: true },
  });

  if (!counselor && !(await isAdmin(user.id))) redirect('/dashboard');

  const [totalAssigned, needsAttentionCount] = await Promise.all([
    counselor
      ? prisma.counselorAssignment.count({
          where: { counselor: { userId: user.id, active: true }, active: true },
        })
      : Promise.resolve(0),
    counselor
      ? prisma.counselorAssignment.count({
          where: {
            counselor: { userId: user.id, active: true },
            active: true,
            member: { enrolledProgram: null, programInterest: null },
          },
        })
      : Promise.resolve(0),
  ]);

  return (
    <>
    <div className="wa-pb-24 md:wa-pb-0" style={{ maxWidth: '64rem', margin: '0 auto' }}>
      {/* Breadcrumb */}
      <nav style={{ marginBottom: '1.5rem', marginTop: '0.5rem' }}>
        <Link href="/counselor" style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', textDecoration: 'none', fontWeight: 500 }}>
          ← Back to dashboard
        </Link>
      </nav>

      {/* Header */}
      <header style={{ marginBottom: '2.5rem' }}>
        <p style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-accent)', marginBottom: '0.5rem' }}>
          Counselor Guide
        </p>
        <h1 style={{ fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--color-on-surface)', marginBottom: '0.75rem', lineHeight: 1.15 }}>
          Your Counselor Portal
        </h1>
        <p style={{ fontSize: '1.0625rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.65, maxWidth: '42rem' }}>
          The tools to guide your members from enrollment to employment — everything you need, right here.
        </p>
      </header>

      {/* Live caseload box */}
      <section style={{ marginBottom: '2.5rem' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
        }}>
          <div className="portal-card portal-card--flat" style={{ padding: '1.5rem', borderLeft: '4px solid var(--color-accent)' }}>
            <p style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-on-surface-variant)', marginBottom: '0.5rem' }}>
              Members assigned
            </p>
            <p style={{ fontSize: '2.25rem', fontWeight: 800, color: 'var(--color-on-surface)', letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {totalAssigned}
            </p>
          </div>
          <div className="portal-card portal-card--flat" style={{ padding: '1.5rem', borderLeft: needsAttentionCount > 0 ? '4px solid var(--color-gold)' : '4px solid color-mix(in srgb, var(--outline-variant) 10%, transparent)' }}>
            <p style={{ fontSize: '0.8125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-on-surface-variant)', marginBottom: '0.5rem' }}>
              Need attention this week
            </p>
            <p style={{ fontSize: '2.25rem', fontWeight: 800, color: needsAttentionCount > 0 ? 'var(--color-gold)' : 'var(--color-on-surface)', letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {needsAttentionCount}
            </p>
          </div>
          <div className="portal-card portal-card--flat" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.75rem' }}>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.5 }}>
              View your full member roster to see where each member is in their journey.
            </p>
            <Link href="/counselor/students" style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.375rem',
              padding: '0.5625rem 1.125rem',
              background: 'var(--color-accent)',
              color: '#fff',
              borderRadius: '0.5rem',
              fontSize: '0.8125rem',
              fontWeight: 700,
              textDecoration: 'none',
              alignSelf: 'flex-start',
            }}>
              View your members
              <span className="material-symbols-outlined" style={{ fontSize: '0.875rem' }} aria-hidden="true">arrow_forward</span>
            </Link>
          </div>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', marginBottom: '2.5rem' }}>
        {/* What you can do */}
        <section className="portal-card portal-card--flat" style={{ padding: 'clamp(1.25rem, 4vw, 2rem)' }}>
          <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--color-on-surface)', marginBottom: '1.25rem', letterSpacing: '-0.02em' }}>
            What you can do here
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            {CAPABILITIES.map((item) => (
              <div key={item.text} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.875rem' }}>
                <div style={{
                  width: '2rem',
                  height: '2rem',
                  borderRadius: '0.5rem',
                  background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <span className="material-symbols-outlined" style={{ color: 'var(--color-accent)', fontSize: '1rem' }} aria-hidden="true">{item.icon}</span>
                </div>
                <p style={{ fontSize: '0.9375rem', color: 'var(--color-on-surface)', lineHeight: 1.5, paddingTop: '0.25rem' }}>{item.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Quick actions */}
        <section>
          <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--color-on-surface)', marginBottom: '1.25rem', letterSpacing: '-0.02em' }}>
            Quick actions
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {QUICK_ACTIONS.map((item) => (
              <Link key={item.label} href={item.href} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.875rem',
                padding: '1rem 1.125rem',
                background: 'var(--surface-container-lowest)',
                border: '1px solid color-mix(in srgb, var(--outline-variant) 8%, transparent)',
                borderRadius: '0.625rem',
                textDecoration: 'none',
              }}>
                <span className="material-symbols-outlined" style={{ color: 'var(--color-accent)', fontSize: '1.25rem' }} aria-hidden="true">{item.icon}</span>
                <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--color-on-surface)', flex: 1 }}>{item.label}</span>
                <span className="material-symbols-outlined" style={{ color: 'var(--color-on-surface-variant)', opacity: 0.4, fontSize: '1rem' }} aria-hidden="true">chevron_right</span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* Member Journey Reference */}
      <section className="portal-card portal-card--flat" style={{ padding: 'clamp(1.25rem, 4vw, 2rem)', marginBottom: '2.5rem' }}>
        <h2 style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--color-on-surface)', marginBottom: '0.5rem', letterSpacing: '-0.02em' }}>
          Member journey reference
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', marginBottom: '1.5rem', lineHeight: 1.55 }}>
          Members can be at any stage. Your job: move them forward.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.875rem' }}>
          {JOURNEY_STAGES.map((s) => (
            <div key={s.stage} style={{
              padding: '1rem',
              background: s.done ? 'color-mix(in srgb, var(--color-green) 8%, transparent)' : 'var(--surface-container-low)',
              border: s.done ? '1px solid color-mix(in srgb, var(--color-green) 25%, transparent)' : '1px solid color-mix(in srgb, var(--outline-variant) 6%, transparent)',
              borderRadius: '0.625rem',
              display: 'flex',
              gap: '0.75rem',
              alignItems: 'flex-start',
            }}>
              <div style={{
                width: '1.75rem',
                height: '1.75rem',
                borderRadius: '50%',
                background: s.done ? 'color-mix(in srgb, var(--color-green) 20%, transparent)' : 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontSize: '0.8125rem',
                fontWeight: 800,
                color: s.done ? 'var(--color-green)' : 'var(--color-accent)',
              }}>
                {s.done ? <span className="material-symbols-outlined" style={{ fontSize: '0.875rem' }} aria-hidden="true">check</span> : s.stage}
              </div>
              <div>
                <p style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-on-surface)', marginBottom: '0.25rem' }}>{s.label}</p>
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.5 }}>{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section>
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
    </div>
    </>
  );
}
