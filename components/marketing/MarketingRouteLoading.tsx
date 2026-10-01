/**
 * Shared loading skeleton for public marketing routes (programs, find-your-path,
 * program-comparison, salary-guide, and program detail pages).
 *
 * Uses marketing-appropriate blocks — hero line, content cards, grid placeholders —
 * instead of the dashboard metric skeletons in PortalRouteLoading.
 */
export default function MarketingRouteLoading() {
  return (
    <div className="marketing-route-loading" aria-busy="true" aria-label="Loading">
      {/* Hero placeholder */}
      <div className="marketing-skeleton-stack" style={{ padding: 'clamp(2rem, 6vw, 5rem) 1.25rem 2rem', maxWidth: 1400, margin: '0 auto' }}>
        <div className="marketing-skeleton marketing-skeleton--pill" />
        <div className="marketing-skeleton marketing-skeleton--line marketing-skeleton--lg" />
        <div className="marketing-skeleton marketing-skeleton--line marketing-skeleton--md" />
        <div className="marketing-skeleton marketing-skeleton--line marketing-skeleton--short" />
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
          <div className="marketing-skeleton marketing-skeleton--btn" />
          <div className="marketing-skeleton marketing-skeleton--btn marketing-skeleton--btn-outline" />
        </div>
      </div>

      {/* Content cards placeholder */}
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 1.25rem 4rem' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1rem',
            marginBottom: '2rem',
          }}
        >
          <div className="marketing-skeleton marketing-skeleton--card" />
          <div className="marketing-skeleton marketing-skeleton--card" />
          <div className="marketing-skeleton marketing-skeleton--card" />
        </div>

        <div className="marketing-skeleton marketing-skeleton--block" />
        <div className="marketing-skeleton marketing-skeleton--block marketing-skeleton--short" />
      </div>

      <style>{`
        .marketing-route-loading {
          animation: marketing-skeleton-fade-in 0.25s ease;
        }
        @keyframes marketing-skeleton-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .marketing-skeleton {
          border-radius: var(--radius-lg, 0.75rem);
          background: linear-gradient(
            90deg,
            var(--surface-container-low) 25%,
            var(--surface-container) 50%,
            var(--surface-container-low) 75%
          );
          background-size: 200% 100%;
          animation: marketing-skeleton-shimmer 1.4s ease-in-out infinite;
        }
        html.dark .marketing-skeleton {
          background: linear-gradient(
            90deg,
            var(--surface-container-low) 25%,
            var(--surface-container) 50%,
            var(--surface-container-low) 75%
          );
          background-size: 200% 100%;
        }
        @keyframes marketing-skeleton-shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .marketing-skeleton--pill {
          width: 8rem;
          height: 1.75rem;
          border-radius: var(--radius-full, 999px);
          margin-bottom: 1rem;
        }
        .marketing-skeleton--line {
          height: 1rem;
          border-radius: var(--radius-sm, 0.375rem);
          margin-bottom: 0.75rem;
        }
        .marketing-skeleton--lg {
          width: 70%;
          height: 2.25rem;
          border-radius: var(--radius-md, 0.5rem);
        }
        .marketing-skeleton--md {
          width: 85%;
          height: 1.125rem;
        }
        .marketing-skeleton--short {
          width: 50%;
          height: 1rem;
        }
        .marketing-skeleton--btn {
          width: 10rem;
          height: 2.75rem;
          border-radius: var(--radius-md, 0.5rem);
        }
        .marketing-skeleton--btn-outline {
          width: 8rem;
          background: transparent;
          border: 2px solid var(--outline-variant, #d1d5db);
          animation: none;
        }
        html.dark .marketing-skeleton--btn-outline {
          border-color: var(--outline-variant, #4b5563);
        }
        .marketing-skeleton--card {
          height: 10rem;
          border-radius: var(--radius-xl, 0.875rem);
        }
        .marketing-skeleton--block {
          height: 14rem;
          border-radius: var(--radius-xl, 0.875rem);
          margin-bottom: 1.5rem;
        }
      `}</style>
    </div>
  );
}
