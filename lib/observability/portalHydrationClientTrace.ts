/** Audit-only client breadcrumbs. The Preview runner installs this global before page scripts. */
type Trace = Record<string, string | boolean | number | null | undefined> & {
  auditTraceVersion: number;
};

function activeTrace(): Trace | null {
  if (typeof window === 'undefined') return null;
  try {
    const trace: unknown = (window as Window & { __waPortalHydrationTrace?: unknown })
      .__waPortalHydrationTrace;
    return trace && typeof trace === 'object' && !Array.isArray(trace) &&
      (trace as Trace).auditTraceVersion === 1
      ? trace as Trace
      : null;
  } catch {
    // A malformed third-party global must not affect portal rendering.
    return null;
  }
}

export function recordWorkspaceShellPathname(pathname: string): void {
  const trace = activeTrace();
  if (!trace) return;
  try {
    trace.firstShellPathname ??= pathname;
    trace.lastShellPathname = pathname;
  } catch {
    // Trace writes are diagnostic and must not affect hydrated markup.
  }
}

function recordNavDecision(
  surface: 'MarketingNav' | 'PortalShell',
  decisionName: 'Hidden' | 'ShowNav',
  pathname: string | null,
  decision: boolean,
): void {
  const trace = activeTrace();
  if (!trace) return;
  try {
    const first = `first${surface}`;
    const last = `last${surface}`;
    if (trace[`${first}NullPath`] === undefined) {
      trace[`${first}Pathname`] = pathname;
      trace[`${first}NullPath`] = pathname === null;
      trace[`${first}${decisionName}`] = decision;
    }
    trace[`${last}Pathname`] = pathname;
    trace[`${last}NullPath`] = pathname === null;
    trace[`${last}${decisionName}`] = decision;
  } catch {
    // Trace writes are diagnostic and must not affect hydrated markup.
  }
}

export function recordMarketingNavDecision(pathname: string | null, hidden: boolean): void {
  recordNavDecision('MarketingNav', 'Hidden', pathname, hidden);
}

export function recordPortalShellDecision(pathname: string | null, showNav: boolean): void {
  recordNavDecision('PortalShell', 'ShowNav', pathname, showNav);
}
