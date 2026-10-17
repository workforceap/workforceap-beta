import { notFound } from 'next/navigation';
import { assertDevMemberPreview } from '@/app/dev/member/harness/assertDevMemberPreview';
import { DevMemberFullViews } from '@/app/dev/member/harness/DevMemberFullViews';
import { DevMemberStateFrame } from '@/app/dev/member/harness/DevMemberStateFrame';
import { DEV_MEMBER_VIEW_BY_SLUG, parseDevMemberState } from '@/app/dev/member/harness/registry';

export const dynamic = 'force-dynamic';

export default async function DevMemberHarnessPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ state?: string }>;
}) {
  assertDevMemberPreview();
  const { slug } = await params;
  const view = DEV_MEMBER_VIEW_BY_SLUG[slug];
  if (!view) notFound();
  const state = parseDevMemberState((await searchParams).state);

  return (
    <div data-dev-member-harness={view.slug} data-dev-member-state={state} data-dev-member-kind={view.kind}>
      <DevMemberStateFrame view={view} state={state}>
        <DevMemberFullViews view={view} />
      </DevMemberStateFrame>
    </div>
  );
}
