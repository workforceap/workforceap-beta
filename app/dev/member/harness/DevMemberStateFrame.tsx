import type { ReactNode } from 'react';
import { DesignSurface, KitEmptyState, PageOpener } from '@/components/portal/kit';
import type { DevMemberState, DevMemberView } from './registry';

function StateCopy(view: DevMemberView, state: 'empty' | 'error' | 'first-time') {
  switch (state) {
    case 'empty':
      return {
        kind: 'filtered' as const,
        title: `No ${view.title.toLowerCase()} rows yet`,
        description: `Nothing is listed on ${view.title} for this example member. Later batches keep this empty state when they restyle the live page.`,
        action: { label: 'Back to Home', href: '/dev/member/v/home' },
      };
    case 'error':
      return {
        kind: 'unavailable' as const,
        tone: 'danger' as const,
        title: `${view.title} could not load`,
        description: 'The example request failed. Try again, or open Home and come back to this view.',
        action: { label: 'Try again', href: `/dev/member/v/${view.slug}` },
      };
    case 'first-time':
      return {
        kind: 'first' as const,
        title: `Welcome — start ${view.title.toLowerCase()}`,
        description: `A first-time member has not used ${view.title} yet. The next step is the first action on this path.`,
        action: { label: 'Start here', href: `/dev/member/v/${view.slug}` },
      };
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

export function DevMemberStateFrame({
  view,
  state,
  children,
}: {
  view: DevMemberView;
  state: DevMemberState;
  children: ReactNode;
}) {
  if (state === 'full') return <>{children}</>;

  if (state === 'loading') {
    return (
      <DesignSurface surface="warm">
        <div
          style={{ maxWidth: 760, margin: '0 auto', padding: 'var(--wa-pad-sm)' }}
          className="wa-space-y-5"
          aria-busy="true"
        >
          <PageOpener kicker={view.kicker} title={view.title} lede="Loading this example view." />
          <section className="wa-kit-card" role="status">
            <p className="wa-kit-lede" style={{ margin: 0 }}>
              Loading {view.title}…
            </p>
            <div
              aria-hidden="true"
              style={{
                marginTop: 16,
                height: 12,
                borderRadius: 999,
                background: 'var(--wa-track)',
              }}
            />
            <div
              aria-hidden="true"
              style={{
                marginTop: 10,
                height: 12,
                width: '70%',
                borderRadius: 999,
                background: 'var(--wa-track)',
              }}
            />
          </section>
        </div>
      </DesignSurface>
    );
  }

  const copy = StateCopy(view, state === 'empty' || state === 'error' || state === 'first-time' ? state : 'empty');
  return (
    <DesignSurface surface="warm">
      <div style={{ maxWidth: 760, margin: '0 auto', padding: 'var(--wa-pad-sm)' }} className="wa-space-y-5">
        <PageOpener kicker={view.kicker} title={view.title} lede={view.lede} />
        <KitEmptyState
          framed
          kind={copy.kind}
          tone={'tone' in copy ? copy.tone : undefined}
          headingAs="h2"
          title={copy.title}
          description={copy.description}
          primaryAction={copy.action}
        />
      </div>
    </DesignSurface>
  );
}
