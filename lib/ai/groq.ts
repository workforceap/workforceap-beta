import Groq from 'groq-sdk';
import Anthropic from '@anthropic-ai/sdk';
import { isAIConfigured } from '@/lib/ai/configured';
import { geminiChat, isGeminiConfigured } from '@/lib/ai/geminiChat';
import { isRetiredGroqModel } from '@/lib/ai/groqRetiredModels';

export { isAIConfigured } from '@/lib/ai/configured';

/**
 * Keys become Authorization headers, so they are stripped of CR/LF/NUL and
 * trimmed. `isAIConfigured()` already trims when deciding whether a provider
 * exists; constructing the client with the raw value made the two disagree,
 * and a pasted trailing newline then failed every call at request time.
 */
function providerKey(raw: string | undefined): string {
  return (raw ?? '').replace(/[\r\n\0]/g, '').trim();
}

const groqKey = providerKey(process.env.GROQ_API_KEY);
const anthropicKey = providerKey(process.env.ANTHROPIC_API_KEY);
const groq = groqKey ? new Groq({ apiKey: groqKey }) : null;
const anthropic = anthropicKey ? new Anthropic({ apiKey: anthropicKey }) : null;

/**
 * Preference order when several chat models are available. Groq retires
 * model ids without notice; production once 404'd on every entry of a
 * hardcoded list, taking the resume rewriter and elevator pitch down. The
 * live list from `models.list()` is therefore authoritative (see
 * `orderGroqModels`) and these names only decide priority among what exists.
 */
const PREFERRED_MODELS = [
  'llama-3.3-70b-versatile',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'moonshotai/kimi-k2-instruct',
  'qwen/qwen3-32b',
  'llama-3.1-8b-instant',
] as const;

/** Static fallback when the models endpoint itself is unreachable. */
const MODELS = PREFERRED_MODELS;

/** Ids that are not chat-completion models and must never be tried. */
const NON_CHAT_MODEL_PATTERN = /whisper|tts|playai|guard|embed|prompt-guard|orpheus|compound/i;

/**
 * Pure: order the live model ids by preference, dropping non-chat models and
 * ids Groq has decommissioned (`lib/ai/groqRetiredModels.ts`).
 * Preferred ids that exist come first in preference order; every other
 * chat-capable id follows so the chain still has a model when the whole
 * preferred set has been retired.
 */
export function orderGroqModels(
  liveIds: readonly string[],
  preferred: readonly string[] = PREFERRED_MODELS,
): string[] {
  const chat = liveIds.filter((id) => id && !NON_CHAT_MODEL_PATTERN.test(id) && !isRetiredGroqModel(id));
  const live = new Set(chat);
  const head = preferred.filter((id) => live.has(id));
  const tail = chat.filter((id) => !head.includes(id)).sort();
  return [...head, ...tail];
}

const MODEL_LIST_TTL_MS = 10 * 60 * 1000;
let modelCache: { at: number; ids: string[] } | null = null;

/**
 * Live, cached list of chat models this key can use. Falls back to the static
 * preference list if the endpoint fails, so discovery can only widen the
 * chain, never empty it.
 */
async function resolveGroqModels(): Promise<readonly string[]> {
  if (!groq) return MODELS;
  if (modelCache && Date.now() - modelCache.at < MODEL_LIST_TTL_MS) return modelCache.ids;
  try {
    const listed = await groq.models.list();
    const ids = (listed.data ?? [])
      .filter((m) => (m as { active?: boolean }).active !== false)
      .map((m) => m.id);
    const ordered = orderGroqModels(ids);
    if (ordered.length > 0) {
      modelCache = { at: Date.now(), ids: ordered };
      return ordered;
    }
  } catch (err) {
    console.warn('[ai] groq models.list failed; using static list', err instanceof Error ? err.message : err);
  }
  return MODELS;
}

/**
 * Pure: the `GROQ_MODEL` override to try first, or undefined when it is unset
 * or names a decommissioned model. A retired override would otherwise put the
 * production outage id back at the head of every chain.
 */
export function resolveGroqModelOverride(raw: string | undefined): string | undefined {
  const id = raw?.trim();
  if (!id) return undefined;
  if (isRetiredGroqModel(id)) {
    console.warn(`[ai] GROQ_MODEL override names a decommissioned Groq model; ignoring it`);
    return undefined;
  }
  return id;
}

/** Test-only: drop the cached model list. */
export function _resetGroqModelCacheForTesting(): void {
  modelCache = null;
}

export function isGroqConfigured(): boolean {
  return !!groq;
}

/** Groq-only completion. Used by claudeChat so the provider chain cannot recurse. */
export async function groqChatCompletion(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options?: { maxTokens?: number; temperature?: number },
) {
  if (!groq) return null;

  const maxTokens = Math.min(options?.maxTokens ?? 4000, 8192);
  const temperature = options?.temperature ?? 0.7;
  const modelOverride = resolveGroqModelOverride(process.env.GROQ_MODEL);
  const available = await resolveGroqModels();
  const modelsToTry = modelOverride ? [modelOverride, ...available] : available;
  let lastError: Error | null = null;
  const failures: string[] = [];

  for (const model of modelsToTry) {
    try {
      const completion = await groq.chat.completions.create({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
      });
      const output = completion.choices[0]?.message?.content?.trim();
      if (output) return output;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      failures.push(`${model}: ${lastError.message}`);
      // A retired model id is not worth caching for ten minutes: next call
      // re-reads the live list so the chain heals as soon as Groq does.
      if (/model_not_found|does not exist/i.test(lastError.message)) modelCache = null;
      continue;
    }
  }

  if (lastError) {
    // Name every model tried; the last error alone read as "one model is
    // missing" when in fact the whole chain had failed.
    throw new Error(`All ${modelsToTry.length} Groq models failed — ${failures.join(' | ')}`);
  }
  return null;
}

function splitSystemUser(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
): { system: string; user: string } {
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');
  const user = messages
    .filter((m) => m.role !== 'system')
    .map((m) => m.content)
    .join('\n\n');
  return { system, user };
}

/**
 * Member-tool completion with Groq → Anthropic → Gemini fallback.
 * `/api/ai/*` routes call this; they used to die when only Anthropic/Gemini
 * was configured.
 */
export async function chatCompletion(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options?: { maxTokens?: number; temperature?: number },
) {
  if (!isAIConfigured()) return null;

  const errors: string[] = [];

  if (groq) {
    try {
      const text = await groqChatCompletion(messages, options);
      if (text) return text;
      errors.push('groq: empty response');
    } catch (err) {
      errors.push(`groq: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const { system, user } = splitSystemUser(messages);

  if (anthropic) {
    try {
      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: options?.maxTokens ?? 2000,
        system: system || 'You are a helpful assistant.',
        messages: [{ role: 'user', content: user }],
      });
      const block = msg.content[0];
      const text = block?.type === 'text' ? block.text : null;
      if (text) {
        console.warn('[ai] served via anthropic fallback (groq unavailable)');
        return text;
      }
      errors.push('anthropic: empty response');
    } catch (err) {
      errors.push(`anthropic: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (isGeminiConfigured()) {
    try {
      const text = await geminiChat(system || 'You are a helpful assistant.', user, options);
      if (text) {
        console.warn('[ai] served via gemini fallback (groq + anthropic unavailable)');
        return text;
      }
      errors.push('gemini: empty response');
    } catch (err) {
      errors.push(`gemini: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (errors.length > 0) {
    console.error('[ai] chatCompletion providers failed:', errors.join(' | '));
    throw new Error(errors[errors.length - 1] ?? 'All AI providers failed');
  }
  return null;
}
