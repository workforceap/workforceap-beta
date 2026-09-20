/**
 * Vertical space the cookie consent notice occupies at the bottom of the page.
 *
 * `CookieConsentBanner` publishes it on <html> while the notice is visible and
 * clears it when the notice is hidden or suppressed; css/main.css rests it at
 * 0px. Fixed-position banners use it as focus scroll-margin; full-viewport
 * auth screens subtract it so a 100vh-centered form never paints under it.
 */
export const COOKIE_CONSENT_RESERVE_VAR = '--cookie-consent-reserve';

/** Min-height for 100vh-centered auth screens (login, signup): the space above the notice. */
export const CONSENT_AWARE_SCREEN_MIN_HEIGHT = `calc(100vh - var(${COOKIE_CONSENT_RESERVE_VAR}, 0px))`;
