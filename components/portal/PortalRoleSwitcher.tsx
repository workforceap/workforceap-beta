'use client';

import { useState, useEffect, useRef, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PortalRole } from '@/lib/nav/portalNav';
import styles from './PortalRoleSwitcher.module.css';

interface PortalRoleSwitcherProps {
  userRoles: { role: PortalRole; roleLabel: string; homeHref: string }[];
  currentRole: PortalRole;
}

export default function PortalRoleSwitcher({ userRoles, currentRole }: PortalRoleSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const currentRoleConfig = userRoles.find((r) => r.role === currentRole);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isOpen && rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  if (userRoles.length <= 1) {
    return null; // Don't show switcher if user only has one role
  }

  const switching = isPending || pendingHref != null;

  return (
    <div ref={rootRef} className={styles['portal-role-switcher']} data-pending={switching ? 'true' : undefined}>
      <button
        type="button"
        className={styles['portal-role-switcher-trigger']}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-controls="portal-role-switcher-menu"
        aria-label={switching ? 'Switching workspace…' : 'Switch workspace'}
        aria-busy={switching || undefined}
        disabled={switching}
      >
        <span className={styles['portal-role-switcher-current']}>{currentRoleConfig?.roleLabel || currentRole}</span>
        {switching ? (
          <span className={styles['portal-role-switcher-spinner']} aria-hidden />
        ) : (
          <svg className={`${styles['portal-role-switcher-chevron']} ${isOpen ? styles['open'] : ''}`} width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 5L6 8L9 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>

      {isOpen && (
        <div id="portal-role-switcher-menu" className={styles['portal-role-switcher-dropdown']} role="menu">
          <div className={styles['portal-role-switcher-header']}>
            Switch workspace
          </div>
          {userRoles.map(({ role, roleLabel, homeHref }) => {
            const isCurrent = role === currentRole;
            const isTarget = pendingHref === homeHref;
            return (
              <Link
                key={role}
                href={homeHref}
                className={`${styles['portal-role-switcher-option']} ${isCurrent ? styles.current : ''} ${isTarget ? styles.pending : ''}`}
                onClick={(event) => {
                  if (isCurrent) {
                    setIsOpen(false);
                    return;
                  }
                  event.preventDefault();
                  setPendingHref(homeHref);
                  setIsOpen(false);
                  startTransition(() => {
                    router.push(homeHref);
                  });
                }}
                role="menuitem"
                aria-busy={isTarget || undefined}
              >
                {roleLabel}
                {isCurrent && <span className={styles['portal-role-switcher-check']}>✓</span>}
                {isTarget && <span className={styles['portal-role-switcher-option-spinner']} aria-hidden />}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
