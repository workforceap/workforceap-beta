'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useTour } from '@/components/onboarding/TourContext';
import { useFocusTrap } from '@/components/portal/kit/hooks/useFocusTrap';
import HelpAssistantPanel, { HELP_ASSISTANT_PANEL_SELECTOR } from '@/components/portal/help/HelpAssistantPanel';
import { useHelpAssistantAvailability } from '@/components/portal/help/useHelpAssistantAvailability';
import type { TourKey } from '@/lib/tours/registry';

/**
 * Header "Help" menu (tours wave 2): the one place a person can bring a guided
 * tour back after finishing or dismissing it, at every breakpoint. Rendered by
 * `PortalHeaderActions` only when the shell has a tour for this persona and
 * `guided_tours_v2` is on for the viewer, so nothing changes until the flag row
 * exists. Copy comes from `tours.help.*`; the trigger is the `tour-help` anchor
 * of the `counselor.home` tour.
 *
 * "Ask for help" (phase 3, `help_assistant_v1`) opens the grounded AI help
 * drawer. Its entry appears only when `GET /api/help/chat` says the flag is on
 * for this viewer, so the menu is unchanged until that flag row exists.
 */
export default function PortalHelpMenu({ tourKey, guideHref }: { tourKey: TourKey; guideHref?: string }) {
  const t = useTranslations('tours');
  const { start, isOpen: tourOpen } = useTour();
  const [open, setOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const assistant = useHelpAssistantAvailability();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const close = useCallback(() => setOpen(false), []);
  const trapRef = useFocusTrap<HTMLDivElement>(open, { onEscape: close });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!target || (rootRef.current && rootRef.current.contains(target))) return;
      // The Ask-for-help drawer is rendered through a portal onto <body>, so
      // it sits outside `rootRef` in the DOM although this menu owns it; a
      // click inside it is not a click outside the menu.
      if (target instanceof Element && target.closest(HELP_ASSISTANT_PANEL_SELECTOR)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // The tour engine owns focus while it runs; keep the menu shut underneath it.
  useEffect(() => {
    if (tourOpen) setOpen(false);
  }, [tourOpen]);

  const takeTour = () => {
    setOpen(false);
    setAssistantOpen(false);
    // Focus the trigger first so the engine's focus trap restores focus here on close.
    triggerRef.current?.focus();
    start(tourKey);
  };

  const askForHelp = () => {
    setOpen(false);
    setAssistantOpen(true);
  };

  const closeAssistant = useCallback(() => {
    setAssistantOpen(false);
    triggerRef.current?.focus();
  }, []);

  return (
    <div ref={rootRef} style={{ position: 'relative', flexShrink: 0 }} data-testid="portal-help-menu">
      <button
        ref={triggerRef}
        type="button"
        className="wa-shell-text-action wa-kit-focus"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        data-tour="tour-help"
        data-testid="portal-help-trigger"
        onClick={() => setOpen((v) => !v)}
      >
        {t('help.label')}
      </button>
      {open ? (
        <div
          ref={trapRef}
          id={menuId}
          role="menu"
          aria-label={t('help.label')}
          data-testid="portal-help-panel"
          style={{
            position: 'absolute',
            top: 'calc(100% + 0.5rem)',
            right: 0,
            minWidth: '14rem',
            maxWidth: '90vw',
            zIndex: 200,
            padding: '0.375rem',
            borderRadius: 'var(--wa-radius-sm)',
            background: 'var(--wa-surface)',
            border: '1px solid var(--wa-border)',
            boxShadow: 'var(--wa-shadow-lg)',
            color: 'var(--wa-text)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.125rem',
          }}
        >
          <button
            type="button"
            role="menuitem"
            className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus"
            style={{ justifyContent: 'flex-start', width: '100%' }}
            onClick={takeTour}
            data-testid="portal-help-take-tour"
          >
            {t('help.takeTour')}
          </button>
          {assistant.status === 'on' ? (
            <button
              type="button"
              role="menuitem"
              className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus"
              style={{ justifyContent: 'flex-start', width: '100%' }}
              onClick={askForHelp}
              data-testid="portal-help-ask-assistant"
            >
              {t('help.askAssistant')}
            </button>
          ) : null}
          {guideHref ? (
            <Link
              href={guideHref}
              role="menuitem"
              prefetch={false}
              className="wa-kit-cta wa-kit-cta--ghost wa-kit-focus"
              style={{ justifyContent: 'flex-start', width: '100%' }}
              onClick={close}
            >
              {t('help.guide')}
            </Link>
          ) : null}
        </div>
      ) : null}
      {assistantOpen && assistant.status === 'on' ? (
        <HelpAssistantPanel info={assistant.info} onClose={closeAssistant} onTakeTour={takeTour} />
      ) : null}
    </div>
  );
}
