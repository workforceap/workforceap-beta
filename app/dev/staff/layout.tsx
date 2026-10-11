import type { ReactNode } from 'react';
import DevPartnerFrame from './DevPartnerFrame';
// Full portal stylesheet chain so staff-side kits (incl. the counselor roster,
// which needs counselor.css) render exactly as production does.
import '@/css/portal.css';
import '@/css/portal-a11y.css';
import '@/css/counselor.css';
import '@/css/language-toggle.css';
import '@/css/mobile-dashboard-fixes.css';

export const metadata = { robots: { index: false, follow: false } };

export default function DevStaffLayout({ children }: { children: ReactNode }) {
  if (process.env.VERCEL_ENV === 'production') return children;
  return <DevPartnerFrame>{children}</DevPartnerFrame>;
}
