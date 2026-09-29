import Anthropic from '@anthropic-ai/sdk';
import { groqChatCompletion } from './groq';
import { geminiChat, isGeminiConfigured } from './geminiChat';

/** Trimmed: the key becomes an Authorization header (see lib/ai/groq.ts). */
const anthropicKey = (process.env.ANTHROPIC_API_KEY ?? '').replace(/[\r\n\0]/g, '').trim();
const client = anthropicKey ? new Anthropic({ apiKey: anthropicKey }) : null;

export function isAnthropicConfigured(): boolean {
  return !!client;
}

/**
 * Member-facing chat completion with multi-provider fallback.
 *
 * Provider order: Anthropic → Groq → Gemini. Tries each in turn; returns the
 * first successful response. Logs which provider served the response so we can
 * track quota/outage events. Throws only if all configured providers fail or
 * none are configured.
 *
 * Per /plan-design-review Decision 2: cohort members must not see a generic
 * "AI tool failed" error when one provider hits a quota or outage. The
 * fallback chain isolates that failure mode from the user experience.
 */
export async function claudeChat(
  systemPrompt: string,
  userContent: string,
  opts?: { maxTokens?: number; temperature?: number; allowGeminiFallback?: boolean }
): Promise<string | null> {
  const errors: string[] = [];

  if (client) {
    try {
      const msg = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: opts?.maxTokens ?? 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      });
      const block = msg.content[0];
      const text = block?.type === 'text' ? block.text : null;
      if (text) return text;
      errors.push('anthropic: empty response');
    } catch (err) {
      errors.push(`anthropic: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Groq fallback — uses its own multi-model fallback chain internally.
  if (process.env.GROQ_API_KEY) {
    try {
      const text = await groqChatCompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        opts
      );
      if (text) {
        console.warn('[ai] served via groq fallback (anthropic unavailable)');
        return text;
      }
      errors.push('groq: empty response');
    } catch (err) {
      errors.push(`groq: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Gemini final fallback.
  if (opts?.allowGeminiFallback !== false && isGeminiConfigured()) {
    try {
      const text = await geminiChat(systemPrompt, userContent, opts);
      if (text) {
        console.warn('[ai] served via gemini fallback (anthropic + groq unavailable)');
        return text;
      }
      errors.push('gemini: empty response');
    } catch (err) {
      errors.push(`gemini: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (errors.length > 0) {
    console.error('[ai] all providers failed:', errors.join(' | '));
  }
  return null;
}
