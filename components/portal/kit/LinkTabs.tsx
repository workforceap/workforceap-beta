'use client';

import { useCallback, useImperativeHandle, useLayoutEffect, useRef, type ReactNode } from 'react';
import { cx, type KitBaseProps, type KitDataAttrs } from './base';
import styles from './LinkTabs.module.css';

interface LinkTabsProps extends KitBaseProps<HTMLElement>, KitDataAttrs {
  label: string;
  activeKey: string;
  children: ReactNode;
}

/** Native page links, with the current or keyboard-focused view kept in the
 * horizontal viewport. Only this strip scrolls; document position is preserved. */
export function LinkTabs({ label, activeKey, children, className, style, ref, ...rest }: LinkTabsProps) {
  const navRef = useRef<HTMLElement>(null);
  useImperativeHandle(ref, () => navRef.current!, []);

  const reveal = useCallback((link: HTMLElement) => {
    const nav = navRef.current;
    if (!nav || !nav.contains(link)) return;
    const viewport = nav.getBoundingClientRect();
    const item = link.getBoundingClientRect();
    const gutter = 4;
    const leftFade = nav.dataset.scrollable === 'true' && nav.dataset.scrollStart !== 'true' ? 24 : 0;
    const rightFade = nav.dataset.scrollable === 'true' && nav.dataset.scrollEnd !== 'true' ? 24 : 0;
    if (item.left < viewport.left + gutter + leftFade) nav.scrollLeft += item.left - viewport.left - gutter - leftFade;
    else if (item.right > viewport.right - gutter - rightFade) {
      nav.scrollLeft += item.right - viewport.right + gutter + rightFade;
    }
  }, []);

  const updateScrollCue = useCallback(() => {
    const nav = navRef.current;
    if (!nav) return;
    const maxScroll = Math.max(0, nav.scrollWidth - nav.clientWidth);
    nav.dataset.scrollable = String(maxScroll > 1);
    nav.dataset.scrollStart = String(nav.scrollLeft <= 1);
    nav.dataset.scrollEnd = String(nav.scrollLeft >= maxScroll - 1);
  }, []);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    updateScrollCue();
    const revealCurrent = () => {
      const focused = document.activeElement;
      const link = focused instanceof HTMLElement && nav.contains(focused)
        ? focused : nav.querySelector<HTMLElement>('a[aria-current="page"]');
      if (link) reveal(link);
      updateScrollCue();
    };
    revealCurrent();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(revealCurrent);
    observer?.observe(nav);
    nav.querySelectorAll('a').forEach((link) => observer?.observe(link));
    nav.addEventListener('scroll', updateScrollCue, { passive: true });
    return () => {
      observer?.disconnect();
      nav.removeEventListener('scroll', updateScrollCue);
    };
  }, [activeKey, reveal, updateScrollCue]);

  return (
    <nav
      ref={navRef}
      aria-label={label}
      className={cx('wa-kit-tabs', styles.nav, className)}
      style={style}
      onFocusCapture={(event) => {
        const link = event.target.closest<HTMLElement>('a.wa-kit-tab');
        if (link) reveal(link);
      }}
      {...rest}
    >
      {children}
    </nav>
  );
}
