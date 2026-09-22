import { useTranslations } from 'next-intl';
import { Briefcase, Hourglass, Inbox, ListFilter, Sparkles } from 'lucide-react';
import { KitEmptyState } from '@/components/portal/kit/KitEmptyState';
import { EMPLOYER_EMPTY, type EmployerEmptyVariant } from '@/lib/employer/emptyState';

const ICON = {
  postings: Briefcase,
  postingsFiltered: ListFilter,
  pipelineNotLive: Hourglass,
  pipelineNoMatches: Sparkles,
  applications: Inbox,
} as const;

/**
 * The employer list shells with nothing to list (/employer/jobs, /employer/pipeline,
 * /employer/matches, /employer/applications and their boards). `variant` names
 * the situation (lib/employer/emptyState.ts) and picks kind, tone, icon and routes;
 * the words come from `empty.employer.<variant>.*`. Server-safe (next-intl RSC hook);
 * client boards import it too.
 */
export default function EmployerEmptyState({
  variant,
  showAllHref,
  headingAs = 'h3',
  framed = false,
  className,
}: {
  variant: EmployerEmptyVariant;
  /** `postingsFiltered` only: the list without its filter (the filter is URL state). */
  showAllHref?: string;
  headingAs?: 'h2' | 'h3' | 'h4';
  framed?: boolean;
  className?: string;
}) {
  const t = useTranslations('empty');
  const copy = EMPLOYER_EMPTY[variant];
  const Icon = ICON[variant];
  const primaryHref = variant === 'postingsFiltered' ? showAllHref : 'primaryHref' in copy ? copy.primaryHref : undefined;
  const secondaryHref = 'secondaryHref' in copy ? copy.secondaryHref : undefined;
  return (
    <KitEmptyState
      framed={framed}
      kind={copy.kind}
      tone={'tone' in copy ? copy.tone : undefined}
      headingAs={headingAs}
      className={className}
      data-testid="employer-empty"
      data-variant={variant}
      icon={<Icon size={13} aria-hidden="true" />}
      title={t(`employer.${copy.group}.title`)}
      description={t(`employer.${copy.group}.body`)}
      primaryAction={primaryHref ? { label: t(`employer.${copy.group}.action`), href: primaryHref } : undefined}
      secondaryAction={secondaryHref ? { label: t(`employer.${copy.group}.secondary`), href: secondaryHref } : undefined}
    />
  );
}
