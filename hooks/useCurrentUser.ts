'use client';

import { useEffect, useState } from 'react';
import {
  fetchCurrentUser,
  peekCurrentUser,
  subscribeCurrentUser,
  type CurrentUserSnapshot,
} from '@/lib/auth/currentUserClient';

/**
 * React view of the shared current-user snapshot (WAP-27). Every mounted
 * consumer reads the same cached `/api/auth/me` result; the first mount in a
 * freshness window triggers exactly one request. Pass `enabled: false` when
 * the caller already knows the answer (e.g. the server rendered it) to skip
 * the request entirely.
 */
export function useCurrentUser(options: { enabled?: boolean; maxAgeMs?: number } = {}): {
  user: CurrentUserSnapshot | null;
  loading: boolean;
  error: boolean;
} {
  const enabled = options.enabled ?? true;
  const maxAgeMs = options.maxAgeMs;
  const [user, setUser] = useState<CurrentUserSnapshot | null>(() => peekCurrentUser());
  const [loading, setLoading] = useState<boolean>(enabled && peekCurrentUser() === null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const unsubscribe = subscribeCurrentUser((snapshot) => {
      if (!cancelled) setUser(snapshot);
    });
    fetchCurrentUser({ maxAgeMs })
      .then((snapshot) => {
        if (cancelled) return;
        setUser(snapshot);
        setError(false);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [enabled, maxAgeMs]);

  return { user, loading, error };
}
