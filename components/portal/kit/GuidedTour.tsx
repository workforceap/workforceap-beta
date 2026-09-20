'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { useTour } from '@/components/onboarding/TourContext';
import { scrollBehavior } from '@/lib/a11y/scrollBehavior';
import type { TourPlacement, TourStep } from '@/lib/tours/registry';
import { useAnnounce } from './hooks/useAnnounce';
import { useFocusTrap } from './hooks/useFocusTrap';


/**
 * Portal Design Kit — guided tour engine (spotlight ring + step popover).
 *
 * Moved from `components/onboarding/PortalTour` (design: scratchpad
 * tours/design.md §2-3). Steps come from `lib/tours/registry.ts` through
 * `TourContext`; copy is resolved here from the `tours` i18n namespace, so the
 * provider tree must sit under a `NextIntlClientProvider` that ships `tours`
 * (`PORTAL_CLIENT_NAMESPACES`, `pickAdminClientMessages`).
 *
 * - Anchors are `[data-tour="<targetId>"]`; a step whose anchor is missing is
 *   skipped, and a tour with no reachable anchor completes silently.
 * - `useFocusTrap` keeps Tab inside the popover, consumes Escape through the
 *   shared escape stack (one layer at a time when a drawer is also open) and
 *   restores focus to the trigger when the tour closes.
 * - `useAnnounce` reads each step to screen readers.
 * - Chrome uses `--wa-*` tokens only and sits on `--z-tour`.
 *
 * Not exported from the kit barrel: it depends on `TourContext`, which lives
 * with the onboarding flows. Import it directly.
 */

type PopoverLayout = { top: number; left: number; width: number };

function layoutPopover(rect: DOMRect, placement: TourPlacement | undefined, popW: number, popH: number): PopoverLayout {
  const margin = 16;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const place = placement ?? 'right';
  let top = rect.bottom + margin;
  let left = rect.left;

  // On narrow screens, prefer bottom-center to avoid clipping
  const narrow = vw < 640;

  if (narrow) {
    top = rect.bottom + margin;
    left = Math.min(Math.max(margin, rect.left + rect.width / 2 - popW / 2), vw - popW - margin);
    if (top + popH > vh - margin) {
      top = rect.top - popH - margin;
    }
    if (top < margin) {
      top = margin;
      left = Math.min(Math.max(margin, vw / 2 - popW / 2), vw - popW - margin);
    }
    return { top, left, width: popW };
  }

  if (place === 'right') {
    left = rect.right + margin;
    top = rect.top + rect.height / 2 - popH / 2;
    if (left + popW > vw - margin) {
      left = rect.left - popW - margin;
    }
    if (top + popH > vh - margin) top = vh - popH - margin;
    if (top < margin) top = margin;
  } else if (place === 'left') {
    left = rect.left - popW - margin;
    top = rect.top + rect.height / 2 - popH / 2;
    if (left < margin) {
      left = Math.min(Math.max(margin, rect.left), vw - popW - margin);
      top = rect.bottom + margin;
    }
    if (top + popH > vh - margin) top = vh - popH - margin;
    if (top < margin) top = margin;
  } else if (place === 'top') {
    top = rect.top - popH - margin;
    left = Math.min(Math.max(margin, rect.left + rect.width / 2 - popW / 2), vw - popW - margin);
    if (top < margin) {
      top = rect.bottom + margin;
    }
  } else {
    top = rect.bottom + margin;
    left = Math.min(Math.max(margin, rect.left + rect.width / 2 - popW / 2), vw - popW - margin);
    if (top + popH > vh - margin) {
      top = rect.top - popH - margin;
    }
  }

  left = Math.min(Math.max(margin, left), vw - popW - margin);
  top = Math.min(Math.max(margin, top), vh - margin);
  return { top, left, width: popW };
}

function findAnchor(targetId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-tour="${targetId}"]`);
}

const SPOTLIGHT_PAD = 8;

/** Scrim: alpha tint of the text token so it reads on both light and dark canvases (KIT_GUIDE §3). */
const SCRIM = 'color-mix(in srgb, var(--wa-text) 55%, transparent)';

const overlayStyle: CSSProperties = {
  background: SCRIM,
  backdropFilter: 'blur(2px)',
};

const popoverBaseStyle: CSSProperties = {
  background: 'var(--wa-surface)',
  border: '1px solid var(--wa-border)',
  borderRadius: 'var(--wa-radius-sm)',
  boxShadow: 'var(--wa-shadow-lg)',
  color: 'var(--wa-text)',
  maxWidth: 'calc(100vw - 24px)',
};

const headerStyle: CSSProperties = {
  background: 'linear-gradient(135deg, var(--wa-hero-crimson) 0%, var(--wa-hero-crimson-dark) 100%)',
  color: 'var(--wa-on-hero)',
  borderStartStartRadius: 'var(--wa-radius-sm)',
  borderStartEndRadius: 'var(--wa-radius-sm)',
};

const titleStyle: CSSProperties = {
  color: 'var(--wa-on-hero)',
  fontSize: 'var(--wa-type-body)',
  fontWeight: 600,
  lineHeight: 1.3,
};

const counterStyle: CSSProperties = {
  color: 'var(--wa-on-hero)',
  opacity: 0.85,
  fontSize: 'var(--wa-type-meta)',
  fontWeight: 500,
};

const bodyStyle: CSSProperties = {
  color: 'var(--wa-muted)',
  fontSize: 'var(--wa-type-body)',
  lineHeight: 1.5,
};

const footerStyle: CSSProperties = {
  borderTop: '1px solid var(--wa-border)',
};

export function GuidedTour() {
  const t = useTranslations('tours');
  const announce = useAnnounce();
  const { isOpen, currentStep, steps, endTour, completeTour, nextStep, prevStep, goToStep } = useTour();
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [popover, setPopover] = useState<PopoverLayout | null>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  // Escape is consumed through the kit escape stack; the trap also restores
  // focus to whatever opened the tour when it closes.
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen, { onEscape: endTour, skipInitialFocus: true });
  const total = steps.length;
  const step = steps[currentStep];
  const title = step ? t(step.titleKey) : '';
  const announceText = step ? t('chrome.announceStep', { current: currentStep + 1, total, title }) : '';

  useLayoutEffect(() => {
    if (!isOpen) {
      setTargetRect(null);
      return;
    }
    if (steps.length === 0) {
      void completeTour();
      return;
    }
    let resolved = currentStep;
    while (resolved < steps.length) {
      if (findAnchor(steps[resolved].targetId)) break;
      resolved++;
    }
    if (resolved >= steps.length) {
      void completeTour();
      return;
    }
    if (resolved !== currentStep) {
      queueMicrotask(() => goToStep(resolved));
      return;
    }

    const current = steps[resolved];
    const el = findAnchor(current.targetId);
    if (!el) return;
    if (typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: scrollBehavior() });
    }
    const rect = el.getBoundingClientRect();
    setTargetRect(rect);
    const popW = Math.min(340, window.innerWidth - 24);
    const popH = dialogRef.current?.offsetHeight ?? 240;
    setPopover(layoutPopover(rect, current.placement, popW, popH));
  }, [isOpen, steps, currentStep, completeTour, goToStep, dialogRef]);

  useEffect(() => {
    if (!isOpen) return;
    const onResize = () => {
      if (!step) return;
      const el = findAnchor(step.targetId);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setTargetRect(rect);
      const popW = Math.min(340, window.innerWidth - 24);
      const popH = dialogRef.current?.offsetHeight ?? 240;
      setPopover(layoutPopover(rect, step.placement, popW, popH));
    };
    window.addEventListener('scroll', onResize, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onResize, true);
      window.removeEventListener('resize', onResize);
    };
  }, [step, isOpen, dialogRef]);

  // Primary action takes focus on open and on every step; announce the step.
  useEffect(() => {
    if (!isOpen || !step) return;
    const timer = window.setTimeout(() => primaryRef.current?.focus(), 0);
    announce(announceText);
    return () => window.clearTimeout(timer);
  }, [isOpen, step, announceText, announce]);

  if (!isOpen || !step || total === 0) return null;

  const hl = targetRect
    ? {
        top: targetRect.top - SPOTLIGHT_PAD,
        left: targetRect.left - SPOTLIGHT_PAD,
        width: targetRect.width + SPOTLIGHT_PAD * 2,
        height: targetRect.height + SPOTLIGHT_PAD * 2,
      }
    : null;

  const isLastStep = currentStep >= total - 1;
  const titleId = 'wa-guided-tour-title';
  const bodyId = 'wa-guided-tour-body';

  return (
    <div className="wa-pointer-events-auto" data-kit="guided-tour">
      {/* Dimmed overlay; clicking it dismisses like Escape. */}
      <button
        type="button"
        className="wa-fixed wa-inset-0 wa-z-[var(--z-tour)] wa-cursor-default wa-border-0 wa-p-0"
        aria-label={t('chrome.close')}
        data-testid="guided-tour-overlay"
        onClick={() => endTour()}
        style={overlayStyle}
      />

      {/* Spotlight ring */}
      {hl ? (
        <div
          className="wa-pointer-events-none wa-fixed wa-z-[calc(var(--z-tour)_+_5)] wa-rounded-lg"
          data-testid="guided-tour-spotlight"
          style={{
            top: hl.top,
            left: hl.left,
            width: hl.width,
            height: hl.height,
            boxShadow: `0 0 0 9999px ${SCRIM}, 0 0 0 4px var(--wa-accent)`,
            transition: 'top var(--wa-dur-base) var(--wa-ease), left var(--wa-dur-base) var(--wa-ease), width var(--wa-dur-base) var(--wa-ease), height var(--wa-dur-base) var(--wa-ease)',
          }}
          aria-hidden
        />
      ) : null}

      {/* Popover */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        data-testid="guided-tour-dialog"
        data-tour-step={currentStep + 1}
        className="wa-fixed wa-z-[calc(var(--z-tour)_+_10)] wa-outline-none"
        style={{
          ...popoverBaseStyle,
          top: popover?.top ?? '50%',
          left: popover?.left ?? '50%',
          transform: popover ? undefined : 'translate(-50%, -50%)',
          width: popover?.width ?? 'min(340px, 92vw)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="wa-px-4 wa-py-3" style={headerStyle}>
          <h2 id={titleId} className="wa-m-0" style={titleStyle}>
            {title}
          </h2>
          <p className="wa-mt-1 wa-mb-0" style={counterStyle}>
            {t('chrome.stepOf', { current: currentStep + 1, total })}
          </p>
        </div>

        {/* Body */}
        <div id={bodyId} className="wa-px-4 wa-py-4" style={bodyStyle}>
          {t(step.bodyKey)}
        </div>

        {/* Footer */}
        <div className="wa-px-4 wa-py-3" style={footerStyle}>
          <div className="wa-flex wa-flex-col wa-gap-3 sm:wa-flex-row sm:wa-items-center sm:wa-justify-between">
            <button
              type="button"
              onClick={prevStep}
              disabled={currentStep === 0}
              className="wa-kit-cta wa-kit-cta--ghost wa-order-1 disabled:wa-opacity-40 sm:wa-order-none"
              data-testid="guided-tour-back"
            >
              {t('chrome.back')}
            </button>
            <div className="wa-order-3 wa-flex wa-w-full wa-flex-wrap wa-items-center wa-justify-stretch wa-gap-2 sm:wa-order-2 sm:wa-w-auto sm:wa-justify-end">
              <button
                type="button"
                onClick={() => endTour()}
                className="wa-kit-cta wa-kit-cta--ghost wa-flex-1 sm:wa-flex-initial"
                data-testid="guided-tour-skip"
              >
                {t('chrome.skip')}
              </button>
              <button
                ref={primaryRef}
                type="button"
                onClick={() => {
                  if (isLastStep) {
                    void completeTour();
                  } else {
                    nextStep();
                  }
                }}
                className="wa-kit-cta wa-flex-1 sm:wa-flex-initial"
                data-testid="guided-tour-next"
              >
                {isLastStep ? t('chrome.done') : t('chrome.next')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
