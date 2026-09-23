import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { readJsonObjectBody } from '@/lib/api/readJsonBody';
import { isMissingPrismaEnumValue } from '@/lib/db/prismaEnumFallback';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { saveAIToolResult } from '@/lib/ai/saveResult';
import { trackEvent } from '@/lib/events/track';
import { checkResumeUploadRateLimit } from '@/lib/rate-limit';

import { withApiGuc } from '@/lib/db/withRequestGuc';

/** Same private bucket as resumes; path prefix isolates mock interview videos. */
const BUCKET = 'member-resumes';

const MAX_VIDEO_BYTES = 200 * 1024 * 1024;

const RECORDING_MIME_TYPES = new Set(['video/webm', 'video/mp4']);

/** `video/webm;codecs=vp9,opus` -> `video/webm`. */
function baseMimeType(value: string): string {
  return value.split(';')[0].trim().toLowerCase();
}

function isObjectNotFound(error: { message?: string; status?: number; statusCode?: string }): boolean {
  return error.status === 404 || error.statusCode === '404' || /not.?found/i.test(error.message ?? '');
}

function isValidRecordingPath(userId: string, path: string): boolean {
  const prefix = `${userId}/voice-interview-recordings/`;
  if (!path.startsWith(prefix)) return false;
  const rest = path.slice(prefix.length);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(webm|mp4)$/i.test(rest);
}

function storageErrorMessage(error: { message?: string } | null, action: 'prepare' | 'sign'): string {
  const m = error?.message ?? '';
  if (/not found|does not exist|Bucket/i.test(m)) {
    return 'Storage is not configured. Create the member-resumes bucket in Supabase (Storage).';
  }
  return action === 'prepare' ? 'Failed to prepare upload' : 'Could not create recording playback link';
}async function _GET(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const path = req.nextUrl.searchParams.get('path')?.trim() ?? '';
    if (!path || !isValidRecordingPath(user.id, path)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      console.error('[voice-interview/recording GET]', error);
      return NextResponse.json({ error: storageErrorMessage(error, 'sign') }, { status: 502 });
    }

    return NextResponse.json({ url: data.signedUrl, expiresIn: 3600 });
  } catch (e) {
    console.error('[voice-interview/recording GET]', e);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
export const GET = withApiGuc(_GET);async function _POST(request: Request) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return NextResponse.json({ error: 'Expected JSON body' }, { status: 415 });
    }

    const body = await readJsonObjectBody(request);
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    if (body.action === 'prepare') {
      const lim = await checkResumeUploadRateLimit(`voice-recording:${user.id}`);
      if (!lim.success) {
        return NextResponse.json(
          { error: 'Too many recording uploads. Try again in a few minutes.' },
          { status: 429 },
        );
      }
      const extRaw = typeof body.fileExt === 'string' ? body.fileExt.toLowerCase().replace(/^\./, '') : 'webm';
      const ext = extRaw === 'mp4' ? 'mp4' : 'webm';
      const supabase = getSupabaseAdmin();
      const id = crypto.randomUUID();
      const path = `${user.id}/voice-interview-recordings/${id}.${ext}`;
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);

      if (error || !data) {
        console.error('Mock interview video prepare:', error);
        return NextResponse.json({ error: storageErrorMessage(error, 'prepare') }, { status: 500 });
      }

      return NextResponse.json({
        bucket: BUCKET,
        path: data.path,
        token: data.token,
        recordingId: id,
        maxBytes: MAX_VIDEO_BYTES,
      });
    }

    if (body.action === 'complete') {
      const path = typeof body.path === 'string' ? body.path : '';
      const durationMs = typeof body.durationMs === 'number' ? body.durationMs : 0;
      const role = typeof body.role === 'string' ? body.role.trim() : '';
      const interviewType = typeof body.interviewType === 'string' ? body.interviewType.trim() : '';

      if (!path || !isValidRecordingPath(user.id, path)) {
        return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
      }

      // The body's mimeType/byteSize are the client's claim. Read what storage
      // actually holds and trust only that.
      const supabase = getSupabaseAdmin();
      const bucket = supabase.storage.from(BUCKET);
      const { data: stored, error: infoError } = await bucket.info(path);
      if (infoError || !stored) {
        if (infoError && !isObjectNotFound(infoError)) {
          console.error('[voice-interview/recording complete] info failed:', infoError);
          return NextResponse.json({ error: 'Could not verify recording upload' }, { status: 502 });
        }
        return NextResponse.json({ error: 'Recording upload not found' }, { status: 409 });
      }

      // Only the top-level size/contentType come from storage itself. `info()`
      // returns the object's user_metadata as `metadata`, and the uploader
      // can set that, so it is never a fallback.
      const byteSize = stored.size;
      const mimeType = stored.contentType;
      if (typeof byteSize !== 'number' || !Number.isFinite(byteSize) || typeof mimeType !== 'string') {
        console.error('[voice-interview/recording complete] object info had no size or type');
        return NextResponse.json({ error: 'Could not verify recording upload' }, { status: 502 });
      }

      const refusal =
        byteSize <= 0
          ? 'Recording is empty'
          : byteSize > MAX_VIDEO_BYTES
            ? 'Recording too large'
            : !RECORDING_MIME_TYPES.has(baseMimeType(mimeType))
              ? 'Unsupported recording type'
              : null;
      if (refusal) {
        await bucket.remove([path]).catch((error: unknown) => {
          console.error('[voice-interview/recording complete] removing refused object failed:', error);
        });
        return NextResponse.json({ error: refusal }, { status: 400 });
      }

      const inputSummary = [role || 'Role n/a', interviewType || 'General'].join(' · ').slice(0, 500);

      const recordingPayload = JSON.stringify({
        storagePath: path,
        durationMs,
        mimeType,
        role: role || undefined,
        interviewType: interviewType || undefined,
        byteSize,
        recordedAt: new Date().toISOString(),
      });

      let savedResult = false;
      try {
        await saveAIToolResult(user.id, 'voice_interview_video', inputSummary, recordingPayload);
        savedResult = true;
      } catch (error) {
        if (!isMissingPrismaEnumValue(error, 'voice_interview_video')) throw error;
        console.warn(
          '[voice-interview/recording] skipping AI history save because database is missing enum value voice_interview_video'
        );
      }

      if (!savedResult) {
        void trackEvent({
          userId: user.id,
          eventName: 'ai_tool_run_completed',
          entityType: 'ai_tool',
          metadata: { tool: 'voice_interview_video', durationMs, byteSize },
          sourcePage: '/dashboard/ai-tools/voice-interview',
        }).catch(() => {});
      }

      const { data: signed, error } = await bucket.createSignedUrl(path, 3600);
      if (error || !signed?.signedUrl) {
        console.error('[voice-interview/recording complete] createSignedUrl failed:', error);
        return NextResponse.json({ error: storageErrorMessage(error, 'sign') }, { status: 502 });
      }

      return NextResponse.json({
        ok: true,
        path,
        playbackUrl: signed.signedUrl,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (e) {
    console.error('voice-interview recording route error:', e);
    const msg =
      e instanceof Error && e.message.includes('SUPABASE_SERVICE_ROLE_KEY')
        ? 'Server configuration error (Supabase)'
        : 'Failed to process recording';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
export const POST = withApiGuc(_POST);
