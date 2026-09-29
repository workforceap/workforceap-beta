import type { ReactNode } from 'react';
import type { CategoryTone } from '@/lib/marketing/categoryTone';

/**
 * Program category label on the partner pages styled by `css/enroll-school.css`
 * (`/join/<code>`, `/enroll/<school>`). The label is white text on a solid,
 * mode-constant fill, so `tone` is required: a bare `.cat-pill` once rendered
 * white text straight onto the pale program card on `/join`.
 */
export default function CategoryPill({ tone, children }: { tone: CategoryTone; children: ReactNode }) {
  return (
    <span className={`cat-pill cat--${tone}`} data-category-tone={tone}>
      {children}
    </span>
  );
}
