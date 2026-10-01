/**
 * Pure state machine for the "Enroll in this course" button.
 *
 * The route handler at `/api/member/coursera/enroll-in-course` is a thin
 * shim around this module: it loads the User row + active program, then
 * delegates the four B4B state-graph branches here.
 *
 * Why a separate module:
 *   1. **Testability.** The route handler imports `next/server`, prisma,
 *      Supabase auth — all hard to mock under `node --test`. This module
 *      takes plain inputs (a B4B-client port, plain DB facts) so the four
 *      decision branches can be exercised with a fake port and asserted
 *      directly.
 *   2. **Single source of truth for the state graph.** The four cases —
 *      "not in roster", "in roster but not in program", "in program but
 *      not enrolled", "already enrolled" — have to fold cleanly into the
 *      same `{ status, message }` shape the UI consumes. Centralizing them
 *      here keeps the route file from growing into spaghetti.
 *   3. **Idempotency contract.** Clicking Enroll twice must not double-
 *      charge. The second click should resolve via the "already enrolled"
 *      branch (or the "in program → enroll → 400 ALREADY_ENROLLED →
 *      already-enrolled" fold, also handled here).
 *
 * What this file does NOT do:
 *   - Eligibility / approval check. The route does that BEFORE calling in.
 *   - Audit logging. The route writes audit rows after each step using the
 *     `events` array we return.
 *   - Auto-sync kickoff. The route fires that after a successful enroll.
 */

import type {
  B4BEnrollment,
  B4BInvitation,
  B4BMembership,
  B4BUser,
  B4BWriteResult,
} from './b4bClient';

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export type EnrollStatus =
  | 'invited'
  | 'enrolled'
  | 'already-enrolled'
  | 'membership-created-and-enrolled';

export type EnrollResult = {
  status: EnrollStatus;
  message: string;
  /**
   * Per-step audit trail the route handler turns into AuditLog rows.
   * Only includes the B4B writes that actually happened (no entries
   * for the read-side `listUsers` lookup).
   */
  events: EnrollAuditEvent[];
};

export type EnrollAuditError = {
  status: 'error';
  /** B4B HTTP status, or 0 for a transport failure. */
  httpStatus: number;
  message: string;
  step: 'invite' | 'membership' | 'enroll';
};

export type EnrollAuditEvent =
  | {
      step: 'invite';
      action: 'coursera_invited';
      httpStatus: number;
      programId: string;
      contentId: string;
      externalId: string;
    }
  | {
      step: 'membership';
      action: 'coursera_membership_created';
      httpStatus: number;
      programId: string;
      contentId: string;
      externalId: string;
    }
  | {
      step: 'enroll';
      action: 'coursera_course_enrolled';
      httpStatus: number;
      programId: string;
      contentId: string;
      externalId: string;
      /** True when Coursera 4xx'd with "already enrolled" — still a successful UX outcome. */
      alreadyEnrolled?: boolean;
    };

/**
 * The B4B operations this module needs. Modeled as a port so tests can
 * inject a fake; the real implementation lives in `b4bClient.ts`.
 */
export interface B4BPort {
  listUsersByEmail(email: string): Promise<B4BUser | null>;
  invite(args: {
    orgId: string;
    programId: string;
    externalId: string;
    fullName: string;
    email: string;
  }): Promise<B4BWriteResult<B4BInvitation>>;
  createMembership(args: {
    orgId: string;
    programId: string;
    externalId: string;
    fullName: string;
    email: string;
  }): Promise<B4BWriteResult<B4BMembership>>;
  enroll(args: {
    orgId: string;
    programId: string;
    externalId: string;
    contentId: string;
  }): Promise<B4BWriteResult<B4BEnrollment>>;
}

export type EnrollStateInput = {
  orgId: string;
  programId: string;
  /** Coursera courseId (Course.contentId). */
  courseraCourseId: string;
  /** Stable identifier for the learner — we standardize on the WAP email. */
  externalId: string;
  email: string;
  fullName: string;
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function userInProgram(user: B4BUser, programId: string): boolean {
  const ids = Array.isArray(user.membershipProgramIds) ? user.membershipProgramIds : [];
  return ids.includes(programId);
}

/**
 * Coursera returns a 400 with `errorCode: ALREADY_ENROLLED` (sometimes
 * `errorCode: USER_ALREADY_ENROLLED` or a free-text message) when re-
 * enrolling an existing learner. We treat any of those as a success and
 * surface `status: 'already-enrolled'` so the UI doesn't error.
 */
function looksLikeAlreadyEnrolled(result: { status: number; error: string; body?: string }): boolean {
  if (result.status !== 400 && result.status !== 409) return false;
  const haystack = `${result.error} ${result.body ?? ''}`.toLowerCase();
  return /already.*enroll/.test(haystack) || haystack.includes('already_enrolled');
}

/* ------------------------------------------------------------------ */
/*  State machine                                                      */
/* ------------------------------------------------------------------ */

/**
 * Run the enrollment state machine. Returns either a successful
 * `EnrollResult` (which the route serializes to the client) or throws
 * `EnrollStateError` containing enough context for the route to log + 502.
 */
export async function runEnrollStateMachine(
  port: B4BPort,
  input: EnrollStateInput,
): Promise<EnrollResult> {
  const { orgId, programId, courseraCourseId, externalId, email, fullName } = input;
  const events: EnrollAuditEvent[] = [];

  // ---------- Branch 1: not in roster → send Coursera invite ----------
  const existing = await port.listUsersByEmail(email);
  if (!existing) {
    const invite = await port.invite({
      orgId,
      programId,
      externalId,
      fullName,
      email,
    });
    events.push({
      step: 'invite',
      action: 'coursera_invited',
      httpStatus: invite.status,
      programId,
      contentId: courseraCourseId,
      externalId,
    });
    if (!invite.ok) {
      throw new EnrollStateError({
        step: 'invite',
        httpStatus: invite.status,
        message: invite.error,
        events,
      });
    }
    return {
      status: 'invited',
      message:
        "Check your email — Coursera sent an invite. After accepting, click Enroll again.",
      events,
    };
  }

  // ---------- Branch 2: in roster, not in program → membership + enroll ----------
  if (!userInProgram(existing, programId)) {
    const membership = await port.createMembership({
      orgId,
      programId,
      externalId,
      fullName,
      email,
    });
    events.push({
      step: 'membership',
      action: 'coursera_membership_created',
      httpStatus: membership.status,
      programId,
      contentId: courseraCourseId,
      externalId,
    });
    if (!membership.ok) {
      // Coursera sometimes returns 400 "already a member" if there's a
      // race between two clicks. Tolerate that and fall through to enroll.
      const okOrAlready =
        membership.status === 400 &&
        /already.*member|already_member/i.test(`${membership.error} ${membership.body ?? ''}`);
      if (!okOrAlready) {
        throw new EnrollStateError({
          step: 'membership',
          httpStatus: membership.status,
          message: membership.error,
          events,
        });
      }
    }
    return enrollAndReport(port, input, events, /* membershipJustCreated */ true);
  }

  // ---------- Branches 3 & 4: in program → enroll (or already enrolled) ----------
  return enrollAndReport(port, input, events, /* membershipJustCreated */ false);
}

async function enrollAndReport(
  port: B4BPort,
  input: EnrollStateInput,
  events: EnrollAuditEvent[],
  membershipJustCreated: boolean,
): Promise<EnrollResult> {
  const enroll = await port.enroll({
    orgId: input.orgId,
    programId: input.programId,
    externalId: input.externalId,
    contentId: input.courseraCourseId,
  });

  if (enroll.ok) {
    events.push({
      step: 'enroll',
      action: 'coursera_course_enrolled',
      httpStatus: enroll.status,
      programId: input.programId,
      contentId: input.courseraCourseId,
      externalId: input.externalId,
    });
    return {
      status: membershipJustCreated ? 'membership-created-and-enrolled' : 'enrolled',
      message: 'Enrolled! Refresh to see progress.',
      events,
    };
  }

  if (looksLikeAlreadyEnrolled(enroll)) {
    events.push({
      step: 'enroll',
      action: 'coursera_course_enrolled',
      httpStatus: enroll.status,
      programId: input.programId,
      contentId: input.courseraCourseId,
      externalId: input.externalId,
      alreadyEnrolled: true,
    });
    return {
      status: 'already-enrolled',
      message: 'Already enrolled.',
      events,
    };
  }

  events.push({
    step: 'enroll',
    action: 'coursera_course_enrolled',
    httpStatus: enroll.status,
    programId: input.programId,
    contentId: input.courseraCourseId,
    externalId: input.externalId,
  });
  throw new EnrollStateError({
    step: 'enroll',
    httpStatus: enroll.status,
    message: enroll.error,
    events,
  });
}

/* ------------------------------------------------------------------ */
/*  Member-facing failure copy                                         */
/* ------------------------------------------------------------------ */

type EnrollStep = 'invite' | 'membership' | 'enroll';

type EnrollFailureView = {
  code: 'COURSERA_UNAVAILABLE' | 'COURSERA_ENROLL_REJECTED';
  error: string;
  step: EnrollStep;
};

/**
 * Fixed, actionable copy for a failed provider step. Built only from the
 * step and HTTP status: the provider's error text (and therefore the
 * `EnrollStateError.message`) can carry account or internal detail and must
 * never reach the member. A 4xx is a Coursera rejection that will not fix
 * itself, so the member is pointed at their counselor. Anything else (a
 * transport failure, status 0, or a 5xx) is worth retrying. The copy never
 * claims that staff were notified: nothing here notifies anyone.
 */
export function enrollFailureView(args: { step: EnrollStep; httpStatus: number }): EnrollFailureView {
  const rejected = args.httpStatus >= 400 && args.httpStatus < 500;
  if (!rejected) {
    return {
      code: 'COURSERA_UNAVAILABLE',
      error: "We couldn't reach Coursera just now. Please try again in a few minutes.",
      step: args.step,
    };
  }
  return {
    code: 'COURSERA_ENROLL_REJECTED',
    error:
      "Coursera couldn't complete this enrollment. Please message your counselor so they can sort it out with you.",
    step: args.step,
  };
}

/**
 * Fixed copy for `CourseraRosterIncompleteError` (lib/coursera/enrollPort.ts):
 * the roster scan did not finish, so the state machine stopped before any
 * write. Nothing was sent; a later retry does a fresh scan.
 */
export const COURSERA_ROSTER_INCOMPLETE_VIEW = {
  code: 'COURSERA_ROSTER_INCOMPLETE',
  error:
    "We couldn't finish checking your Coursera account, so no invitation was sent. Please try again in a few minutes.",
} as const;

/* ------------------------------------------------------------------ */
/*  Error type                                                         */
/* ------------------------------------------------------------------ */

export class EnrollStateError extends Error {
  readonly step: 'invite' | 'membership' | 'enroll';
  readonly httpStatus: number;
  readonly events: EnrollAuditEvent[];

  constructor(args: {
    step: 'invite' | 'membership' | 'enroll';
    httpStatus: number;
    message: string;
    events: EnrollAuditEvent[];
  }) {
    super(`[enroll-state] ${args.step} failed (${args.httpStatus}): ${args.message}`);
    this.name = 'EnrollStateError';
    this.step = args.step;
    this.httpStatus = args.httpStatus;
    this.events = args.events;
  }
}
