import Link from 'next/link';
import { DesignSurface, PageOpener } from '@/components/portal/kit';
import { assertDevMemberPreview } from '@/app/dev/member/harness/assertDevMemberPreview';
import { DEV_MEMBER_STATES, DEV_MEMBER_VIEWS, harnessPath } from '@/app/dev/member/harness/registry';

export const dynamic = 'force-dynamic';

/** Index of every inventory member view in the B0 harness. */
export default function DevMemberHarnessIndexPage() {
  assertDevMemberPreview();
  return (
    <DesignSurface surface="warm">
      <div style={{ maxWidth: 860, margin: '0 auto', padding: 'var(--wa-pad-sm)' }} className="wa-space-y-5">
        <PageOpener
          kicker="Safety net"
          title="Member harness"
          lede="Credential-free proofs for every member view. Pick a state with the query string."
        />
        <ol className="wa-space-y-3" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {DEV_MEMBER_VIEWS.map((view) => (
            <li key={view.slug} className="wa-kit-card">
              <h2 className="h-font" style={{ fontSize: 'var(--wa-type-body)', fontWeight: 800, margin: 0 }}>
                <Link href={harnessPath(view.slug)} className="wa-kit-focus">
                  {view.title}
                </Link>
              </h2>
              <p className="wa-kit-meta" style={{ marginTop: 6 }}>
                {view.livePath} · {view.kind}
              </p>
              <p style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {DEV_MEMBER_STATES.map((state) => (
                  <Link key={state} href={harnessPath(view.slug, state)} className="wa-page-action wa-kit-focus">
                    {state}
                  </Link>
                ))}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </DesignSurface>
  );
}
