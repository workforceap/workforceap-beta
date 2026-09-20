/**
 * One shared `/api/auth/me` read for every browser consumer (WAP-27).
 *
 * The member shell used to ask `/api/auth/me` from five places on one page
 * load (the shell's super-admin probe, two `SuperAdminViewSwitcher` mounts,
 * `DevViewToggle`, and `PortalShell`), and again on every route change. This
 * module holds a single in-memory snapshot plus one in-flight request:
 * concurrent callers share the same promise, callers inside `maxAgeMs` read
 * the cached snapshot, and sign-out clears everything.
 *
 * Browser-only state; the server never imports this.
 */

export type CurrentUserPortal = { role: string; roleLabel: string; homeHref: string };

export type CurrentUserSnapshot = {
  role: string | null;
  partner: { partnerId: string; name?: string } | null;
  employer: { employerId: string; companyName: string } | null;
  counselor: { counselorId: string; partnerId: string | null } | null;
  superAdmin: boolean;
  canAccessMemberDashboard: boolean;
  availablePortals: CurrentUserPortal[];
};

export const CURRENT_USER_ENDPOINT = '/api/auth/me';
/** Default freshness window; matches MainNav's historical refresh throttle. */
export const CURRENT_USER_MAX_AGE_MS = 60_000;

export const SIGNED_OUT_SNAPSHOT: CurrentUserSnapshot = {
  role: null,
  partner: null,
  employer: null,
  counselor: null,
  superAdmin: false,
  canAccessMemberDashboard: false,
  availablePortals: [],
};

type Listener = (snapshot: CurrentUserSnapshot) => void;

type CacheState = {
  snapshot: CurrentUserSnapshot | null;
  fetchedAt: number;
  inflight: Promise<CurrentUserSnapshot> | null;
  listeners: Set<Listener>;
};

const state: CacheState = { snapshot: null, fetchedAt: 0, inflight: null, listeners: new Set() };

function normalize(raw: unknown): CurrentUserSnapshot {
  const data = (raw ?? {}) as Partial<CurrentUserSnapshot>;
  return {
    role: typeof data.role === 'string' ? data.role : null,
    partner: data.partner ?? null,
    employer: data.employer ?? null,
    counselor: data.counselor ?? null,
    superAdmin: data.superAdmin === true,
    canAccessMemberDashboard: data.canAccessMemberDashboard === true,
    availablePortals: Array.isArray(data.availablePortals) ? data.availablePortals : [],
  };
}

function publish(snapshot: CurrentUserSnapshot) {
  state.snapshot = snapshot;
  state.fetchedAt = Date.now();
  for (const listener of state.listeners) listener(snapshot);
}

/** The last snapshot without triggering a request; null before the first load. */
export function peekCurrentUser(): CurrentUserSnapshot | null {
  return state.snapshot;
}

/**
 * Resolve the current-user snapshot. Concurrent calls share one request;
 * a snapshot younger than `maxAgeMs` is returned without a network round
 * trip unless `force` is set. A failed request rejects every waiting caller
 * and leaves any earlier snapshot in place.
 */
export function fetchCurrentUser(options: { maxAgeMs?: number; force?: boolean } = {}): Promise<CurrentUserSnapshot> {
  const maxAgeMs = options.maxAgeMs ?? CURRENT_USER_MAX_AGE_MS;
  if (!options.force && state.snapshot && Date.now() - state.fetchedAt < maxAgeMs) {
    return Promise.resolve(state.snapshot);
  }
  if (state.inflight) return state.inflight;

  const request = (async () => {
    const res = await fetch(CURRENT_USER_ENDPOINT, { credentials: 'include' });
    if (!res.ok) throw new Error(`current-user request failed: ${res.status}`);
    const snapshot = normalize(await res.json());
    publish(snapshot);
    return snapshot;
  })();
  state.inflight = request;
  request.then(
    () => { if (state.inflight === request) state.inflight = null; },
    () => { if (state.inflight === request) state.inflight = null; },
  );
  return request;
}

/** Notified on every successful (re)load and on reset. */
export function subscribeCurrentUser(listener: Listener): () => void {
  state.listeners.add(listener);
  return () => { state.listeners.delete(listener); };
}

/** Sign-out (or tests): forget the snapshot so the next read hits the server. */
export function resetCurrentUserCache(): void {
  state.snapshot = null;
  state.fetchedAt = 0;
  state.inflight = null;
  for (const listener of state.listeners) listener(SIGNED_OUT_SNAPSHOT);
}
