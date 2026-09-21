import type { ReactNode } from 'react';
import { DesignSurface, PageOpener } from '@/components/portal/kit';

/**
 * Page frame for an admin sub-view kit that can also mount as a tab of a hub.
 *
 * Standalone (default) it is the dense `DesignSurface` + `PageOpener` every
 * admin kit opened with. `embedded` drops both — the hub owns the surface and
 * the single h1 — and keeps only the kit's header action (period switcher,
 * report link, roster nav) as a right-aligned row above the content, so a tab
 * never paints a second title bar (docs/KIT_GUIDE.md, "PageOpener is never
 * recut as a title bar").
 */
export interface EmbeddableFrameProps {
  /** Render without the page surface and opener (inside a hub tab). */
  embedded?: boolean;
  kicker: string;
  title: string;
  lede?: string;
  action?: ReactNode;
  children: ReactNode;
}

export function EmbeddableFrame({ embedded = false, kicker, title, lede, action, children }: EmbeddableFrameProps) {
  if (embedded) {
    return (
      <div data-kit-embedded="" aria-label={title}>
        {action ? (
          <div className="wa-flex wa-flex-wrap wa-items-center wa-justify-end wa-gap-3 wa-mb-5">{action}</div>
        ) : null}
        {children}
      </div>
    );
  }
  return (
    <DesignSurface surface="dense" className="wa-p-6">
      <PageOpener className="wa-mb-5" title={title} kicker={kicker} lede={lede} action={action} />
      {children}
    </DesignSurface>
  );
}
