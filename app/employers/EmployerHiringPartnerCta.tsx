import {
  getEmployerHiringPartnerCtaHref,
  isEmployerHiringPartnerCtaExternal,
} from '@/lib/marketing/employerLanding';
import { marketingButtonPresets } from '@/lib/marketing/buttonClasses';
import { CalendarDays } from 'lucide-react';

type EmployerHiringPartnerCtaProps = {
  label: string;
  onDark?: boolean;
  className?: string;
};

export default function EmployerHiringPartnerCta({
  label,
  onDark = false,
  className = '',
}: EmployerHiringPartnerCtaProps) {
  const href = getEmployerHiringPartnerCtaHref();
  const external = isEmployerHiringPartnerCtaExternal();
  const classes = [
    onDark ? marketingButtonPresets.heroPrimary() : marketingButtonPresets.formSubmitPrimary(),
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <a
      href={href}
      className={classes}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {label}
      <CalendarDays size={18} aria-hidden="true" />
    </a>
  );
}
