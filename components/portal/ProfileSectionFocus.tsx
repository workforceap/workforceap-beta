'use client';

import { useEffect } from 'react';

/** Focus a profile section from a query because HTTP redirects cannot carry fragments. */
export function ProfileSectionFocus({ section }: { section: string | null }) {
  useEffect(() => {
    if (section !== 'settings') return;
    const node = document.getElementById('settings');
    if (!(node instanceof HTMLElement)) return;
    if (!node.hasAttribute('tabindex')) node.tabIndex = -1;
    node.scrollIntoView({ block: 'start' });
    node.focus({ preventScroll: true });
  }, [section]);
  return null;
}
