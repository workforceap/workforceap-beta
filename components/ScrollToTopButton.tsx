'use client';

import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { scrollBehavior } from '@/lib/a11y/scrollBehavior';

/**
 * Floating scroll-to-top button — appears bottom-right after scrolling
 * past 400px, hides near the top. Smooth scroll on click.
 */
export default function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: scrollBehavior() })}
      className="scroll-to-top-btn"
      aria-label="Scroll to top"
    >
      <ArrowUp size={20} aria-hidden="true" />

      <style>{`
        .scroll-to-top-btn {
          position: fixed;
          bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px));
          right: 1rem;
          z-index: 50;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          border: 1px solid var(--outline-variant, #d4d4d4);
          background: color-mix(in srgb, var(--surface-container-high) 92%, transparent);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          color: var(--color-on-surface, #1a1a1a);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
          transition: transform 0.2s ease, opacity 0.2s ease;
          animation: scroll-top-fade-in 0.2s ease;
        }

        .scroll-to-top-btn:hover {
          transform: scale(1.1);
          background: var(--color-accent, #ad2c4d);
          color: #fff;
          border-color: var(--color-accent, #ad2c4d);
        }

        .scroll-to-top-btn:active {
          transform: scale(0.95);
        }

        @keyframes scroll-top-fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* On desktop (no bottom nav), pull closer to bottom edge */
        @media (min-width: 768px) {
          .scroll-to-top-btn {
            bottom: calc(1.5rem + env(safe-area-inset-bottom, 0px));
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .scroll-to-top-btn { animation: none; transition: none; }
        }
      `}</style>
    </button>
  );
}
