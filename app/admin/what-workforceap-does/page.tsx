import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant, withAdminPageScope, inheritUserOrg, inheritMemberOrg, inheritLeaderOrg, inheritInvitedByOrg } from '@/lib/tenant/adminPageScope';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import PageHeader from '@/components/portal/PageHeader';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'What WorkforceAP does',
    description: 'Private admin explainer for how WorkforceAP works across job seekers, employers, boards, and AI tools.',
    path: '/admin/what-workforceap-does',
  });
}

const personaCards = [
  {
    title: 'Job seekers',
    icon: 'person',
    bullets: [
      'Find a path into training, certifications, and real jobs.',
      'Get help with intake, readiness, resumes, interview prep, and next steps.',
      'Stay supported from first application through placement and follow-up.',
    ],
  },
  {
    title: 'Employers',
    icon: 'business',
    bullets: [
      'Post roles, review candidates, and build talent pipelines faster.',
      'See aligned candidates instead of sorting unstructured applications manually.',
      'Support screening, placements, apprenticeships, and follow-through.',
    ],
  },
  {
    title: 'Boards, partners, and admins',
    icon: 'dashboard',
    bullets: [
      'Track members, training progress, outcomes, and partner activity in one place.',
      'Coordinate counselors, subgroups, employers, and program operations.',
      'Use reporting and workflow tools without jumping between disconnected systems.',
    ],
  },
];

const aiTools = [
  ['AI intake support', 'Guides users through questions, routing, and first-step recommendations.'],
  ['Career guidance', 'Helps members explore programs, roles, and likely next actions.'],
  ['Resume and interview prep', 'Accelerates readiness work before human review.'],
  ['Matching and prioritization', 'Surfaces likely fits for jobs, programs, and counselor follow-up.'],
  ['Admin copilot', 'Supports summaries, next-step drafting, and operational visibility.'],
  ['Reporting acceleration', 'Turns activity and outcome data into usable updates faster.'],
];

const adminFlows = [
  'Student applies or is referred into WorkforceAP.',
  'Admin or counselor reviews readiness, funding fit, and program path.',
  'Member progresses through training, milestones, and support touchpoints.',
  'Employer demand and candidate supply get matched inside the same system.',
  'Placements, follow-up, and outcomes are recorded for reporting and learning.',
];

export default async function AdminWhatWorkforceApDoesPage() {
  const user = await getUser();
  if (!user) redirect('/login');

  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  return (
    <PortalPageFrame>
      <PageHeader
        title="What WorkforceAP does"
        subtitle="Private admin explainer you can use in meetings, partner calls, and internal walkthroughs."
        action={
          <Link
            href="/admin/overview"
            style={{
              fontSize: '0.85rem',
              fontWeight: 600,
              color: 'var(--color-on-surface-variant)',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            Back to overview →
          </Link>
        }
      />

      <section style={{ padding: '0 1.5rem 1.25rem' }}>
        <div
          className="portal-card"
          style={{
            padding: '1.5rem',
            background: 'linear-gradient(135deg, rgba(122,31,54,0.18), rgba(17,24,39,0.96))',
            border: '1px solid rgba(244,114,182,0.18)',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
            <span className="portal-chip" style={{ background: 'rgba(255,255,255,0.08)' }}>Gated admin page</span>
            <span className="portal-chip" style={{ background: 'rgba(255,255,255,0.08)' }}>Meeting-ready</span>
            <span className="portal-chip" style={{ background: 'rgba(255,255,255,0.08)' }}>Simple share surface</span>
          </div>
          <h2 style={{ margin: 0, fontSize: '1.6rem', lineHeight: 1.15 }}>WorkforceAP connects people, programs, employers, and outcomes in one operating system.</h2>
          <p style={{ margin: '0.85rem 0 0', color: 'var(--color-on-surface-variant)', maxWidth: '70ch', lineHeight: 1.65 }}>
            Use this page when someone asks what WorkforceAP actually does. It explains the member journey, the employer side,
            the admin side, and where AI creates leverage without replacing staff judgment.
          </p>
        </div>
      </section>

      <section style={{ padding: '0 1.5rem 1.5rem' }}>
        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <a href="#personas" className="portal-card portal-card--flat" style={{ padding: '1rem 1.1rem', textDecoration: 'none', color: 'inherit' }}>
            <div style={{ fontWeight: 700 }}>Overview</div>
            <div style={{ color: 'var(--color-on-surface-variant)', marginTop: '0.3rem' }}>Who it serves and why it exists.</div>
          </a>
          <a href="#ai-layer" className="portal-card portal-card--flat" style={{ padding: '1rem 1.1rem', textDecoration: 'none', color: 'inherit' }}>
            <div style={{ fontWeight: 700 }}>AI layer</div>
            <div style={{ color: 'var(--color-on-surface-variant)', marginTop: '0.3rem' }}>Where automation helps and where humans stay in control.</div>
          </a>
          <a href="#admin-flow" className="portal-card portal-card--flat" style={{ padding: '1rem 1.1rem', textDecoration: 'none', color: 'inherit' }}>
            <div style={{ fontWeight: 700 }}>Admin flow</div>
            <div style={{ color: 'var(--color-on-surface-variant)', marginTop: '0.3rem' }}>How the system works in the background.</div>
          </a>
        </div>
      </section>

      <section id="personas" style={{ padding: '0 1.5rem 1.5rem' }}>
        <div style={{ marginBottom: '0.9rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Who WorkforceAP serves</h2>
          <p style={{ margin: '0.4rem 0 0', color: 'var(--color-on-surface-variant)' }}>
            One platform, three operating views.
          </p>
        </div>
        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {personaCards.map((card) => (
            <article key={card.title} className="portal-card" style={{ padding: '1.2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.75rem' }}>
                <span className="material-symbols-outlined" aria-hidden style={{ color: 'var(--wa-accent-text)' }}>{card.icon}</span>
                <h3 style={{ margin: 0, fontSize: '1.05rem' }}>{card.title}</h3>
              </div>
              <ul style={{ margin: 0, paddingLeft: '1.1rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.65 }}>
                {card.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section style={{ padding: '0 1.5rem 1.5rem' }}>
        <div className="portal-card" style={{ padding: '1.25rem' }}>
          <h2 style={{ marginTop: 0, fontSize: '1.25rem' }}>What makes it useful</h2>
          <div style={{ display: 'grid', gap: '0.9rem', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
            {[
              ['One record of the journey', 'Applications, training, placements, and follow-up live together.'],
              ['Faster staff execution', 'Less copying between systems, more time on member support and employer relationships.'],
              ['Better employer coordination', 'Demand signals and candidate readiness are visible in the same workflow.'],
              ['Clearer outcome reporting', 'Leaders can explain what is happening and what is working with less manual assembly.'],
            ].map(([title, copy]) => (
              <div key={title} className="portal-card portal-card--flat" style={{ padding: '1rem' }}>
                <div style={{ fontWeight: 700, marginBottom: '0.4rem' }}>{title}</div>
                <div style={{ color: 'var(--color-on-surface-variant)', lineHeight: 1.6 }}>{copy}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="ai-layer" style={{ padding: '0 1.5rem 1.5rem' }}>
        <div className="portal-card" style={{ padding: '1.25rem' }}>
          <h2 style={{ marginTop: 0, fontSize: '1.25rem' }}>AI tools and value add</h2>
          <p style={{ color: 'var(--color-on-surface-variant)', lineHeight: 1.6, marginTop: 0 }}>
            AI should speed up the work, improve consistency, and surface better next steps. Staff still own judgment,
            approvals, relationships, and high-trust decisions.
          </p>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {aiTools.map(([title, copy]) => (
              <div key={title} className="portal-card portal-card--flat" style={{ padding: '0.95rem 1rem' }}>
                <div style={{ fontWeight: 700 }}>{title}</div>
                <div style={{ color: 'var(--color-on-surface-variant)', marginTop: '0.25rem', lineHeight: 1.6 }}>{copy}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="admin-flow" style={{ padding: '0 1.5rem 1.5rem' }}>
        <div className="portal-card" style={{ padding: '1.25rem' }}>
          <h2 style={{ marginTop: 0, fontSize: '1.25rem' }}>How it flows in the background</h2>
          <div style={{ display: 'grid', gap: '0.85rem' }}>
            {adminFlows.map((step, index) => (
              <div key={step} className="portal-card portal-card--flat" style={{ padding: '0.95rem 1rem', display: 'flex', gap: '0.9rem', alignItems: 'flex-start' }}>
                <div style={{ minWidth: 28, height: 28, borderRadius: 999, background: 'var(--color-accent)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: '0.85rem' }}>
                  {index + 1}
                </div>
                <div style={{ lineHeight: 1.6 }}>{step}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: '0 1.5rem 1.75rem' }}>
        <div className="portal-card" style={{ padding: '1.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Use this in the meeting</h2>
            <p style={{ margin: '0.35rem 0 0', color: 'var(--color-on-surface-variant)' }}>
              Keep this page gated inside admin, then walk from the overview into the specific admin surfaces when needed.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
            <Link href="/admin/overview" className="btn btn-muted">Admin overview</Link>
            <Link href="/admin/ai-tools" className="btn btn-accent">AI tools</Link>
          </div>
        </div>
      </section>
    </PortalPageFrame>
  );
}
