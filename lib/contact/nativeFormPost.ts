/**
 * Native (no-JavaScript) form posts from marketing/src/pages/contact.astro.
 * The page's inline script posts JSON via fetch when it has bound; when it has
 * not (slow network, blocked JS, reader modes), the browser submits the form
 * itself as application/x-www-form-urlencoded to /api/contact (WAP-13). Those
 * submissions get a 303 to a real page instead of a JSON body they cannot show.
 *
 * Lives outside app/api/contact/route.ts because Next.js only allows HTTP
 * method handlers and route-segment config as exports of a route file.
 */
export const CONTACT_FORM_THANKS_PATH = '/contact/thanks';
export const CONTACT_FORM_ERROR_PATH = '/contact#contact-form-error';

const NATIVE_FORM_CONTENT_TYPES = ['application/x-www-form-urlencoded', 'multipart/form-data'];

export function isNativeFormPost(request: Request): boolean {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  return NATIVE_FORM_CONTENT_TYPES.some((type) => contentType.startsWith(type));
}

/** Flatten a native form submission into the same shape the JSON contract uses. */
export function contactFormDataToBody(formData: FormData): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  formData.forEach((value, key) => {
    if (typeof value !== 'string') return;
    // Turnstile injects its token as cf-turnstile-response; the JSON contract
    // (and the fetch path) call it cf_turnstile_response.
    body[key === 'cf-turnstile-response' ? 'cf_turnstile_response' : key] = value;
  });
  return body;
}
