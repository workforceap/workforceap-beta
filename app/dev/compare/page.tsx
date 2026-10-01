import Link from 'next/link';
import { notFound } from 'next/navigation';

/**
 * Preview-only decision board — links to the three mock surfaces and the sign-off doc.
 * No DB. Hidden in production.
 */
export const dynamic = 'force-static';

const PREVIEW_BASE =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
  'https://workforceap-beta-git-feature-p-793c79-mabrown040-5207s-projects.vercel.app';

const LINKS = [
  {
    href: '/dev/dashboard',
    title: 'A — Target mock (no login)',
    body: 'Full member home with representative data: 78% AWS, jobs, streak. This is the visual north star.',
    cta: 'Open mock dashboard',
  },
  {
    href: '/dev/kit',
    title: 'B — Component kit',
    body: 'Every primitive in warm (member) and dense (staff) surfaces.',
    cta: 'Open design kit',
  },
  {
    href: '/en/dashboard',
    title: 'C — v2 is now the DEFAULT (login)',
    body: 'The kit is live by default on the portal — no flag needed. Sign in: demo-member@workforceap.org / Demo2026! · The member home has no old UI any more (?ui=legacy redirects to it).',
    cta: 'Open the live dashboard',
  },
] as const;

export default function DevComparePage() {
  if (process.env.VERCEL_ENV === 'production') notFound();

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#ad2c4d' }}>
        WAP 2.0 · Preview only
      </p>
      <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.03em', margin: '8px 0 12px' }}>
        Portal UI decision board
      </h1>
      <p style={{ color: '#555', lineHeight: 1.5, marginBottom: 28 }}>
        v2 is now the default across the portal on this preview (member, admin, employer, partner, counselor).
        Some staff pages keep their legacy UI behind <code>?ui=legacy</code>; the member home does not. Full write-up: <code>docs/PORTAL_UI_DECISION_MOCKUP.md</code>
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {LINKS.map((item) => (
          <section
            key={item.href}
            style={{
              border: '1px solid #e5e5e5',
              borderRadius: 16,
              padding: 20,
              background: '#fafafa',
            }}
          >
            <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 8px' }}>{item.title}</h2>
            <p style={{ fontSize: 14, color: '#444', margin: '0 0 14px', lineHeight: 1.45 }}>{item.body}</p>
            <Link
              href={item.href}
              style={{
                display: 'inline-block',
                padding: '10px 18px',
                background: '#ad2c4d',
                color: '#fff',
                fontWeight: 700,
                fontSize: 13,
                borderRadius: 999,
                textDecoration: 'none',
              }}
            >
              {item.cta}
            </Link>
          </section>
        ))}
      </div>

      <p style={{ marginTop: 32, fontSize: 13, color: '#888' }}>
        Mock screenshot: <Link href="/.qa/portal-mockup/wap2-member-dashboard.png">wap2-member-dashboard.png</Link>
        {' · '}
        Preview base: {PREVIEW_BASE}
      </p>
    </main>
  );
}
