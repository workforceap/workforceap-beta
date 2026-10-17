import { DesignSurface, PageOpener } from '@/components/portal/kit';
import type { DevMemberView } from './registry';

/**
 * Current-look stub for views that do not yet have a direction-C kit.
 * Clean copy only — later batches replace this with the restyled surface.
 */
export function DevMemberCurrentUi({ view }: { view: DevMemberView }) {
  return (
    <DesignSurface surface="warm">
      <div style={{ maxWidth: 760, margin: '0 auto', padding: 'var(--wa-pad-sm)' }} className="wa-space-y-5">
        <PageOpener kicker={view.kicker} title={view.title} lede={view.lede} />
        <section className="wa-kit-card" data-dev-member-current-ui="">
          <h2 className="h-font" style={{ fontSize: 'var(--wa-type-body)', fontWeight: 800, margin: 0 }}>
            Current workspace view
          </h2>
          <p className="wa-kit-lede" style={{ marginTop: 8 }}>
            This harness holds the {view.title} route until a later batch restyles it.
            Example numbers stay aligned with Home, Jobs, and Program.
          </p>
          <p className="wa-kit-meta" style={{ marginTop: 12 }}>
            Live path: {view.livePath}
          </p>
        </section>
      </div>
    </DesignSurface>
  );
}
