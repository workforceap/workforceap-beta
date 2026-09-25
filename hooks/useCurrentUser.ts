'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
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
  // A cached browser snapshot may arrive while a later streamed subtree still
  // needs hydration. React must see the same null snapshot the server rendered
  // until that subtree has hydrated; then it can apply the current cache.
  const user = useSyncExternalStore(
    enabled ? subscribeToCurrentUser : noCurrentUserSubscription,
    peekCurrentUser,
    emptyServerSnapshot,
  );
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetchCurrentUser({ maxAgeMs })
      .then(() => {
        if (cancelled) return;
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
    };
  }, [enabled, maxAgeMs]);

  return { user, loading: enabled && user === null && loading, error };
}

function subscribeToCurrentUser(onStoreChange: () => void): () => void {
  return subscribeCurrentUser(onStoreChange);
}

function noCurrentUserSubscription(): () => void {
  return () => {};
}

function emptyServerSnapshot(): null {
  return null;
}
