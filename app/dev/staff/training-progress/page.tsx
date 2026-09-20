import { notFound } from 'next/navigation';
import {
  StudentsRosterKit,
  type StudentRow,
} from '@/components/portal/kit/pages/admin-subviews/StudentsRosterKit';
import type { TrainingPace } from '@/lib/admin/trainingProgressPrograms';
import { initialsFrom } from '@/lib/admin/studentsRosterView';

/**
 * Showcase-only render of the admin roster's training preset — no auth/DB, so
 * screenshot tooling can photograph sorted column headers directly.
 */
export const dynamic = 'force-dynamic';

const PROGRAMS = [
  'IT Support Professional Certificate (IBM)',
  'AI and Software Developer Professional Certificate',
  'Google Cybersecurity Professional Certificate',
  'AWS Cloud Solutions Architect Professional Certificate',
] as const;

const PACES: readonly TrainingPace[] = ['On track', 'Ahead', 'Behind', 'Stalled'];

const NAMES = [
  'Noel Gonzalez',
  'Joseph David Ring',
  'Avery Stone',
  'Maria Santos',
  'Priya Kapoor',
  'James Whitmore',
] as const;

const ROWS: StudentRow[] = Array.from({ length: 53 }, (_, index) => {
  const program = PROGRAMS[index % PROGRAMS.length];
  const modulesTotal = 10 + (index % 8);
  const modulesDone = Math.min(modulesTotal, Math.floor((index * 7) % (modulesTotal + 1)));
  const percentComplete = modulesTotal > 0 ? Math.round((modulesDone / modulesTotal) * 100) : 0;
  const pace = PACES[index % PACES.length];
  const noProgram = index % 11 === 0;
  const unmatched = index === 52;
  const name = unmatched ? 'Zed Coursera' : NAMES[index % NAMES.length];
  return {
    id: unmatched ? 'coursera:zed@example.com' : `u${index}:prog-${index % 4}`,
    name,
    email: unmatched ? 'zed@example.com' : `${name.toLowerCase().replace(/\s+/g, '.')}@example.test`,
    initials: initialsFrom(name),
    program: unmatched ? 'Coursera activity' : program,
    progress: percentComplete,
    progressKnown: true,
    training: { modulesDone, modulesTotal, pace },
    courseraGrade: index % 5 === 0 ? null : 70 + (index % 28),
    inWap: !unmatched,
    noProgram: !unmatched && noProgram,
    lastActive: index % 4 === 0 ? '16d ago' : index % 2 === 0 ? '2h ago' : '1d ago',
    lastActiveAt: Date.now() - index * 86_400_000,
  };
});

export default function DevStaffTrainingProgressPage() {
  if (process.env.VERCEL_ENV === 'production') notFound();

  return (
    <StudentsRosterKit
      view="training"
      students={ROWS}
      total={ROWS.length}
      showingLabel="47 of 128 members have training activity · 81 not in a program or course yet · Showing 53 learners"
    />
  );
}
