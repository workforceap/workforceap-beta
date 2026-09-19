import { groqChatCompletion } from '@/lib/ai/groq';

export async function generateResumeBullet(courseName: string): Promise<string> {
  // The shared Groq-only helper discovers available models and honors the
  // configured override. It returns null without a key; provider failures
  // remain errors so the learning workflow records an observable failure.
  const text = await groqChatCompletion(
    [
      { role: 'system', content: 'You are an expert resume writer. Generate exactly one strong, action-oriented resume bullet point for a candidate who just completed the provided training or course. Return ONLY the bullet point text, no preamble or quotes.' },
      { role: 'user', content: `Course: ${courseName}` }
    ],
    { maxTokens: 150 },
  );
  return text?.trim().replace(/^[-•*]\s*/, '').trim() || `Completed ${courseName}`;
}
