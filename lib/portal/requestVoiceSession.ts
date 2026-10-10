import { fetchWithTimeout } from '../fetchWithTimeout';
import {
  MEMBER_REQUEST_TIMEOUT_MS,
  MEMBER_REQUEST_FAILURE,
  describeMemberRequestException,
  readMemberRequestFailure,
} from './memberRequestFailure';

type VoiceSessionResponse = {
  signedUrl: string;
  dynamicVariables?: Record<string, string | number | boolean>;
  agent?: string;
};

/** Bound voice startup, including a stalled response body, and keep failure copy actionable. */
export async function requestVoiceSession(
  endpoint: string,
  payload: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<VoiceSessionResponse> {
  try {
    return await fetchWithTimeout(endpoint, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    }, MEMBER_REQUEST_TIMEOUT_MS, async (response) => {
      if (!response.ok) throw new Error(await readMemberRequestFailure(response));
      let data: Partial<VoiceSessionResponse> | null;
      try {
        data = await response.json() as Partial<VoiceSessionResponse> | null;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') throw error;
        throw new Error(MEMBER_REQUEST_FAILURE.unavailable, { cause: error });
      }
      if (typeof data?.signedUrl !== 'string' || !data.signedUrl.trim()) {
        throw new Error(MEMBER_REQUEST_FAILURE.unavailable);
      }
      return { ...data, signedUrl: data.signedUrl };
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof TypeError || (error instanceof Error && error.name === 'AbortError')) {
      throw new Error(describeMemberRequestException(error), { cause: error });
    }
    throw error;
  }
}
