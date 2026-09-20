import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { claudeChat } from '@/lib/ai/anthropicChat';
import { trackEvent } from '@/lib/events/track';
import { isFlagEnabledForUser } from '@/lib/feature-flags/isFlagEnabledForUser';
import { checkHelpAssistantRateLimit } from '@/lib/rate-limit';
import { WAP_LOCALE_HEADER, isAppLocale } from '@/lib/i18n/config';
import {
  HELP_ASSISTANT_FLAG,
  HELP_ASSISTANT_TOOL_TYPE,
  HELP_MAX_PATHNAME_CHARS,
  HELP_MODEL_OPTIONS,
  HELP_STARTER_KEYS,
  buildHelpSystemPrompt,
  buildHelpUserContent,
  fallbackAnswer,
  linksForAnswer,
  normalizeHistory,
  normalizeQuestion,
  redirectAnswer,
  resolveHelpPersona,
  sanitizeAnswer,
  type HelpAnswer,
} from '@/lib/help/assistant';
import { currentFeature, getPersonaKnowledge, type HelpPersona } from '@/lib/help/knowledge';
import { resolveHelpAccess } from '@/lib/help/resolveAccess';

/** Raw body cap (bytes) before JSON parsing; the schema caps each field again. */
const MAX_BODY_BYTES = 8 * 1024;

const NOT_FOUND = () => NextResponse.json({ error: 'Not found' }, { status: 404 });

/**
 * Only a plain in-app path reaches the prompt and the events: query dropped,
 * capped, and limited to path characters. Anything else (whitespace, control
 * characters, prompt text) is "unknown page" rather than an error.
 */
const PATHNAME_PATTERN = /^\/[A-Za-z0-9_\-./]*$/;

function readPathname(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = (raw.trim().split('?')[0] ?? '').slice(0, HELP_MAX_PATHNAME_CHARS);
  return PATHNAME_PATTERN.test(value) ? value : null;
}

/** The checked-in knowledge-map route to log for this request; never the raw client value. */
function sourcePageFor(persona: HelpPersona, pathname: string | null): string {
  const feature = pathname ? currentFeature(persona, pathname) : null;
  return feature?.route ?? getPersonaKnowledge(persona).homeRoute;
}

function readLanguage(request: Request, bodyValue: unknown): string {
  if (typeof bodyValue === 'string' && isAppLocale(bodyValue)) return bodyValue;
  const header = request.headers.get(WAP_LOCALE_HEADER);
  return header && isAppLocale(header) ? header : 'en';
}

/**
 * GET /api/help/chat?pathname=/counselor/today — is the assistant available to
 * this caller, and for which persona. 404 while `help_assistant_v1` is off so
 * the Help menu entry stays hidden; the flag gate is the only difference
 * between "feature absent" and "feature on".
 */
export const GET = withApiGuc(async (request: Request) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const enabled = await isFlagEnabledForUser(HELP_ASSISTANT_FLAG, user.id).catch(() => false);
    if (!enabled) return NOT_FOUND();

    const pathname = readPathname(new URL(request.url).searchParams.get('pathname'));
    const access = await resolveHelpAccess(user.id);
    const persona = resolveHelpPersona(pathname, access);
    const knowledge = getPersonaKnowledge(persona);

    return NextResponse.json({
      enabled: true,
      persona,
      homeRoute: knowledge.homeRoute,
      guideHref: knowledge.guideHref,
      tourKey: knowledge.tourKey,
      starters: HELP_STARTER_KEYS,
    });
  } catch (error) {
    console.error('[help/chat GET] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

/**
 * POST /api/help/chat `{ question, pathname?, history?, language? }` — one
 * grounded answer for the caller's persona. Auth → flag (404) → per-user
 * fail-closed rate limit (429) → body caps (400/413) → deterministic redirect
 * for other-persona questions → `claudeChat`, with a friendly fallback when
 * every provider fails. Only lengths and outcomes are logged (`ai_tool_*`
 * member events); message text never leaves the request.
 */
export const POST = withApiGuc(async (request: Request) => {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const enabled = await isFlagEnabledForUser(HELP_ASSISTANT_FLAG, user.id).catch(() => false);
    if (!enabled) return NOT_FOUND();

    // Fail closed: a limiter that throws (Upstash down) denies like one that says no.
    let limit: { success: boolean } = { success: false };
    try {
      limit = await checkHelpAssistantRateLimit(user.id, request);
    } catch (error) {
      console.error('[help/chat] rate limiter unavailable; denying request', error);
    }
    if (!limit.success) {
      return NextResponse.json({ error: 'Too many questions right now. Please try again in a little while.' }, { status: 429 });
    }

    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'Request too large' }, { status: 413 });
    }
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(rawBody);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
      body = parsed as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    const question = normalizeQuestion(body.question);
    if (!question) return NextResponse.json({ error: 'Ask a question first.' }, { status: 400 });
    const history = normalizeHistory(body.history);
    const pathname = readPathname(body.pathname);
    const language = readLanguage(request, body.language);

    const access = await resolveHelpAccess(user.id);
    const persona = resolveHelpPersona(pathname, access);
    const sourcePage = sourcePageFor(persona, pathname);

    const baseMetadata = {
      toolType: HELP_ASSISTANT_TOOL_TYPE,
      persona,
      questionLength: question.length,
      historyTurns: history.length,
      language,
    };
    await trackEvent({
      userId: user.id,
      eventName: 'ai_tool_run_started',
      entityType: HELP_ASSISTANT_TOOL_TYPE,
      sourcePage,
      metadata: baseMetadata,
    });

    let answer: HelpAnswer | null = redirectAnswer(persona, question, pathname, language);
    let providerFailed = false;

    if (!answer) {
      try {
        const text = await claudeChat(
          buildHelpSystemPrompt({ persona, currentRoute: pathname, language }),
          buildHelpUserContent(question, history),
          HELP_MODEL_OPTIONS,
        );
        const clean = text ? sanitizeAnswer(text) : '';
        if (clean) {
          answer = { text: clean, links: linksForAnswer(persona, question, pathname), source: 'model' };
        } else {
          providerFailed = true;
        }
      } catch (error) {
        providerFailed = true;
        console.error('[help/chat] model call failed; serving fallback', error);
      }
    }

    if (!answer) answer = fallbackAnswer(persona, question, pathname, language);

    await trackEvent({
      userId: user.id,
      eventName: 'ai_tool_run_completed',
      entityType: HELP_ASSISTANT_TOOL_TYPE,
      sourcePage,
      metadata: { ...baseMetadata, source: answer.source, answerLength: answer.text.length, providerFailed },
    });

    return NextResponse.json({ persona, answer: answer.text, links: answer.links, source: answer.source });
  } catch (error) {
    console.error('[help/chat POST] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
