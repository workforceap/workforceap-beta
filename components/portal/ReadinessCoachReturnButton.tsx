'use client';

import { useEffect, useState } from 'react';
import { Target } from 'lucide-react';
import { scrollBehavior } from '@/lib/a11y/scrollBehavior';

type ReadinessCoachReturnButtonProps = {
  targetId?: string;
};

export default function ReadinessCoachReturnButton({
  targetId = 'readiness-coach-panel',
}: ReadinessCoachReturnButtonProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 320);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() => {
        document.getElementById(targetId)?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
      }}
      aria-label="Jump back to readiness coach"
      className="md:wa-hidden"
      style={{
        position: 'fixed',
        right: '1rem',
        bottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))',
        zIndex: 55,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.45rem',
        minHeight: '2.75rem',
        padding: '0 0.95rem',
        borderRadius: '999px',
        border: '1px solid rgba(164, 127, 56, 0.32)',
        background: 'linear-gradient(135deg, var(--wa-hero-gold), var(--wa-hero-gold-dark))',
        color: 'var(--wa-on-hero)',
        fontSize: '0.82rem',
        fontWeight: 800,
        boxShadow: '0 14px 30px rgba(164, 127, 56, 0.28)',
      }}
    >
      <Target size={16} aria-hidden />
      Coach
    </button>
  );
}
