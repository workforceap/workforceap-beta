'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useCurrentUser } from '@/hooks/useCurrentUser';

const STORAGE_KEY = 'dev_view_mode';

export default function DevViewToggle({ knownIsAdmin }: { knownIsAdmin?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  // The admin layout already resolved the effective role. Other callers retain
  // the shared browser snapshot until they can supply the same server fact.
  const { user } = useCurrentUser({ enabled: knownIsAdmin === undefined });
  const isAdmin = knownIsAdmin ?? (user?.role === 'admin');
  const [mode, setMode] = useState<'student' | 'admin'>('student');

  useEffect(() => {
    if (!isAdmin) return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as 'student' | 'admin' | null;
      if (stored) setMode(stored);
    } catch {
      /* storage unavailable — keep the default */
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    const onStorage = () => {
      const stored = localStorage.getItem(STORAGE_KEY) as 'student' | 'admin' | null;
      if (stored) setMode(stored);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [isAdmin]);

  const handleToggle = (newMode: 'student' | 'admin') => {
    if (!isAdmin) return;
    localStorage.setItem(STORAGE_KEY, newMode);
    setMode(newMode);
    if (newMode === 'admin' && pathname?.startsWith('/dashboard')) {
      router.push('/admin');
    } else if (newMode === 'student' && pathname?.startsWith('/admin')) {
      router.push('/dashboard');
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="dev-view-toggle">
      <button
        type="button"
        aria-pressed={mode === 'student'}
        onClick={() => handleToggle('student')}
        style={{
          padding: '0.35rem 0.6rem',
          fontSize: '0.8125rem',
          border: mode === 'student' ? '2px solid var(--color-accent)' : '1px solid var(--outline-variant)',
          borderRadius: '4px',
          background: mode === 'student' ? 'rgba(74, 155, 79, 0.1)' : 'transparent',
          cursor: 'pointer',
        }}
      >
        Member View
      </button>
      <button
        type="button"
        aria-pressed={mode === 'admin'}
        onClick={() => handleToggle('admin')}
        style={{
          padding: '0.35rem 0.6rem',
          fontSize: '0.8125rem',
          border: mode === 'admin' ? '2px solid var(--color-accent)' : '1px solid var(--outline-variant)',
          borderRadius: '4px',
          background: mode === 'admin' ? 'rgba(74, 155, 79, 0.1)' : 'transparent',
          cursor: 'pointer',
        }}
      >
        Admin View
      </button>
    </div>
  );
}
