import type { ReactNode } from 'react';

/** Serializable empty placeholder for listing and table shells. */
export function KitEmptyState({
  title,
  description,
  action,
  headingAs: Heading = 'h3',
}: {
  title: string;
  description?: string;
  /** Real next step — a kit CTA, never pep-talk. */
  action?: ReactNode;
  /** Match the surrounding outline; a page-level empty section follows h1 with h2. */
  headingAs?: 'h2' | 'h3' | 'h4';
}) {
  return (
    <div style={{ textAlign: 'left', padding: 0 }}>
      <Heading style={{ fontWeight: 800, fontSize: 'var(--wa-type-body)', letterSpacing: '-0.02em', margin: 0, color: 'var(--wa-text)' }}>
        {title}
      </Heading>
      {description ? (
        <p className="wa-kit-lede" style={{ marginTop: 6 }}>
          {description}
        </p>
      ) : null}
      {action ? <div style={{ marginTop: 16 }}>{action}</div> : null}
    </div>
  );
}
