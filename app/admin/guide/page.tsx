import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import { resolveAdminPageTenant } from '@/lib/tenant/adminPageScope';
import PortalPageFrame from '@/components/portal/PortalPageFrame';
import PageHeader from '@/components/portal/PageHeader';

/**
 * /admin/guide — the admin counterpart of /counselor/guide: what the admin
 * workspace is for, where each part of it lives, and the questions staff ask
 * in their first week. Static copy; the live numbers stay on the pages that
 * own them (Command Center, Detailed overview) so this page never disagrees
 * with them. `AdminPortalShell` links here from the header Help menu
 * (`ADMIN_GUIDE_HREF`), the way `CounselorPortalShell` does for
 * /counselor/guide.
 */

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'Admin workspace guide',
    description: 'How the WorkforceAP admin workspace fits together: Command Center, Detailed overview, Students, Programs, Training progress, Messages, and Settings.',
    path: '/admin/guide',
  });
}

const CAPABILITIES = [
  { icon: 'bolt', text: 'Work today’s queue — decisions waiting on staff, members going quiet, threads without a reply' },
  { icon: 'groups', text: 'Open any student record — program, funding eligibility, placement, messages, notes, and activity in one place' },
  { icon: 'person_add', text: 'Assign counselors, partners, and subgroups so the right people see the right members' },
  { icon: 'school', text: 'Follow training course by course and see what Coursera has reported' },
  { icon: 'forum', text: 'Reply to member, employer, and partner conversations, or hand a thread to a colleague' },
  { icon: 'monitoring', text: 'Read the organization’s numbers with the rule behind each count shown next to it' },
];

const WORKSPACE = [
  {
    href: '/admin',
    icon: 'bolt',
    label: 'Command Center',
    desc: 'Where the day starts. What needs a decision, who is stuck, and the health rows a human should look at, ranked by urgency.',
  },
  {
    href: '/admin/overview',
    icon: 'monitoring',
    label: 'Detailed overview',
    desc: 'The organization’s numbers over a date range — enrollment, training, placements — with the definition behind each tile.',
  },
  {
    href: '/admin/students',
    icon: 'groups',
    label: 'Students',
    desc: 'The roster. Search, filter by status or risk, export, and open a member’s record to change assignments or program.',
  },
  {
    href: '/admin/programs',
    icon: 'menu_book',
    label: 'Programs',
    desc: 'The program catalog: each program’s syllabus, who is enrolled, and pending program change requests.',
  },
  {
    href: '/admin/training-progress',
    icon: 'table_chart',
    label: 'Training progress',
    desc: 'Course-by-course progress per member, stale activity, and the last time each learner’s provider reported in.',
  },
  {
    href: '/admin/messages',
    icon: 'forum',
    label: 'Messages',
    desc: 'Every conversation with staff — members, employers, partners — with the ones waiting on a reply first. Super admins only.',
  },
  {
    href: '/admin/settings',
    icon: 'settings',
    label: 'Settings',
    desc: 'Organization branding, users and roles, feature flags, and integrations. Super admins only.',
  },
];

const QUICK_ACTIONS = [
  { icon: 'search', label: 'Find a student record', href: '/admin/students' },
  { icon: 'forum', label: 'Answer a waiting message', href: '/admin/messages' },
  { icon: 'swap_horiz', label: 'Review a program change request', href: '/admin/program-change-requests' },
  { icon: 'table_chart', label: 'Check who has gone quiet in training', href: '/admin/training-progress' },
];

const FAQS = [
  {
    q: 'Where do I assign a counselor, partner, or subgroup?',
    a: 'Open the member from Students. The Overview tab of the record has a card for each: Counselor assignment, Partner assignment, and Subgroup assignment. Changes save immediately and show on the counselor’s roster.',
  },
  {
    q: 'Why does a number on Command Center differ from Detailed overview?',
    a: 'Command Center counts what needs action today. Detailed overview counts the whole organization over the date range you pick. Each tile shows the rule it counts, so compare the rules before comparing the numbers.',
  },
  {
    q: 'How do I find members who are falling behind?',
    a: 'Students has a risk filter for members with an open risk alert. Training progress shows who has not had course activity recently. Both open the same member record.',
  },
  {
    q: 'Where is a member’s conversation with their counselor?',
    a: 'On the member record, the Messages tab shows the counselor thread. Messages, in the sidebar, shows every conversation across the organization with the ones waiting on staff first; like Settings, it is limited to super admins.',
  },
  {
    q: 'Who can change settings?',
    a: 'Settings, Messages, and the other advanced pages are limited to super admins. Organization admins work the student and program pages, and each member\u2019s conversation from the Messages tab of their record.',
  },
];

export default async function AdminGuidePage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/admin/guide');

  const scope = await resolveAdminPageTenant(user.id);
  if (!scope.ok) redirect('/dashboard');

  return (
    <PortalPageFrame maxWidth="64rem">
      <PageHeader
        title="Your admin workspace"
        subtitle="What each part of the workspace is for, and where to go for the work in front of you."
        action={
          <Link href="/admin" className="btn btn-outline btn-sm">
            Back to Command Center
          </Link>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem', marginBottom: '2.5rem' }}>
        {/* What you can do */}
        <section className="portal-card portal-card--flat" style={{ padding: 'clamp(1.25rem, 4vw, 2rem)' }} aria-labelledby="admin-guide-capabilities">
          <h2 id="admin-guide-capabilities" style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--color-on-surface)', marginBottom: '1.25rem', letterSpacing: '-0.02em' }}>
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
                  <span className="material-symbols-outlined" style={{ color: 'var(--wa-accent-text)', fontSize: '1rem' }} aria-hidden="true">{item.icon}</span>
                </div>
                <p style={{ fontSize: '0.9375rem', color: 'var(--color-on-surface)', lineHeight: 1.5, paddingTop: '0.25rem' }}>{item.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Quick actions */}
        <section aria-labelledby="admin-guide-quick-actions">
          <h2 id="admin-guide-quick-actions" style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--color-on-surface)', marginBottom: '1.25rem', letterSpacing: '-0.02em' }}>
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
                <span className="material-symbols-outlined" style={{ color: 'var(--wa-accent-text)', fontSize: '1.25rem' }} aria-hidden="true">{item.icon}</span>
                <span style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--color-on-surface)', flex: 1 }}>{item.label}</span>
                <span className="material-symbols-outlined" style={{ color: 'var(--color-on-surface-variant)', opacity: 0.4, fontSize: '1rem' }} aria-hidden="true">chevron_right</span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* Workspace map */}
      <section className="portal-card portal-card--flat" style={{ padding: 'clamp(1.25rem, 4vw, 2rem)', marginBottom: '2.5rem' }} aria-labelledby="admin-guide-workspace">
        <h2 id="admin-guide-workspace" style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--color-on-surface)', marginBottom: '0.5rem', letterSpacing: '-0.02em' }}>
          The workspace, part by part
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', marginBottom: '1.5rem', lineHeight: 1.55 }}>
          Seven places, in the order the sidebar lists them. Each one owns its own numbers.
        </p>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.875rem' }}>
          {WORKSPACE.map((area, index) => (
            <li key={area.href} style={{
              padding: '1rem',
              background: 'var(--surface-container-low)',
              border: '1px solid color-mix(in srgb, var(--outline-variant) 6%, transparent)',
              borderRadius: '0.625rem',
              display: 'flex',
              gap: '0.75rem',
              alignItems: 'flex-start',
            }}>
              <div style={{
                width: '1.75rem',
                height: '1.75rem',
                borderRadius: '50%',
                background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontSize: '0.8125rem',
                fontWeight: 800,
                color: 'var(--wa-accent-text)',
              }} aria-hidden="true">
                {index + 1}
              </div>
              <div style={{ minWidth: 0 }}>
                <Link href={area.href} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-on-surface)', marginBottom: '0.25rem', textDecoration: 'none' }}>
                  <span className="material-symbols-outlined" style={{ color: 'var(--wa-accent-text)', fontSize: '1rem' }} aria-hidden="true">{area.icon}</span>
                  {area.label}
                </Link>
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.5, margin: 0 }}>{area.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* FAQ */}
      <section aria-labelledby="admin-guide-faq">
        <h2 id="admin-guide-faq" style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--color-on-surface)', marginBottom: '1.25rem', letterSpacing: '-0.02em' }}>
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
    </PortalPageFrame>
  );
}
