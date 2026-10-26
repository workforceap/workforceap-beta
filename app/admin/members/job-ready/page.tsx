import type { Metadata } from 'next';
import { buildPageMetadataAsync } from '@/app/seo';
import MemberJobReadyView from '@/components/admin/workspace/MemberJobReadyView';
import StudentsWorkspace from '@/components/admin/StudentsWorkspace';
import { JOB_READY_TRAINING_PCT } from '@/lib/member/trainingProgress';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'Admin – Job ready',
    description: `Members who have completed ${JOB_READY_TRAINING_PCT}%+ of their training program.`,
    path: '/admin/members/job-ready',
  });
}

/** Existing deep link retained with the Students workspace navigation. */
export default async function AdminJobReadyPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const content = await MemberJobReadyView({ searchParams, embedded: true });
  return <StudentsWorkspace view="readiness" readiness="job">{content}</StudentsWorkspace>;
}
