import { beforeEach, describe, expect, it, vi } from 'vitest';

const providers = vi.hoisted(() => ({
  claudeChat: vi.fn(),
  isAnthropicConfigured: vi.fn(),
  isGroqConfigured: vi.fn(),
}));

vi.mock('@/lib/ai/anthropicChat', () => ({
  claudeChat: providers.claudeChat,
  isAnthropicConfigured: providers.isAnthropicConfigured,
}));
vi.mock('@/lib/ai/groq', () => ({
  isGroqConfigured: providers.isGroqConfigured,
}));

import { generateResumeBuildText, isResumeBuildAIConfigured } from '@/lib/ai/resumeBuildProviders';

describe('Resume Build provider boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    providers.isAnthropicConfigured.mockReturnValue(false);
    providers.isGroqConfigured.mockReturnValue(false);
  });

  it('does not start when only another provider is configured', () => {
    expect(isResumeBuildAIConfigured()).toBe(false);
    providers.isAnthropicConfigured.mockReturnValue(true);
    expect(isResumeBuildAIConfigured()).toBe(true);
    providers.isAnthropicConfigured.mockReturnValue(false);
    providers.isGroqConfigured.mockReturnValue(true);
    expect(isResumeBuildAIConfigured()).toBe(true);
  });

  it('passes resume content only through the Anthropic then Groq chain', async () => {
    providers.claudeChat.mockResolvedValue('Approved draft');
    await expect(generateResumeBuildText('system prompt', 'private resume')).resolves.toBe('Approved draft');
    expect(providers.claudeChat).toHaveBeenCalledExactlyOnceWith(
      'system prompt',
      'private resume',
      { maxTokens: 2000, allowGeminiFallback: false },
    );
  });
});
