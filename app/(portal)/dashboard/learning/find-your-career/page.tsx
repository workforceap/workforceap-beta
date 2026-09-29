import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import PageHeader from '@/components/portal/PageHeader';
import MobileBottomNav from '@/components/MobileBottomNav';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
  title: 'Find your career',
  description: 'O*NET Interest Profiler and O*NET skill mapping — choose how to explore careers.',
  path: '/dashboard/learning/find-your-career',
});
}

const TOOLS = [
  {
    href: '/dashboard/learning/interest-profiler',
    icon: 'explore',
    title: 'O*NET Interest Profiler',
    description: '30-question Mini-IP, RIASEC scores, and ties to WorkforceAP programs.',
    tip: 'Best if you are still exploring and want to discover what fits.',
  },
  {
    href: '/dashboard/ai-tools/skill-mapper',
    icon: 'radar',
    title: 'O*NET skill mapping',
    description: 'Explore occupation skills, competency charts, and gaps for a target role.',
    tip: 'Best if you already have a career in mind and want to see what it requires.',
  },
] as const;

export default async function FindYourCareerPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/learning/find-your-career');

  return (
    <>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '1.5rem 1.5rem 3rem' }}>
        <PageHeader
          title="Find your career"
          subtitle="Not sure where to start? Pick the path that fits right now."
          breadcrumbs={[
            { label: 'Member Portal', href: '/dashboard' },
            { label: 'Learning Hub', href: '/dashboard/learning' },
            { label: 'Find your career' },
          ]}
        />

        {/* Guidance callout */}
        <div
          className="portal-alert portal-alert--accent"
          style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '1.5rem' }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '1.25rem', color: 'var(--wa-accent-text)', flexShrink: 0, marginTop: '0.125rem' }}
           aria-hidden="true">
            lightbulb
          </span>
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--color-on-surface)', lineHeight: 1.5 }}>
            The <strong>Interest Profiler</strong> helps you discover what you enjoy (RIASEC model).{' '}
            <strong>Skill mapping</strong> shows what a specific occupation requires. Both connect back to
            WorkforceAP training programs.
          </p>
        </div>

        {/* Tool cards */}
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {TOOLS.map((tool) => (
            <li key={tool.href}>
              <Link
                href={tool.href}
                className="portal-card portal-card--flat hover:wa-bg-[var(--surface-container-low)] wa-transition-colors wa-duration-150"
                style={{
                  display: 'block',
                  padding: '1.25rem',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                  <span
                    className="material-symbols-outlined"
                    style={{ color: 'var(--wa-accent-text)', '--ms-fill': 1 }}
                    aria-hidden="true"
                  >
                    {tool.icon}
                  </span>
                  <strong style={{ fontSize: '1.05rem' }}>{tool.title}</strong>
                </div>
                <p style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.45 }}>
                  {tool.description}
                </p>
                <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--wa-accent-text)', fontWeight: 500 }}>
                  {tool.tip}
                </p>
              </Link>
            </li>
          ))}
        </ul>

        {/* Related resources */}
        <section style={{ marginTop: '2rem' }}>
          <h2
            style={{
              fontSize: '0.8125rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: 'var(--color-on-surface-variant)',
              marginBottom: '0.75rem',
            }}
          >
            Related resources
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {[
              { href: '/dashboard/learning', icon: 'school', label: 'Learning Hub', desc: 'All pathways and courses' },
              { href: '/dashboard/ai-tools', icon: 'auto_awesome', label: 'AI Career Tools', desc: 'Resume, interview prep, and more' },
              { href: '/dashboard/program', icon: 'trending_up', label: 'My Program', desc: 'Your enrolled program progress' },
            ].map((link) => (
              <Link key={link.href} href={link.href} className="portal-action-row" style={{ gap: '0.75rem' }}>
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: '1.125rem', color: 'var(--wa-accent-text)', '--ms-fill': 1 }}
                  aria-hidden="true"
                >
                  {link.icon}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="portal-action-row__title">{link.label}</p>
                  <p className="portal-action-row__desc">{link.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <p style={{ marginTop: '1.5rem', fontSize: '0.82rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.5 }}>
          O*NET Interest Profiler™ is a trademark of the U.S. Department of Labor. WorkforceAP uses O*NET Web Services under
          license for educational purposes.
        </p>
      </div>
      <MobileBottomNav variant="portal" />
    </>
  );
}
