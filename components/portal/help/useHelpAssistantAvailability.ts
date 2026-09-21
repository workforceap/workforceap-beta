'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { HelpPersona } from '@/lib/help/knowledge';

export interface HelpAssistantInfo {
  persona: HelpPersona;
  homeRoute: string;
  guideHref: string | null;
  tourKey: string | null;
  starters: readonly string[];
}

export type HelpAssistantAvailability =
  | { status: 'loading' }
  | { status: 'off' }
  | { status: 'on'; info: HelpAssistantInfo };

/**
 * Whether `help_assistant_v1` is on for the viewer, straight from the same
 * endpoint that answers questions (`GET /api/help/chat` is 404 while the flag
 * row is absent or off). One request per shell mount; any failure reads as
 * "off", so an outage hides the entry instead of breaking the Help menu.
 */
export function useHelpAssistantAvailability(): HelpAssistantAvailability {
  const pathname = usePathname();
  const [state, setState] = useState<HelpAssistantAvailability>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const query = pathname ? `?pathname=${encodeURIComponent(pathname)}` : '';
    fetch(`/api/help/chat${query}`, { method: 'GET', credentials: 'same-origin', signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) return { status: 'off' } as const;
        const data = (await res.json()) as Partial<HelpAssistantInfo> & { enabled?: boolean };
        if (!data.enabled || !data.persona) return { status: 'off' } as const;
        return {
          status: 'on',
          info: {
            persona: data.persona,
            homeRoute: data.homeRoute ?? '/',
            guideHref: data.guideHref ?? null,
            tourKey: data.tourKey ?? null,
            starters: Array.isArray(data.starters) ? data.starters : [],
          },
        } as const;
      })
      .catch(() => ({ status: 'off' }) as const)
      .then((next) => {
        if (!cancelled) setState(next);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
    // Availability depends on the flag and roles, not the page; resolve once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}
