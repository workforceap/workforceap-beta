import 'server-only';

import { getActiveProgramForDashboard } from '@/lib/member/getActiveProgramForDashboard';
import { programStartAccessFromDashboardView } from '@/lib/member/programStartEnrollment';
import {
  loadMemberEmployerScreeningPack,
  loadMemberEmployerScreeningProgram,
} from '@/lib/member/employerScreeningRoute';

export type ProgramRouteAuditFacts = {
  version: 1;
  start: { hasResolvedProgram: boolean };
  employerScreening: {
    hasResolvedProgram: boolean;
    pack: 'available' | 'absent' | 'invalid' | 'not_applicable';
  };
};

/**
 * Data prerequisites, not route success. Only the caller's existing program
 * resolvers and database reads run here; no training providers are contacted.
 * Errors propagate so unavailable evidence cannot masquerade as a missing fixture.
 */
export async function loadProgramRouteAuditFacts(userId: string): Promise<ProgramRouteAuditFacts> {
  const [activeProgram, screening] = await Promise.all([
    getActiveProgramForDashboard({ userId }),
    loadMemberEmployerScreeningProgram(userId),
  ]);
  const start = programStartAccessFromDashboardView(activeProgram);
  const pack = screening.slug
    ? (await loadMemberEmployerScreeningPack(screening.slug)).status
    : 'not_applicable';

  return {
    version: 1,
    start: { hasResolvedProgram: !start.bounceToProgram },
    employerScreening: { hasResolvedProgram: Boolean(screening.slug), pack },
  };
}
