# Voice experience and data boundaries

This is an interactive design proposal grounded in the source at `efc27e4a4ebeba09b5261e7b1c36463d01925017`. The current repository master and existing review PR head were refreshed before this extension. It does not establish that the proposed presentation or simulated behaviors have shipped.

## Entry points and components

| Workspace | Existing source route | Proposed review component |
| --- | --- | --- |
| Member | `/dashboard` | Prominent entry to voice coaching beside the next step |
| Member | `/dashboard/ai-tools` | Voice-first Coaches, Practice, Resume and All Tools workspace |
| Member | `/dashboard/readiness` | Readiness conversation beside the readiness evidence |
| Member | `/dashboard/counselor` | Lilley career session and next-step context |
| Member | `/dashboard/ai-tools/career-business-coach` | Lilley's broader career/business topic entry |
| Member | `/dashboard/ai-tools/voice-interview` | Interview setup, transcript and coaching panel |
| Member | `/dashboard/resume` and résumé workspace | Explicit entry to voice coaching and résumé suggestion review |
| Counselor | `/counselor/overview` | Separately scoped staff voice assistant beside caseload work |
| Employer | `/employer` | Employer assistant for the employer workspace |
| Partner | `/partner` | Partner assistant for referrals and partner tools |

The canonical hub uses existing `tab` and `agent` query parameters. The source supports `readiness`, `resume`, `mock`, `counselor` and `business`. The business entry resolves to Lilley's legacy business/career purpose. Elevator Introduction remains a written/rehearsal tool. An admin-specific agent was not established by the inspected source.

Primary source files:

- `app/(portal)/dashboard/ai-tools/page.tsx`
- `components/portal/kit/pages/VoiceStudioKit.tsx`
- `components/portal/PortalVoiceSession.tsx`
- `components/portal/kit/VoiceOrb.tsx`
- `components/portal/ResumeCoachWorkspace.tsx`
- `components/portal/tools/VoiceInterviewScaffold.tsx`
- `components/portal/tools/CareerCounselor.tsx`
- `components/portal/CompactReadinessCoach.tsx`
- `components/portal/CounselorPortalVoiceBlock.tsx`
- `lib/elevenlabs/agentRegistry.ts`
- `lib/agents/gateway/types.ts`

## What each companion panel is for

Readiness connects the conversation to a specific next milestone without inventing a verified score or an eligibility decision. Résumé coaching presents the existing text and a proposed revision side by side; a suggestion never silently edits the draft. Interview practice keeps the target role and question visible while the member reviews a response. Lilley shows the next step, training and Coursera context with provenance and freshness; a context error stays distinguishable from an empty result. The business entry helps choose a communication, sales, marketing or project-management topic.

Staff, employer and partner panels describe their own workspace. The staff counselor audience is separate from the student counselor audience and fails closed when unavailable in the source. A role switch in this review selects a synthetic workspace; it does not grant access or represent a production authentication operation.

## Session data strategy

| Data | Owner and lifecycle | Boundary |
| --- | --- | --- |
| Agent identity and audience | Server-owned registry in the real app; explicit fixture key in this review | A client-selected key must not authorize a staff or tenant context |
| Voice connection state | Ephemeral session state | Connecting, listening, speaking, muted, failed and ended are separate; interruption does not imply completion |
| Transcript | Speaker-labelled session content | A visible transcript does not prove durable history, provider retention policy or a completed save |
| Member context | Read-only, principal-scoped gateway response | Preserve source, freshness, status and handoff destination; no invented broad access |
| Résumé suggestion | Proposed change against the selected draft | Show before/after; accept or reject explicitly; local review acceptance does not update the production document |
| Completion receipt | Endpoint-specific durable record in the real app | An ended call and a confirmed completion are different states; an uncertain save needs reconciliation |
| Email or human handoff | Separately authorized operation with its own destination and outcome | Never infer a send from ending a session or accepting a suggestion |

Lilley's approved member tools in the inspected gateway are `get_my_next_step`, `get_training_status` and `get_coursera_progress`. They are read-only. The authenticated server principal supplies the user, organization and role. The review does not imply that a coach enrolls a member, edits arbitrary records or sends messages on request.

## Retention is entry-specific

The canonical Voice Studio session tab explicitly does not save the conversation into AI history or coach memory. It has no completion/checkpoint endpoint wired in that component. This is an application-history statement, not a claim about a provider's independent retention policy.

The dedicated Lilley and business entry points have completion behavior that can save captured transcript/history or memory and may email configured support. Compact readiness has completion and checkpoint behavior. Dedicated voice interview has transcript completion. Employer and partner blocks did not expose completion/checkpoint props in the inspected source. These entry points must not inherit an inaccurate blanket “nothing is saved” disclosure from the canonical Studio.

Every entry point in this mockup is local and synthetic. No production completion, checkpoint, recording, email, history or memory operation runs. Reloading clears session fixtures. Before a production implementation changes these boundaries, verify the precise component and endpoint together, including authorization, retry identity, failed/uncertain completion, accessible controls and disclosure text.

## Acceptance distinction

The browser checks for this extension cover the rendered review, session controls, local draft decisions, route navigation, responsive presentation and absence of media/network operations. They do not certify provider availability, microphone permission behavior on physical devices, audio quality, real time latency, authenticated isolation or production retention. Those require separate acceptance against the exact implementation and deployment.
