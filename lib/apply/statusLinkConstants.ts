/**
 * Constants for the public application-status link that are safe to import
 * from client components (no Node `crypto`). The signing/verification code
 * lives in lib/apply/statusLinkToken.ts and re-exports these.
 */
export const APPLICATION_STATUS_LINK_TTL_MINUTES = 30;
export const APPLICATION_STATUS_LINK_PATH = '/apply/status/view';
/** Query parameter that carries the token on the status page. */
export const APPLICATION_STATUS_LINK_PARAM = 't';
