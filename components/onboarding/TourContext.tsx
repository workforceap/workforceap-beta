'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { trackTourEvent } from '@/lib/analytics/events';
import {
  LEGACY_PORTAL_TOUR_KEY,
  getTour,
  toTourSteps,
  type LegacyTourPortal,
  type TourKey,
  type TourStatus,
  type TourStep,
} from '@/lib/tours/registry';

export type { TourStep };

type PortalType = LegacyTourPortal;

interface TourContextValue {
  isOpen: boolean;
  currentStep: number;
  steps: TourStep[];
  portal: PortalType;
  /** Registry key of the running tour (null when nothing has started yet). */
  tourKey: TourKey | null;
  /** Legacy entry point: explicit steps + portal (PortalEntryClient). */
  startTour: (steps: TourStep[], portal: PortalType) => void;
  /** Registry entry point (`?tour=<key>`, Help menu, StartTourButton). Returns false for unknown keys. */
  start: (tourKey: string) => boolean;
  /** Dismiss: closes and persists DISMISSED with the step the person left on. */
  endTour: () => void;
  /**
   * Close without recording anything (WAP-228): the tour's anchors exist but
   * none is reachable here (e.g. every nav row sits in the closed phone
   * drawer), so the tour should still run on a device where they are visible.
   */
  abandonTour: () => void;
  completeTour: () => Promise<void>;
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (index: number) => void;
}

const TourContext = createContext<TourContextValue | null>(null);

/** No-op tour API when `TourProvider` is missing — avoids crashing the whole portal tree. */
function noopTourValue(): TourContextValue {
  return {
    isOpen: false,
    currentStep: 0,
    steps: [],
    portal: 'member',
    tourKey: null,
    startTour: () => {},
    start: () => false,
    endTour: () => {},
    abandonTour: () => {},
    completeTour: async () => {},
    nextStep: () => {},
    prevStep: () => {},
    goToStep: () => {},
  };
}

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  return ctx ?? noopTourValue();
}

function tourStateEndpoint(tourKey: string): string {
  return `/api/tours/${encodeURIComponent(tourKey)}`;
}

/** Best-effort write to `user_tour_states`; the UI never waits on it. */
function persistTourState(
  tourKey: TourKey,
  body: { version: number; status: TourStatus; lastStep: number },
): Promise<void> {
  const sourcePage = typeof window !== 'undefined' ? window.location.pathname : undefined;
  return fetch(tourStateEndpoint(tourKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, ...(sourcePage ? { sourcePage } : {}) }),
    keepalive: true,
  })
    .then(() => undefined)
    .catch(() => undefined);
}

interface TourProviderProps {
  children: ReactNode;
}

interface RunningTour {
  key: TourKey;
  version: number;
  portal: PortalType | null;
  role: string;
}

export function TourProvider({ children }: TourProviderProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [portal, setPortal] = useState<PortalType>('member');
  const [tourKey, setTourKey] = useState<TourKey | null>(null);
  // Mirrors for callbacks that must read the latest value without re-binding.
  const runningRef = useRef<RunningTour | null>(null);
  const currentStepRef = useRef(0);
  const isOpenRef = useRef(false);

  const open = useCallback((newSteps: TourStep[], running: RunningTour) => {
    runningRef.current = running;
    currentStepRef.current = 0;
    isOpenRef.current = true;
    setSteps(newSteps);
    if (running.portal) setPortal(running.portal);
    setTourKey(running.key);
    setCurrentStep(0);
    setIsOpen(true);
    void persistTourState(running.key, { version: running.version, status: 'STARTED', lastStep: 0 });
    trackTourEvent('started', running.key, { version: running.version, role: running.role });
  }, []);

  const startTour = useCallback(
    (newSteps: TourStep[], newPortal: PortalType) => {
      const key = LEGACY_PORTAL_TOUR_KEY[newPortal];
      const def = getTour(key);
      open(newSteps, { key, version: def?.version ?? 1, portal: newPortal, role: def?.role ?? newPortal });
    },
    [open],
  );

  const start = useCallback(
    (key: string): boolean => {
      const def = getTour(key);
      if (!def) return false;
      const legacyPortal =
        def.role === 'member' || def.role === 'employer' || def.role === 'partner' ? def.role : null;
      open(toTourSteps(def), { key: def.key, version: def.version, portal: legacyPortal, role: def.role });
      return true;
    },
    [open],
  );

  const close = useCallback(() => {
    isOpenRef.current = false;
    currentStepRef.current = 0;
    setIsOpen(false);
    setCurrentStep(0);
  }, []);

  const endTour = useCallback(() => {
    const running = runningRef.current;
    if (isOpenRef.current && running) {
      const lastStep = currentStepRef.current;
      void persistTourState(running.key, { version: running.version, status: 'DISMISSED', lastStep });
      trackTourEvent('dismissed', running.key, { version: running.version, last_step: lastStep, role: running.role });
    }
    close();
  }, [close]);

  const completeTour = useCallback(async () => {
    const running = runningRef.current;
    const lastStep = Math.max(0, steps.length - 1);
    if (running) {
      void persistTourState(running.key, { version: running.version, status: 'COMPLETED', lastStep });
      trackTourEvent('completed', running.key, { version: running.version, last_step: lastStep, role: running.role });
    }
    if (!running || running.portal) {
      // Legacy per-portal timestamp; the home pages still read it for auto-start (wave 4 retires it).
      try {
        await fetch('/api/onboarding/tour-complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ portal: running?.portal ?? portal }),
        });
      } catch {
        // ignore
      }
    }
    close();
    router.refresh();
  }, [steps.length, portal, close, router]);

  const nextStep = useCallback(() => {
    setCurrentStep((prev) => {
      const next = prev + 1;
      if (next >= steps.length) {
        void completeTour();
        return prev;
      }
      currentStepRef.current = next;
      return next;
    });
  }, [steps.length, completeTour]);

  const prevStep = useCallback(() => {
    setCurrentStep((prev) => {
      const next = Math.max(0, prev - 1);
      currentStepRef.current = next;
      return next;
    });
  }, []);

  const goToStep = useCallback(
    (index: number) => {
      const next = Math.max(0, Math.min(index, steps.length - 1));
      currentStepRef.current = next;
      setCurrentStep(next);
    },
    [steps.length],
  );

  const value = useMemo(
    () => ({
      isOpen,
      currentStep,
      steps,
      portal,
      tourKey,
      startTour,
      start,
      endTour,
      abandonTour: close,
      completeTour,
      nextStep,
      prevStep,
      goToStep,
    }),
    [isOpen, currentStep, steps, portal, tourKey, startTour, start, endTour, close, completeTour, nextStep, prevStep, goToStep],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}
