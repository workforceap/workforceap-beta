import { LEGACY_TRAINING_STUB_HREF, MEMBER_PROGRAM_HREF } from '@/lib/member/memberProgramHref';
import {
  MEMBER_AGENT_TOOL_NAMES,
  type AgentGatewayHandoff,
  type AgentGatewayResponse,
  type AgentGatewaySource,
  type AuthenticatedAgentPrincipal,
  type MemberAgentGateway,
  type MemberAgentGatewayReader,
  type MemberAgentToolName,
  type MemberCourseraProgressData,
  type MemberNextStepData,
  type MemberTrainingStatusData,
} from './types';

const MAX_TEXT = 280;
const MAX_COURSES = 12;
const TOOL_NAMES = new Set<string>(MEMBER_AGENT_TOOL_NAMES);

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(10_000, Math.trunc(value)));
}

function boundedText(value: string, fallback = ''): string {
  const normalized = value.trim().replace(/\s+/g, ' ');
  return (normalized || fallback).slice(0, MAX_TEXT);
}

function safePortalHref(value: string): string {
  const href = value.trim();
  if (
    !href.startsWith('/') ||
    href.startsWith('//') ||
    /[\\\u0000-\u001F\u007F]/.test(href)
  ) {
    return '/dashboard';
  }
  try {
    const canonicalOrigin = 'https://www.workforceap.org';
    const parsed = new URL(href, canonicalOrigin);
    if (parsed.origin !== canonicalOrigin) return '/dashboard';
    return `${parsed.pathname}${parsed.search}${parsed.hash}`.slice(0, MAX_TEXT);
  } catch {
    return '/dashboard';
  }
}

/**
 * Trusted program facts from the scoped snapshot (never from stored action
 * prose). A My Program link means different things depending on them: an
 * unenrolled member is sent there to choose a program, an enrolled one to
 * train.
 */
type ProgramActionState = Readonly<{
  hasAssignedProgram: boolean;
  trainingInProgress: boolean;
}>;

function trustedNextActionFromHref(
  value: string,
  program: ProgramActionState,
): NonNullable<MemberNextStepData['action']> {
  const href = safePortalHref(value);
  const path = href.split(/[?#]/, 1)[0];
  if (path === '/dashboard/resume') {
    return {
      id: 'review_resume',
      title: 'Review your resume',
      description: 'A resume update is ready for review in WorkforceAP.',
      ctaLabel: 'Review Resume',
      ctaHref: href,
    };
  }
  if (path === '/dashboard/ai-tools/interview-practice') {
    return {
      id: 'practice_interview',
      title: 'Practice an interview',
      description: 'An interview-practice step is ready in WorkforceAP.',
      ctaLabel: 'Practice Interview',
      ctaHref: href,
    };
  }
  if (path === '/dashboard/jobs') {
    return {
      id: 'review_jobs',
      title: 'Review matched jobs',
      description: 'Your WorkforceAP job board is ready to review.',
      ctaLabel: 'See Matched Jobs',
      ctaHref: href,
    };
  }
  // My Program owns both the program picker and training. The old training
  // stub only redirects there, so a stored stub link is rewritten to My
  // Program directly, keeping its query and hash. The copy comes from the
  // member's program state, so an unenrolled member is never told to continue
  // training in an assigned program.
  if (path === MEMBER_PROGRAM_HREF || path === LEGACY_TRAINING_STUB_HREF) {
    const ctaHref = `${MEMBER_PROGRAM_HREF}${href.slice(path.length)}`;
    if (!program.hasAssignedProgram) {
      return {
        id: 'choose_program',
        title: 'Choose your program',
        description: 'Open My Program to pick the training program that fits your goals.',
        ctaLabel: 'Open My Program',
        ctaHref,
      };
    }
    if (program.trainingInProgress) {
      return {
        id: 'continue_training',
        title: 'Continue training',
        description: 'Open My Program to review your assigned program and next course.',
        ctaLabel: 'Open My Program',
        ctaHref,
      };
    }
    return {
      id: 'review_program',
      title: 'Review My Program',
      description: 'Open My Program to review your program details and next steps.',
      ctaLabel: 'Open My Program',
      ctaHref,
    };
  }
  return {
    id: 'review_portal',
    title: 'Review your WorkforceAP next step',
    description: 'Open your dashboard to review the next step saved to your account.',
    ctaLabel: 'Open Dashboard',
    ctaHref: '/dashboard',
  };
}

function toIso(value: Date | null): string | null {
  if (!value || !Number.isFinite(value.getTime())) return null;
  return value.toISOString();
}

function source(records: readonly string[], freshThrough: Date | null = null): AgentGatewaySource {
  return {
    system: 'workforceap',
    records,
    mode: 'read_only',
    freshThrough: toIso(freshThrough),
  };
}

const NO_HANDOFF: AgentGatewayHandoff = {
  recommended: false,
  destination: 'none',
  href: null,
  reason: null,
};

function handoff(
  destination: Exclude<AgentGatewayHandoff['destination'], 'none'>,
  href: string,
  reason: string,
): AgentGatewayHandoff {
  return {
    recommended: true,
    destination,
    href,
    reason: boundedText(reason),
  };
}

export function createMemberAgentGateway(args: {
  principal: AuthenticatedAgentPrincipal;
  reader: MemberAgentGatewayReader;
  now?: () => Date;
}): MemberAgentGateway {
  const { principal, reader } = args;
  const now = args.now ?? (() => new Date());
  let scopeCheck: Promise<boolean> | null = null;

  const asOf = () => now().toISOString();
  const inScope = () => {
    scopeCheck ??= reader.memberExistsInScope(principal).catch(() => false);
    return scopeCheck;
  };

  const notFound = <T>(data: T, records: readonly string[]): AgentGatewayResponse<T> => ({
    status: 'not_found',
    asOf: asOf(),
    source: source(records),
    data,
    memberFacingMessage: 'I could not find an active member record for this signed-in account.',
    handoff: handoff('support', '/dashboard/help', 'The signed-in account needs support review.'),
  });

  const unavailable = <T>(data: T, records: readonly string[]): AgentGatewayResponse<T> => ({
    status: 'unavailable',
    asOf: asOf(),
    source: source(records),
    data,
    memberFacingMessage: 'That information is temporarily unavailable. Please use the portal or contact your counselor.',
    handoff: handoff('portal', '/dashboard', 'The read-only member data source was unavailable.'),
  });

  async function getMyNextStep(): Promise<AgentGatewayResponse<MemberNextStepData>> {
    const empty: MemberNextStepData = { action: null };
    if (!(await inScope())) return notFound(empty, ['users']);

    try {
      const snapshot = await reader.loadMemberSnapshot(principal);
      if (!snapshot) return notFound(empty, ['users', 'member_state']);
      const first = snapshot.nextActions[0] ?? null;
      if (!first) {
        return {
          status: 'ok',
          asOf: asOf(),
          source: source(['member_state', 'next_best_actions']),
          data: empty,
          memberFacingMessage: 'No specific next step is posted right now. Your counselor can help choose one.',
          handoff: handoff('counselor', '/dashboard/messages', 'No member-specific next action is available.'),
        };
      }

      // Next-action prose can contain provider- or employer-sourced text. Do
      // not place it in the model-visible response. Only expose deterministic
      // copy for the small set of reviewed portal destinations.
      const action = trustedNextActionFromHref(first.href, {
        hasAssignedProgram: Boolean(snapshot.programSlug),
        trainingInProgress: Boolean(
          snapshot.programSlug &&
            snapshot.training &&
            !snapshot.training.allComplete &&
            snapshot.training.totalCourses > 0,
        ),
      });
      return {
        status: 'ok',
        asOf: asOf(),
        source: source(['member_state', 'next_best_actions']),
        data: { action },
        memberFacingMessage: `${action.title}. ${action.description}`.trim().slice(0, MAX_TEXT),
        handoff: {
          recommended: false,
          destination: 'portal',
          href: action.ctaHref,
          reason: null,
        },
      };
    } catch {
      return unavailable(empty, ['member_state', 'next_best_actions']);
    }
  }

  async function getTrainingStatus(): Promise<AgentGatewayResponse<MemberTrainingStatusData>> {
    const empty: MemberTrainingStatusData = {
      programName: null,
      programSlug: null,
      curriculumVersion: null,
      status: 'unavailable',
      completedCourses: 0,
      totalCourses: 0,
      progressPercent: 0,
      nextCourseName: null,
      lastActivityAt: null,
      curriculumTruth: null,
    };
    if (!(await inScope())) return notFound(empty, ['users', 'course_enrollments']);

    try {
      const snapshot = await reader.loadMemberSnapshot(principal);
      if (!snapshot) return notFound(empty, ['users', 'course_enrollments']);
      if (!snapshot.programSlug) {
        return {
          status: 'ok',
          asOf: asOf(),
          source: source(['course_enrollments', 'course_progress']),
          data: { ...empty, status: 'not_assigned' },
          memberFacingMessage: 'A training program has not been assigned to your account yet.',
          handoff: handoff('counselor', '/dashboard/messages', 'Program assignment requires staff confirmation.'),
        };
      }

      const training = snapshot.training;
      const curriculumTruth = snapshot.programKnowledge
        ? (() => {
            const enrollmentVersion = snapshot.curriculumVersion?.trim() || null;
            const approvedVersion = snapshot.programKnowledge.approvedVersion?.trim() || null;
            const enrollmentVersionMatch = enrollmentVersion && approvedVersion
              ? enrollmentVersion === approvedVersion
                ? 'match' as const
                : 'mismatch' as const
              : 'unknown' as const;
            const appliesToEnrollment = enrollmentVersionMatch === 'match';
            const applicabilityReason = enrollmentVersionMatch === 'mismatch'
              ? `The approved ${approvedVersion} catalog is not this member's assigned ${enrollmentVersion} curriculum. Do not describe the approved catalog as their assigned courses.`
              : enrollmentVersionMatch === 'unknown'
                ? 'The approved catalog version could not be matched to this enrollment. Do not describe it as the member\'s assigned courses.'
                : '';
            return {
              ...snapshot.programKnowledge,
              appliesToEnrollment,
              enrollmentVersionMatch,
              approvedTitle: snapshot.programKnowledge.approvedTitle
                ? boundedText(snapshot.programKnowledge.approvedTitle)
                : null,
              reason: boundedText(
                [applicabilityReason, snapshot.programKnowledge.reason]
                  .filter(Boolean)
                  .join(' '),
              ),
              citations: snapshot.programKnowledge.citations
                .slice(0, 3)
                .map((label) => boundedText(label)),
            };
          })()
        : null;
      if (!training) {
        return {
          status: 'unavailable',
          asOf: asOf(),
          source: source(['course_enrollments', 'course_progress']),
          data: {
            ...empty,
            programName: boundedText(snapshot.programName ?? snapshot.programSlug),
            programSlug: boundedText(snapshot.programSlug),
            curriculumVersion: snapshot.curriculumVersion
              ? boundedText(snapshot.curriculumVersion)
              : null,
            curriculumTruth,
          },
          memberFacingMessage: 'Your program is assigned, but its training progress is not available right now.',
          handoff: handoff('portal', MEMBER_PROGRAM_HREF, 'Training progress needs portal review.'),
        };
      }

      const completedCourses = clampCount(training.completedCount);
      const totalCourses = clampCount(training.totalCourses);
      const progressPercent = clampPercent(training.progressPercent);
      const status: MemberTrainingStatusData['status'] = training.allComplete && totalCourses > 0
        ? 'complete'
        : training.hasStarted || progressPercent > 0
          ? 'in_progress'
          : 'not_started';
      const lastActivityAt = toIso(training.lastActivityAt);
      const data: MemberTrainingStatusData = {
        programName: boundedText(snapshot.programName ?? snapshot.programSlug),
        programSlug: boundedText(snapshot.programSlug),
        curriculumVersion: snapshot.curriculumVersion
          ? boundedText(snapshot.curriculumVersion)
          : null,
        status,
        completedCourses,
        totalCourses,
        progressPercent,
        nextCourseName: training.nextCourseName
          ? boundedText(training.nextCourseName)
          : null,
        lastActivityAt,
        curriculumTruth,
      };
      return {
        status: 'ok',
        asOf: asOf(),
        source: source(['course_enrollments', 'validated_curriculum', 'course_progress'], training.lastActivityAt),
        data,
        memberFacingMessage: boundedText((
          status === 'complete'
            ? `${data.programName} is complete: ${completedCourses} of ${totalCourses} courses.`
            : `${data.programName}: ${completedCourses} of ${totalCourses} courses complete, ${progressPercent}% overall.`
        ) + (
          curriculumTruth && !curriculumTruth.launchable
            ? ` ${curriculumTruth.reason}`
            : ''
        )),
        handoff: {
          recommended: false,
          destination: 'portal',
          href: MEMBER_PROGRAM_HREF,
          reason: null,
        },
      };
    } catch {
      return unavailable(empty, ['course_enrollments', 'course_progress']);
    }
  }

  async function getCourseraProgress(): Promise<AgentGatewayResponse<MemberCourseraProgressData>> {
    const empty: MemberCourseraProgressData = {
      linked: false,
      totalCourses: 0,
      completedCourses: 0,
      averageProgressPercent: 0,
      lastActivityAt: null,
      lastSyncedAt: null,
      courses: [],
    };
    if (!(await inScope())) return notFound(empty, ['users', 'coursera_course_progress']);

    try {
      const snapshot = await reader.loadCourseraSnapshot(principal);
      if (!snapshot || snapshot.totalCourses === 0) {
        return {
          status: 'ok',
          asOf: asOf(),
          source: source(['coursera_course_progress']),
          data: empty,
          memberFacingMessage: 'No synchronized Coursera progress is linked to your account yet.',
          handoff: handoff('portal', MEMBER_PROGRAM_HREF, 'Check activation and course launch status in My Program.'),
        };
      }

      const courses = snapshot.courses.slice(0, MAX_COURSES).map((course) => ({
        name: boundedText(course.name, 'Coursera course'),
        programName: course.programName ? boundedText(course.programName) : null,
        progressPercent: clampPercent(course.progressPercent),
        completed: course.completed,
        lastActivityAt: toIso(course.lastActivityAt),
        certificateAvailable: course.certificateAvailable,
      }));
      const data: MemberCourseraProgressData = {
        linked: true,
        totalCourses: clampCount(snapshot.totalCourses),
        completedCourses: clampCount(snapshot.completedCourses),
        averageProgressPercent: clampPercent(snapshot.averageProgressPercent),
        lastActivityAt: toIso(snapshot.lastActivityAt),
        lastSyncedAt: toIso(snapshot.lastSyncedAt),
        courses,
      };
      return {
        status: 'ok',
        asOf: asOf(),
        source: source(['coursera_course_progress'], snapshot.lastSyncedAt),
        data,
        memberFacingMessage:
          `Synchronized Coursera progress shows ${data.completedCourses} of ${data.totalCourses} courses complete ` +
          `with ${data.averageProgressPercent}% average progress.`,
        handoff: {
          recommended: false,
          destination: 'portal',
          href: MEMBER_PROGRAM_HREF,
          reason: null,
        },
      };
    } catch {
      return unavailable(empty, ['coursera_course_progress']);
    }
  }

  async function invoke(input: unknown): Promise<AgentGatewayResponse<unknown>> {
    const validObject = input !== null && typeof input === 'object' && !Array.isArray(input);
    const record = validObject ? input as Record<string, unknown> : null;
    const keys = record ? Object.keys(record) : [];
    const tool = record?.tool;
    if (
      !record ||
      keys.length !== 1 ||
      keys[0] !== 'tool' ||
      typeof tool !== 'string' ||
      !TOOL_NAMES.has(tool)
    ) {
      return {
        status: 'invalid_request',
        asOf: asOf(),
        source: source(['agent_gateway']),
        data: null,
        memberFacingMessage: 'That agent request was not accepted.',
        handoff: handoff('support', '/dashboard/help', 'The tool request did not match the read-only gateway contract.'),
      };
    }

    switch (tool as MemberAgentToolName) {
      case 'get_my_next_step':
        return getMyNextStep();
      case 'get_training_status':
        return getTrainingStatus();
      case 'get_coursera_progress':
        return getCourseraProgress();
    }
  }

  return {
    getMyNextStep,
    getTrainingStatus,
    getCourseraProgress,
    invoke,
  };
}
