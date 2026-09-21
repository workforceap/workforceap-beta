import type { ReactNode } from 'react';
import { DesignSurface } from '@/components/portal/kit';

/**
 * Page frame for an admin sub-view kit that can also mount as a tab of a hub.
 *
 * Standalone (default) it is the dense `DesignSurface` around the kit's own
 * `PageOpener` (`opener`) and content — the kit still owns its h1, as
 * tests/app/portal-h1-ownership.spec.ts requires. `embedded` drops the
 * surface and the opener — the hub owns both — and keeps only the kit's
 * header `action` (period switcher, report link, roster nav) as a
 * right-aligned row above the content, so a tab never paints a second title
 * bar (docs/KIT_GUIDE.md, "PageOpener is never recut as a title bar").
 */
export interface EmbeddableFrameProps {
  /** Render without the page surface and opener (inside a hub tab). */
  embedded?: boolean;
  /** The kit's `<PageOpener>`; rendered only when standalone. */
  opener: ReactNode;
  /** The opener's action, repeated as a bare row when embedded. */
  action?: ReactNode;
  children: ReactNode;
}

export function EmbeddableFrame({ embedded = false, opener, action, children }: EmbeddableFrameProps) {
  if (embedded) {
    return (
      <div data-kit-embedded="">
        {action ? (
          <div className="wa-flex wa-flex-wrap wa-items-center wa-justify-end wa-gap-3 wa-mb-5">{action}</div>
        ) : null}
        {children}
      </div>
    );
  }
  return (
    <DesignSurface surface="dense" className="wa-p-6">
      {opener}
      {children}
    </DesignSurface>
  );
}
