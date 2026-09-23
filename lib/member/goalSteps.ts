import { chatCompletion, isAIConfigured } from '@/lib/ai/groq';

/**
 * Goal steps are stored as structured JSON embedded in the existing Goal.description
 * Text column (no schema change). The description column holds either a plain string
 * (legacy / user note) OR a JSON envelope of the shape below. Helpers in this file
 * encode/decode that envelope so the rest of the app can treat steps as first-class.
 */

export type GoalStep = {
  id: string;
  text: string;
  done: boolean;
};

export type GoalDescriptionPayload = {
  /** Free-text note the member or system attached to the goal. */
  note: string;
  /** AI- or user-generated concrete next steps. */
  steps: GoalStep[];
};

const ENVELOPE_PREFIX = '@@WAP_GOAL_V1@@';

function makeStepId(): string {
  return `s_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Decode a Goal.description value into a normalized payload.
 * Backwards compatible: a plain string becomes { note, steps: [] }.
 */
export function parseGoalDescription(description: string | null | undefined): GoalDescriptionPayload {
  if (!description) return { note: '', steps: [] };
  if (description.startsWith(ENVELOPE_PREFIX)) {
    try {
      const raw = description.slice(ENVELOPE_PREFIX.length);
      const parsed = JSON.parse(raw) as Partial<GoalDescriptionPayload>;
      const steps = Array.isArray(parsed.steps)
        ? parsed.steps
            .filter((s): s is GoalStep => !!s && typeof s.text === 'string')
            .map((s) => ({
              id: typeof s.id === 'string' && s.id ? s.id : makeStepId(),
              text: String(s.text).slice(0, 280),
              done: Boolean(s.done),
            }))
        : [];
      return { note: typeof parsed.note === 'string' ? parsed.note : '', steps };
    } catch {
      return { note: '', steps: [] };
    }
  }
  return { note: description, steps: [] };
}

/** Encode a payload back into a Goal.description string for persistence. */
export function encodeGoalDescription(payload: GoalDescriptionPayload): string {
  return ENVELOPE_PREFIX + JSON.stringify({
    note: payload.note ?? '',
    steps: (payload.steps ?? []).slice(0, 8).map((s) => ({
      id: s.id || makeStepId(),
      text: s.text.slice(0, 280),
      done: !!s.done,
    })),
  });
}

/** Build fresh GoalStep objects from raw step strings. */
export function buildSteps(texts: string[]): GoalStep[] {
  return texts
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 5)
    .map((text) => ({ id: makeStepId(), text: text.slice(0, 280), done: false }));
}

type StepGenInput = {
  title: string;
  goalType: string;
  note?: string;
  careerTitle?: string | null;
};

/**
 * Use AI to break a goal into 3-5 concrete, achievable next steps.
 * Falls back to a curated template when AI is unavailable so the feature
 * always returns something useful.
 *
 * `skipAI` returns the curated template without a model call. The route sets
 * it when the member is over the AI tool quota.
 */
export async function generateGoalSteps(
  input: StepGenInput,
  options: { skipAI?: boolean } = {}
): Promise<string[]> {
  if (options.skipAI) return fallbackSteps(input);
  const ai = await generateStepsWithAI(input);
  if (ai && ai.length >= 3) return ai.slice(0, 5);
  return fallbackSteps(input);
}

async function generateStepsWithAI(input: StepGenInput): Promise<string[] | null> {
  if (!isAIConfigured()) return null;

  const systemPrompt = `You are an encouraging career coach for WorkforceAP, a nonprofit helping job seekers build skills and find work. Break a member's goal into 3 to 5 concrete, specific, achievable next steps they can actually do. Each step should start with an action verb, be one sentence, and feel motivating but realistic. Do not mention WIOA or government programs. Return ONLY a JSON array of strings, nothing else. Example: ["Update your resume summary to highlight your top skill", "Apply to 3 roles that match your target this week"].`;

  const userPrompt = `Goal title: "${input.title}"
Goal category: ${input.goalType}
${input.careerTitle ? `Member's target career: ${input.careerTitle}` : ''}
${input.note ? `Member note: ${input.note}` : ''}

Return a JSON array of 3-5 next steps.`;

  try {
    const output = await chatCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { maxTokens: 500, temperature: 0.6 }
    );
    if (!output) return null;
    const steps = extractStringArray(output);
    return steps && steps.length >= 3 ? steps : null;
  } catch {
    return null;
  }
}

function extractStringArray(raw: string): string[] | null {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const arr = JSON.parse(raw.slice(start, end + 1));
    if (!Array.isArray(arr)) return null;
    return arr.map((x) => String(x).trim()).filter(Boolean);
  } catch {
    return null;
  }
}

/** Deterministic, goal-type-aware fallback steps when AI is unavailable. */
function fallbackSteps(input: StepGenInput): string[] {
  const byType: Record<string, string[]> = {
    build_resume: [
      'Gather your work history, skills, and any certificates in one place',
      'Use the AI Resume Rewriter to draft a strong first version',
      'Add measurable results to your top two roles',
      'Ask a counselor or peer to review it for clarity',
    ],
    practice_interviews: [
      'List 5 common questions for your target role',
      'Record yourself answering 3 of them out loud',
      'Practice the STAR method for one behavioral question',
      'Schedule a mock interview through the portal',
    ],
    apply_to_jobs: [
      'Identify 5 roles that match your skills this week',
      'Tailor your resume summary to one target role',
      'Apply to at least 2 roles and log them in your tracker',
      'Follow up on one application after 5 business days',
    ],
    complete_certification: [
      "Open your active course and review what's left to finish",
      'Block 30 minutes a day this week for lessons',
      'Complete the next module and take any quiz',
      "Mark the certificate as logged once you're done",
    ],
    finish_pathway: [
      'Review your learning pathway and find your current step',
      'Set a target completion date that feels doable',
      'Finish the next course in the pathway',
      'Celebrate progress and pick the following course',
    ],
    linkedin_profile: [
      'Add a professional headshot and a clear headline',
      'Write an About section highlighting your goal and strengths',
      "List your skills and any certificates you've earned",
      'Connect with 5 people in your target field',
    ],
    tech_readiness: [
      'Identify the top 3 skills your target tech role needs',
      'Start one beginner course in your biggest gap area',
      'Build a small practice project to apply what you learn',
      'Update your resume with the new skills',
    ],
    career_pivot: [
      'Research 3 roles in your new target field',
      'Map your transferable skills to those roles',
      'Pick one starter course or certificate to build credibility',
      'Reach out to one person already in that field',
    ],
  };

  return (
    byType[input.goalType] ?? [
      'Break this goal into a clear first action you can do today',
      'Schedule time this week to make progress',
      "Track what you've done so you can see momentum",
      'Ask for help if you get stuck',
    ]
  );
}
