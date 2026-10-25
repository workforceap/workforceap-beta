import type { Metadata } from 'next';
import { buildPageMetadataAsync } from '@/app/seo';
import MemberManagementView from '@/components/admin/workspace/MemberManagementView';
import StudentsWorkspace from '@/components/admin/StudentsWorkspace';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin');
  return buildPageMetadataAsync({
    title: t('adminMembers'),
    description: t('memberListAndManagement'),
    path: '/admin/members',
  });
}

/** Existing deep link retained with the Students workspace navigation. */
export default async function AdminMembersPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const content = await MemberManagementView({ searchParams, embedded: true });
  return <StudentsWorkspace view="manage">{content}</StudentsWorkspace>;
}
