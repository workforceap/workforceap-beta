import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/ai/groq', () => ({ groqChatCompletion: vi.fn() }));

import { groqChatCompletion } from '@/lib/ai/groq';
import { generateResumeBullet } from '@/lib/ai/proactiveResumeGenerator';

describe('proactive resume coursework evidence contract', () => {
  beforeEach(() => vi.resetAllMocks());

  it('states coursework completion without inventing skills, results or a credential', async () => {
    vi.mocked(groqChatCompletion).mockResolvedValue('Certified cloud engineer with ten years of experience.');
    await expect(generateResumeBullet('Cloud Fundamentals')).resolves.toBe('Completed coursework: Cloud Fundamentals.');
    expect(groqChatCompletion).not.toHaveBeenCalled();
  });

  it.each(['', '  ', 'program-certificate-course-17'])('keeps incomplete course metadata factual: %j', async (title) => {
    await expect(generateResumeBullet(title)).resolves.toBe('Completed a training course.');
    expect(groqChatCompletion).not.toHaveBeenCalled();
  });

  it('normalizes whitespace and punctuation without expanding the available evidence', async () => {
    await expect(generateResumeBullet('  Cloud\nFundamentals.  ')).resolves.toBe('Completed coursework: Cloud Fundamentals.');
    expect(groqChatCompletion).not.toHaveBeenCalled();
  });
});
