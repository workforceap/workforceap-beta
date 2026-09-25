export const PORTAL_AUDIT_VIEWPORTS = Object.freeze([
  Object.freeze({ name: 'desktop', width: 1440, height: 900 }),
  Object.freeze({ name: 'mobile', width: 390, height: 844 }),
]);

export const PORTAL_AUDIT_NAVIGATION_TIMEOUT_MS = 20_000;
export const PORTAL_AUDIT_READY_TIMEOUT_MS = 5_000;
export const READ_ONLY_AUDIT_ROOT_SUPPRESSION_MARKER =
  'root-gtm-sentry-utm-and-provider-metrics';

export function isReadOnlyAuditCapabilityActive(inspection) {
  return (
    inspection?.readOnlyAuditDocument === true &&
    Array.isArray(inspection?.auditSuppressedStates) &&
    inspection.auditSuppressedStates.includes(READ_ONLY_AUDIT_ROOT_SUPPRESSION_MARKER)
  );
}

export function sanitizeAuditUrl(value, dynamicPatterns = []) {
  try {
    const url = new URL(String(value));
    const pathname = redactDynamicHrefPath(url.pathname, dynamicPatterns);
    const sanitized = `${url.protocol}//${url.host}${pathname}`;
    return sanitized.replace(/\/$/, pathname === '/' ? '/' : '');
  } catch {
    const pathname = String(value ?? '').split(/[?#]/, 1)[0];
    return pathname.startsWith('/') ? redactDynamicHrefPath(pathname, dynamicPatterns) : pathname;
  }
}

export function sanitizeAuditDiagnostic(value, dynamicPatterns = []) {
  let text = String(value ?? '');
  text = text.replace(/https?:\/\/[^\s"'<>]+/gi, (candidate) =>
    sanitizeAuditUrl(candidate, dynamicPatterns)
  );
  text = text.replace(
    /\/[A-Za-z0-9_%@[\].-]+(?:\/[A-Za-z0-9_%@[\].-]+)+(?:\?[^\s"'<>)]*)?/g,
    (candidate) => redactDynamicHrefPath(candidate, dynamicPatterns)
  );
  text = text.replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]');
  text = text.replace(/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/g, '[token-redacted]');
  text = text.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email-redacted]');
  text = text.replace(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
    '[id-redacted]'
  );
  text = text.replace(
    /(?<!\d)(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)/g,
    '[phone-redacted]'
  );
  text = text.replace(
    /\b(?=[A-Za-z0-9_-]{20,}\b)(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{20,}\b/g,
    '[id-redacted]'
  );
  text = text.replace(/\b(api[_-]?key|access[_-]?token|refresh[_-]?token|password)=([^\s&]+)/gi, '$1=[redacted]');
  return text.replace(/\s+/g, ' ').trim().slice(0, 500);
}

function normalizedPathSegments(value) {
  const pathname = String(value ?? '').split(/[?#]/, 1)[0];
  return pathname.split('/').filter(Boolean);
}

function matchesDynamicPattern(pathSegments, patternSegments) {
  let pathIndex = 0;
  for (let patternIndex = 0; patternIndex < patternSegments.length; patternIndex += 1) {
    const segment = patternSegments[patternIndex];
    const optionalCatchAll = /^\[\[\.\.\.[^\]]+\]\]$/.test(segment);
    const catchAll = /^\[\.\.\.[^\]]+\]$/.test(segment);
    const dynamic = /^\[[^.[\]]+\]$/.test(segment);

    if (optionalCatchAll) return patternIndex === patternSegments.length - 1;
    if (catchAll) {
      return patternIndex === patternSegments.length - 1 && pathIndex < pathSegments.length;
    }
    if (pathIndex >= pathSegments.length) return false;
    if (!dynamic && segment !== pathSegments[pathIndex]) return false;
    pathIndex += 1;
  }
  return pathIndex === pathSegments.length;
}

function dynamicPatternSpecificity(pattern) {
  const segments = normalizedPathSegments(pattern);
  const literals = segments.filter((segment) => !segment.startsWith('[')).length;
  const catchAlls = segments.filter((segment) => segment.includes('...')).length;
  return literals * 100 + segments.length * 10 - catchAlls;
}

/** Redact route identifiers while retaining enough structure to diagnose an unnamed link. */
export function redactDynamicHrefPath(value, dynamicPatterns = []) {
  const rawPath = String(value ?? '').split(/[?#]/, 1)[0] || '/';
  const pathSegments = normalizedPathSegments(rawPath);

  const matchingPatterns = (dynamicPatterns ?? [])
    .filter((pattern) =>
      matchesDynamicPattern(pathSegments, normalizedPathSegments(pattern))
    )
    .sort(
      (left, right) => dynamicPatternSpecificity(right) - dynamicPatternSpecificity(left)
    );

  for (const pattern of matchingPatterns) {
    const patternSegments = normalizedPathSegments(pattern);
    return `/${patternSegments
      .map((segment, index) =>
        segment.startsWith('[') && segment.endsWith(']') ? '[redacted]' : pathSegments[index]
      )
      .join('/')}`;
  }

  return `/${pathSegments
    .map((segment) => {
      let decoded = segment;
      try {
        decoded = decodeURIComponent(segment);
      } catch {
        // Malformed percent encoding is itself untrusted diagnostic input.
      }
      const looksSensitive =
        /^\d{6,}$/.test(decoded) ||
        /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(decoded) ||
        /^[a-z0-9_-]{20,}$/i.test(decoded) ||
        decoded.includes('@');
      return looksSensitive ? '[redacted]' : segment;
    })
    .join('/')}`;
}

/** Deterministic readiness gate; avoids unbounded network-idle waits on polling portals. */
export async function waitForPortalReady(page, timeout = PORTAL_AUDIT_READY_TIMEOUT_MS) {
  await page.waitForLoadState('domcontentloaded', { timeout });
  await page.locator('body').waitFor({ state: 'visible', timeout });
  await page.waitForFunction(
    () => document.readyState === 'interactive' || document.readyState === 'complete',
    undefined,
    { timeout }
  );
  await page.waitForFunction(
    () => {
      const bodyText = document.body?.innerText?.replace(/\s+/g, ' ').trim() ?? '';
      const hasHeading = Boolean(document.querySelector('h1'));
      const hasControl = Boolean(document.querySelector('button, a[href], input, select, textarea'));
      return bodyText.length >= 20 && (hasHeading || hasControl);
    },
    undefined,
    { timeout }
  );
}

/** An intermediate canceled navigation must not preempt the final redirect commit. */
export async function waitForRedirectTargetCommit(page, matchesTarget, timeout) {
  const deadline = Date.now() + timeout;
  while (true) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('Exact redirect target did not commit before timeout');
    try {
      await page.waitForURL(matchesTarget, { waitUntil: 'commit', timeout: remaining });
      return;
    } catch (error) {
      const message = error?.message ?? String(error);
      if (!/net::ERR_ABORTED|interrupted by another navigation/.test(message) || page.isClosed()) {
        throw error;
      }
      // Retry only within the original timeout. The caller still checks the
      // exact URL, document status, page errors, data requests, and write guard.
      // Yield to the browser event loop so a subsequent commit can arrive even
      // when Playwright rejects the canceled navigation immediately.
      const pause = Math.min(25, deadline - Date.now());
      if (pause > 0) await new Promise((resolve) => setTimeout(resolve, pause));
    }
  }
}

/** A route-specific target marker must replace the source page's heading. */
export async function waitForVisibleActionTarget(
  page,
  selector,
  sourceHeadingText,
  timeout = PORTAL_AUDIT_READY_TIMEOUT_MS
) {
  const sourceHeading = typeof sourceHeadingText === 'string' ? sourceHeadingText.trim() : '';
  if (!sourceHeading) return false;
  try {
    await page.locator(selector)
      .filter({ hasNotText: sourceHeading })
      .first()
      .waitFor({ state: 'visible', timeout });
    return true;
  } catch {
    return false;
  }
}

/** A full-page login redirect can replace the execution context during inspection. */
export async function evaluatePortalPageAfterNavigation(page, evaluator, timeout = PORTAL_AUDIT_READY_TIMEOUT_MS) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await page.evaluate(evaluator);
    } catch (error) {
      const navigationDestroyedContext =
        error instanceof Error &&
        /Execution context was destroyed, most likely because of a navigation/.test(error.message);
      if (!navigationDestroyedContext || attempt === 2) throw error;
      await waitForPortalReady(page, timeout);
    }
  }
}

/** Collect route-level layout and accessible-name signals in the page. */
export async function inspectPortalPage(page, dynamicPatterns = []) {
  const inspection = await evaluatePortalPageAfterNavigation(page, () => {
    const isVisible = (element) => {
      if (!(element instanceof HTMLElement || element instanceof SVGElement)) return false;
      if (element.closest('[hidden], [aria-hidden="true"]')) return false;
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
    };

    const referencedLabel = (element) => {
      const ids = element.getAttribute('aria-labelledby')?.split(/\s+/).filter(Boolean) ?? [];
      return ids
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ')
        .trim();
    };

    const accessibleName = (element) => {
      const ariaLabel = element.getAttribute('aria-label')?.trim();
      if (ariaLabel) return ariaLabel;
      const labelledBy = referencedLabel(element);
      if (labelledBy) return labelledBy;
      if (element instanceof HTMLInputElement) {
        const inputName = element.alt?.trim() || element.value?.trim();
        if (inputName) return inputName;
      }
      const imageAlt = element.querySelector('img[alt]')?.getAttribute('alt')?.trim();
      if (imageAlt) return imageAlt;
      const title = element.getAttribute('title')?.trim();
      if (title) return title;
      return element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    };

    const controls = [
      ...document.querySelectorAll(
        'button, a[href], [role="button"], [role="link"], input[type="button"], input[type="submit"], input[type="reset"], input[type="image"]'
      ),
    ].filter(isVisible);
    const unnamedControls = controls.filter((element) => !accessibleName(element));
    const hrefPaths = controls
      .filter((element) => element instanceof HTMLAnchorElement && element.href)
      .map((element) => new URL(element.href, window.location.href))
      .filter((url) => url.origin === window.location.origin)
      .map((url) => `${url.pathname}${url.search}`);

    const rootWidth = Math.max(
      document.documentElement?.scrollWidth ?? 0,
      document.body?.scrollWidth ?? 0
    );
    const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 0;
    const visibleH1Count = [...document.querySelectorAll('h1')].filter(isVisible).length;
    const errorFallbackStates = [
      ...document.querySelectorAll('[data-portal-error-state]'),
    ]
      .map((element) => element.getAttribute('data-portal-error-state') || 'unknown');
    const auditSuppressedStates = [
      ...document.querySelectorAll('[data-portal-audit-suppressed]'),
    ].map((element) => element.getAttribute('data-portal-audit-suppressed') || 'unknown');
    const normalizedBodyText = (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim();

    const partnerSignupForm = document.getElementById('partner-signup-form');
    return {
      bodyText: document.body?.innerText ?? '',
      readOnlyAuditDocument:
        document.documentElement?.getAttribute('data-portal-read-only-audit') === '1',
      appReady: normalizedBodyText.length >= 20 && (visibleH1Count > 0 || controls.length > 0),
      errorFallbackDetected: errorFallbackStates.length > 0,
      errorFallbackStates: [...new Set(errorFallbackStates)],
      auditSuppressedStates: [...new Set(auditSuppressedStates)],
      publicPartnerSignupFormPresent:
        partnerSignupForm instanceof HTMLFormElement &&
        isVisible(partnerSignupForm) &&
        Boolean(partnerSignupForm.querySelector('input[name="organization_name"]')) &&
        Boolean(partnerSignupForm.querySelector('button[type="submit"]')),
      h1Count: visibleH1Count,
      horizontalOverflowPx: Math.max(0, Math.ceil(rootWidth - viewportWidth)),
      interactiveControlCount: controls.length,
      unnamedInteractiveControlCount: unnamedControls.length,
      hrefPaths,
      unnamedInteractiveControls: unnamedControls.slice(0, 25).map((element) => ({
        tag: element.tagName.toLowerCase(),
        role: element.getAttribute('role') || null,
        hrefPath:
          element instanceof HTMLAnchorElement && element.href
            ? new URL(element.href, window.location.href).pathname
            : null,
      })),
    };
  });

  return {
    ...inspection,
    // This is the deployment capability handshake. The runner-provided token
    // is not trusted merely because it has a plausible length: middleware must
    // accept it, forward the server-only audit header, and the root layout must
    // render its exact suppression marker before a release row can pass.
    readOnlyCapabilityActive: isReadOnlyAuditCapabilityActive(inspection),
    unnamedInteractiveControls: inspection.unnamedInteractiveControls.map((control) => ({
      ...control,
      hrefPath: control.hrefPath
        ? redactDynamicHrefPath(control.hrefPath, dynamicPatterns)
        : null,
    })),
  };
}

export function pendingDynamicRoutes(patterns) {
  return (patterns ?? []).map((pattern) => ({
    pattern,
    status: 'pending',
    reason: 'requires_discoverable_safe_fixture',
  }));
}
