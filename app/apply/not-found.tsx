import type { Metadata } from 'next';
import LocalizedLink from '@/components/LocalizedLink';
import Image from 'next/image';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: 'Page not found',
};

export default function NotFound() {
  return (
    <div className="app-system-page">
      <div className="app-system-page__inner container">
        <LocalizedLink href="/" className="app-system-page__logo-link" aria-label="Workforce Advancement Project home">
          <Image
            src="/images/wap_logo.png"
            alt="WorkforceAP logo"
            width={180}
            height={92}
            className="app-system-page__logo"
            sizes="180px"
            quality={85}
          />
        </LocalizedLink>
        <p className="app-system-page__eyebrow">404</p>
        <h1 className="app-system-page__title">Page not found</h1>
        <p className="app-system-page__text">
          The link may be broken or the page may have moved. Try one of the options below, or email{' '}
          <a href="mailto:info@workforceap.org">info@workforceap.org</a> if you need help.
        </p>
        <div className="app-system-page__actions">
          <LocalizedLink href="/" className="btn btn-primary">
            Back to home
          </LocalizedLink>
          <LocalizedLink href="/apply" className="btn btn-secondary">
            Apply for training
          </LocalizedLink>
          <LocalizedLink href="/contact" className="btn btn-app-system-ghost">
            Contact us
          </LocalizedLink>
        </div>
      </div>
      <Footer />
    </div>
  );
}
