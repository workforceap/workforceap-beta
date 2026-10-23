import type { Metadata } from 'next';
import { buildPageMetadataAsync } from '@/app/seo';
import MemberInterviewReadyView from '@/components/admin/workspace/MemberInterviewReadyView';
import StudentsWorkspace from '@/components/admin/StudentsWorkspace';

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadataAsync({
    title: 'Admin – Interview ready',
    description: 'Members who completed pre-screening',
    path: '/admin/members/interview-ready',
  });
}

/** Existing deep link retained with the Students workspace navigation. */
export default async function AdminInterviewReadyPage() {
  const content = await MemberInterviewReadyView({ embedded: true });
  return <StudentsWorkspace view="readiness" readiness="interview">{content}</StudentsWorkspace>;
}
