import { useTranslations } from 'next-intl';
import { Mic } from 'lucide-react';
import InterviewPrepBundle, { type PrepBundleItem } from '@/components/portal/InterviewPrepBundle';
import { ToolkitToolChrome } from './ToolkitToolChrome';
import { InterviewModeLinks } from '@/components/portal/InterviewModeLinks';

/**
 * Member Portal — interview prep tool page.
 * PageOpener + InterviewPrepBundle so this toolkit destination matches
 * home / jobs / missions chrome.
 *
 * Target route: app/(portal)/dashboard/ai-tools/interview-prep
 * Proof: /dev/member/interview-prep
 * Surface: warm (member-facing).
 */

export function InterviewPrepKit({
  preview = false,
  items,
  initialRole,
  backHref = '/dashboard/ai-tools',
}: {
  /** Skip the bundle fetch so /dev/member proofs stay credential-free. */
  preview?: boolean;
  items?: PrepBundleItem[];
  initialRole?: string;
  backHref?: string;
} = {}) {
  const t = useTranslations('memberWorkspace.interviews');
  return (
    <ToolkitToolChrome
      title={t('bundleTitle')}
      lede="Email or copy the resume, letters, and practice answers you already made."
      icon={<Mic size={13} aria-hidden="true" />}
      backHref={backHref}
      maxWidth={860}
    >
      <InterviewModeLinks current="bundle" role={initialRole} />
      {initialRole ? <p className="wa-kit-meta">{t('bundleRole', { role: initialRole })}</p> : null}
      <InterviewPrepBundle preview={preview} items={items} />
    </ToolkitToolChrome>
  );
}
