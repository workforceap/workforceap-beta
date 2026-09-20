/**
 * Plain-language failure copy for member tool requests (AI tools, resume
 * upload). The audit found two silent failures: a 503 from the elevator-pitch
 * route left the button on "Writing…" and a 500 from the resume upload left
 * the page unchanged. Both happen when the server answers with a non-JSON
 * body (proxy or dev-server error page) or never answers at all, so every
 * member request must (1) time out, (2) read the error body defensively and
 * (3) turn the status into a sentence a member can act on.
 *
 * Messages that mean "try later" keep the words "temporarily unavailable" /
 * "busy" / "network" / "longer than expected" so `AiToolError` and
 * `useRetryableFetch` keep classifying them as retryable.
 */

/** Long enough for an AI generation or a 5 MB upload, short enough that a hung request still fails visibly. */
export const MEMBER_REQUEST_TIMEOUT_MS = 60_000;

export const MEMBER_REQUEST_FAILURE = {
  network: 'We could not reach WorkforceAP. Check your connection and try again.',
  timeout: 'This is taking longer than expected. Try again in a moment.',
  unavailable: 'This service is temporarily unavailable. Try again in a minute.',
  busy: 'Our tools are busy right now. Wait a minute and try again.',
  session: 'Your session has ended. Sign in again to continue.',
  tooLarge: 'That is too much text or too large a file. Shorten it and try again.',
  generic: 'Something went wrong. Try again.',
} as const;

/**
 * Map a non-2xx status (plus whatever message the server managed to send) to
 * one sentence. Server copy is kept only for 4xx validation answers, where it
 * names the specific fix (file type, missing field); 5xx bodies are usually
 * engineer-facing, so they are replaced.
 */
export function describeMemberRequestFailure(status: number, serverMessage?: unknown): string {
  const message = typeof serverMessage === 'string' ? serverMessage.trim() : '';
  if (status === 429) return MEMBER_REQUEST_FAILURE.busy;
  if (status === 401 || status === 403) return MEMBER_REQUEST_FAILURE.session;
  if (status === 413) return MEMBER_REQUEST_FAILURE.tooLarge;
  if (status >= 500) return MEMBER_REQUEST_FAILURE.unavailable;
  return message || MEMBER_REQUEST_FAILURE.generic;
}

/**
 * Read the JSON error body when there is one (`{ error: string }` or
 * `{ message: string }`), tolerating HTML or empty bodies from proxies and
 * restarting dev servers, and describe the failure in plain language.
 */
export async function readMemberRequestFailure(res: Response): Promise<string> {
  let serverMessage: unknown;
  try {
    const data = (await res.json()) as { error?: unknown; message?: unknown } | null;
    serverMessage = typeof data?.error === 'string' ? data.error : data?.message;
  } catch {
    serverMessage = undefined;
  }
  return describeMemberRequestFailure(res.status, serverMessage);
}

/** Describe a thrown fetch failure: an aborted (timed-out) request or a network error. */
export function describeMemberRequestException(err: unknown): string {
  if (err instanceof Error && err.name === 'AbortError') return MEMBER_REQUEST_FAILURE.timeout;
  return MEMBER_REQUEST_FAILURE.network;
}
