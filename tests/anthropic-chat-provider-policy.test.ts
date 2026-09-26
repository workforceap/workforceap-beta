import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const providers = vi.hoisted(() => ({
  groqChatCompletion: vi.fn(),
  geminiChat: vi.fn(),
}));

vi.mock('@/lib/ai/groq', () => ({ groqChatCompletion: providers.groqChatCompletion }));
vi.mock('@/lib/ai/geminiChat', () => ({
  geminiChat: providers.geminiChat,
  isGeminiConfigured: () => true,
}));

describe('claudeChat provider policy', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('GROQ_API_KEY', 'gsk-test');
  });

  afterEach(() => vi.unstubAllEnvs());

  it('does not send member resume data to Gemini after Groq fails when restricted', async () => {
    providers.groqChatCompletion.mockRejectedValue(new Error('Groq unavailable'));
    providers.geminiChat.mockResolvedValue('Gemini draft');
    const { claudeChat } = await import('@/lib/ai/anthropicChat');

    await expect(claudeChat('system', 'private resume', { allowGeminiFallback: false })).resolves.toBeNull();
    expect(providers.groqChatCompletion).toHaveBeenCalledOnce();
    expect(providers.geminiChat).not.toHaveBeenCalled();
  });

  it('preserves Gemini fallback for other callers by default', async () => {
    providers.groqChatCompletion.mockResolvedValue(null);
    providers.geminiChat.mockResolvedValue('Gemini draft');
    const { claudeChat } = await import('@/lib/ai/anthropicChat');

    await expect(claudeChat('system', 'other data')).resolves.toBe('Gemini draft');
    expect(providers.geminiChat).toHaveBeenCalledOnce();
  });
});
