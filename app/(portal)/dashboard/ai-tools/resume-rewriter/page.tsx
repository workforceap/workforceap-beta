import { redirect } from 'next/navigation';
import { resumeWorkspaceHref } from '@/lib/member/memberWorkspace';

/** Legacy deep links retain their view and saved-result context. */
export default async function ResumeToolRedirect({ searchParams }: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams ?? {})) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item);
  }
  redirect(resumeWorkspaceHref('rewrite', params));
}
