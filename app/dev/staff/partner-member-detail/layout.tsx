import type { ReactNode } from 'react';
import '@/css/portal.css';

export const metadata = {
  title: 'Partner Member Detail — Staff Showcase',
  robots: { index: false, follow: false },
};

export default function DevStaffPartnerMemberDetailLayout({ children }: { children: ReactNode }) {
  return <div style={{ background: 'var(--wa-bg)', minHeight: '100vh' }}>{children}</div>;
}
