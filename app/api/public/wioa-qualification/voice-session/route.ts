import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { startElevenLabsPortalSession } from '@/lib/ai/elevenlabsAgents';
import { buildPublicWioaPortalDynamicVariables } from '@/lib/ai/elevenlabsPortalContext';
import { checkPublicVoiceSessionRateLimit } from '@/lib/rate-limit';
import { getClientIpFromRequest } from '@/lib/http/clientIp';

/**
 * Only the name is read: the client still posts email / phone / county for
 * the written screening, but none of it is forwarded to the voice vendor, so
 * the schema drops the keys before they reach the context builder.
 */
const payloadSchema = z.object({
  fullName: z.string().trim().max(120).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIpFromRequest(request);
    const { success: rateOk } = await checkPublicVoiceSessionRateLimit(`public-wioa-voice:${ip}`);
    if (!rateOk) {
      return NextResponse.json(
        { error: 'Too many voice session requests. Please wait a few minutes and try again.' },
        { status: 429, headers: { 'Retry-After': '600' } }
      );
    }
  
    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
  
    const parsed = payloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Invalid voice session payload' }, { status: 400 });
    }
  
    try {
      const dynamicVariables = buildPublicWioaPortalDynamicVariables(parsed.data);
      const { signedUrl, expiresAt, dynamicVariables: returned } = await startElevenLabsPortalSession('wioa_prequal', {
        dynamicVariables,
      });
  
      return NextResponse.json({
        signedUrl,
        expiresAt,
        dynamicVariables: returned ?? dynamicVariables,
      }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to start session';
      // Keep the provider detail (status code, env var hint) in the server log;
      // members only need to know the written screening still works.
      console.error('[public/wioa-qualification/voice-session]', msg);
      return NextResponse.json(
        {
          error:
            'Voice practice is unavailable right now. The written screening on this page still works — please use that for now.',
        },
        { status: 503 },
      );
    }
  } catch (error) {
    console.error('/public/wioa-qualification/voice-session:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
