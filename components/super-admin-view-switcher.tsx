'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { useCurrentUser } from '@/hooks/useCurrentUser';

const VIEWS = [
  { id: 'admin', label: 'Admin Portal', path: '/admin' },
  { id: 'partner', label: 'Partner Portal', path: '/partner' },
  { id: 'student', label: 'Member Portal', path: '/dashboard' },
  { id: 'employer', label: 'Employer Portal', path: '/employer' },
  { id: 'counselor', label: 'Counselor Portal', path: '/counselor' },
] as const;

type ViewId = (typeof VIEWS)[number]['id'];

function getCurrentView(pathname: string): ViewId {
  if (pathname?.startsWith('/admin')) return 'admin';
  if (pathname?.startsWith('/partner')) return 'partner';
  if (pathname?.startsWith('/employer')) return 'employer';
  if (pathname?.startsWith('/counselor')) return 'counselor';
  return 'student';
}

/**
 * Super-admin flag from the shared current-user snapshot (WAP-27). When the
 * server already rendered the answer (`knownSuperAdmin`), no request is made;
 * otherwise every caller on the page shares the same single `/api/auth/me`.
 */
export function useIsSuperAdmin(knownSuperAdmin = false) {
  const { user } = useCurrentUser({ enabled: !knownSuperAdmin });
  return knownSuperAdmin || user?.superAdmin === true;
}

export default function SuperAdminViewSwitcher({
  initialIsSuperAdmin = false,
}: {
  initialIsSuperAdmin?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const isSuperAdmin = useIsSuperAdmin(initialIsSuperAdmin);
  const currentView = getCurrentView(pathname ?? '');
  const panelRef = useRef<HTMLDivElement>(null);

  const closeAll = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onEscape = (e: KeyboardEvent) => e.key === 'Escape' && closeAll();
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) closeAll();
    };
    document.addEventListener('keydown', onEscape);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onEscape);
      document.removeEventListener('click', onClick);
    };
  }, [open, closeAll]);

  const handleSelect = (view: (typeof VIEWS)[number]) => {
    const path = view.path;
    closeAll();
    if (pathname !== path && !pathname?.startsWith(`${path}/`)) router.push(path);
  };

  if (!isSuperAdmin) return null;

  const currentLabel = VIEWS.find((v) => v.id === currentView)?.label ?? 'Member Portal';
  const shortLabel: Record<ViewId, string> = {
    admin: 'Admin',
    partner: 'Partner',
    student: 'Member',
    employer: 'Employer',
    counselor: 'Counselor',
  };

  return (
    <div
      ref={panelRef}
      className="super-admin-view-switcher super-admin-view-switcher--with-badge"
      onClick={(e) => e.stopPropagation()}
      role="presentation"
    >
      <span className="super-admin-view-switcher__badge" title="Super Admin access enabled">
        Admin
      </span>
      <button
        type="button"
        className="super-admin-view-switcher__trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`View: ${currentLabel}. Switch portal view`}
      >
        <span className="super-admin-view-switcher__label" title={currentLabel}>
          {shortLabel[currentView]}
        </span>
        <ChevronDown size={14} aria-hidden />
      </button>

      {open && (
        <div className="super-admin-view-switcher__panel">
          <div className="super-admin-view-switcher__header">Switch portal view</div>
          <ul
            className="super-admin-view-switcher__dropdown"
            role="listbox"
            aria-label="Portal view options"
          >
            {VIEWS.map((view) => {
              const isActive = currentView === view.id;
              return (
                <li key={view.id} role="option" aria-selected={isActive}>
                  <button
                    type="button"
                    className={`super-admin-view-switcher__option${isActive ? ' active' : ''}`}
                    onClick={() => handleSelect(view)}
                  >
                    {view.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
