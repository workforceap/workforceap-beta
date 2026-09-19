import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/ai/groq', () => ({ groqChatCompletion: vi.fn() }));

import { groqChatCompletion } from '@/lib/ai/groq';
import { generateResumeBullet } from '@/lib/ai/proactiveResumeGenerator';

describe('proactive resume bullet provider contract', () => {
  beforeEach(() => vi.resetAllMocks());

  it('uses the configured shared model path with a bounded one-bullet request', async () => {
    vi.mocked(groqChatCompletion).mockResolvedValue('  • Applied cloud fundamentals.  ');
    await expect(generateResumeBullet('Cloud Fundamentals')).resolves.toBe('Applied cloud fundamentals.');
    expect(groqChatCompletion).toHaveBeenCalledWith([
      expect.objectContaining({ role: 'system', content: expect.stringContaining('exactly one') }),
      { role: 'user', content: 'Course: Cloud Fundamentals' },
    ], { maxTokens: 150 });
  });

  it.each([null, '', '  ', ' • '])('keeps the factual completion fallback for empty or unconfigured output %j', async (output) => {
    vi.mocked(groqChatCompletion).mockResolvedValue(output);
    await expect(generateResumeBullet('Cloud Fundamentals')).resolves.toBe('Completed Cloud Fundamentals');
  });

  it('propagates provider failure instead of presenting a generated bullet as successful', async () => {
    const failure = new Error('provider unavailable');
    vi.mocked(groqChatCompletion).mockRejectedValue(failure);
    await expect(generateResumeBullet('Cloud Fundamentals')).rejects.toBe(failure);
  });
});
