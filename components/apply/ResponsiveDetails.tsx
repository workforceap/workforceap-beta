'use client';

import { useEffect, useRef, type DetailsHTMLAttributes, type ReactNode } from 'react';

/** Breakpoint the apply funnel already uses for its mobile layout (see OrganicApplyPage styles). */
export const APPLY_MOBILE_QUERY = '(max-width: 768px)';

type Props = DetailsHTMLAttributes<HTMLDetailsElement> & {
  /** Media query that decides when the disclosure starts collapsed. */
  mobileQuery?: string;
  children: ReactNode;
};

/**
 * A `<details>` that is collapsed on mobile and expanded everywhere else.
 *
 * The apply funnel renders "What happens next" and the documents checklist as
 * a `<details>` whose `<summary>` CSS hides at desktop widths and whose body
 * CSS forces `display: block`. That does not work: the contents of a closed
 * `<details>` are not rendered no matter what CSS the body carries, so the
 * desktop layout painted two empty bordered cards. Rendering `open` on the
 * server keeps desktop correct on first paint; the effect then collapses the
 * disclosure on mobile (where the card sits below the form, off the first
 * screen) and follows the breakpoint on resize. A viewer's own toggle is
 * left alone until the breakpoint changes.
 */
export default function ResponsiveDetails({ mobileQuery = APPLY_MOBILE_QUERY, children, ...rest }: Props) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(mobileQuery);
    const sync = () => {
      if (ref.current) ref.current.open = !mql.matches;
    };
    sync();
    mql.addEventListener('change', sync);
    return () => mql.removeEventListener('change', sync);
  }, [mobileQuery]);

  return (
    <details ref={ref} open {...rest}>
      {children}
    </details>
  );
}
