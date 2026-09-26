import { claudeChat, isAnthropicConfigured } from './anthropicChat';
import { isGroqConfigured } from './groq';

/** Resume Build sends member resume data only to the approved provider pair. */
export function isResumeBuildAIConfigured(): boolean {
  return isAnthropicConfigured() || isGroqConfigured();
}

export function generateResumeBuildText(systemPrompt: string, userContent: string): Promise<string | null> {
  return claudeChat(systemPrompt, userContent, {
    maxTokens: 2000,
    allowGeminiFallback: false,
  });
}
