/**
 * Derives a student's pipeline stage for /admin/pipeline.
 * If `pipelineBoardStage` is set, that manual column wins (Trello-style board).
 * Otherwise stage is computed from enrollment, courses, certifications, and placement.
 */

import type { PipelineBoardStage as DbPipelineBoardStage } from '@prisma/client';
import { computeTrainingProgress, type LiveTrainingProgressSummary } from '@/lib/member/trainingProgress';

export type PipelineStage =
  | 'applied'
  | 'enrolled'
  | 'in_training'
  | 'certified'
  | 'job_searching'
  | 'placed'
  | 'closed';

export interface PipelineStudent {
  id: string;
  fullName: string;
  email: string;
  enrolledProgram: string | null;
  curriculumVersion: string | null;
  enrolledAt: Date | null;
  assessmentCompleted: boolean;
  coursesCompleted?: unknown; // legacy JSON array of course slugs; canonical callers should pass memberProgramProgress
  memberProgramProgress?: LiveTrainingProgressSummary | LiveTrainingProgressSummary[];
  deletedAt: Date | null;
  // Stage derivation only checks whether a placement exists. Callers need not
  // select or construct private placement fields such as salary.
  placementRecord?: object | null;
  userCertifications?: { certName: string; earnedAt: Date }[];
  applications?: { status: string; submittedAt: Date | null }[];
  /** When set, admin kanban column override (see User.pipelineBoardStage). */
  pipelineBoardStage?: DbPipelineBoardStage | null;
}

export function getPipelineStage(student: PipelineStudent): PipelineStage {
  // Closed/deleted
  if (student.deletedAt) return 'closed';

  if (student.pipelineBoardStage) {
    return student.pipelineBoardStage as PipelineStage;
  }

  // Placed
  if (student.placementRecord) return 'placed';

  // Certified (has at least one certification on record)
  if (student.userCertifications && student.userCertifications.length > 0) return 'certified';

  // In training (enrolled + has completed at least one course)
  const progress = computeTrainingProgress({
    enrolledProgram: student.enrolledProgram,
    curriculumVersion: student.curriculumVersion,
    coursesCompleted: student.coursesCompleted,
    liveProgress: student.memberProgramProgress,
  });
  if (student.enrolledAt && progress.completedCount > 0) return 'in_training';

  // Enrolled (approved application + enrolled in a program)
  if (student.enrolledAt && student.enrolledProgram) return 'enrolled';

  // Applied (has a submitted application)
  const hasApp = student.applications?.some((a) => a.submittedAt) ?? false;
  if (hasApp) return 'applied';

  // Default (account created but no application yet)
  return 'applied';
}

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  applied: 'Applied',
  enrolled: 'Enrolled',
  in_training: 'In Training',
  certified: 'Certified',
  job_searching: 'Job Searching',
  placed: 'Placed',
  closed: 'Closed',
};

export const PIPELINE_STAGE_COLORS: Record<PipelineStage, string> = {
  applied: '#6b7280',
  enrolled: '#2563eb',
  in_training: '#7c3aed',
  certified: '#059669',
  job_searching: '#d97706',
  placed: '#16a34a',
  closed: '#9ca3af',
};

export const PIPELINE_STAGES_ORDERED: PipelineStage[] = [
  'applied',
  'enrolled',
  'in_training',
  'certified',
  'job_searching',
  'placed',
];
