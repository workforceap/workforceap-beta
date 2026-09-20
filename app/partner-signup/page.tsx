'use client';

import { useEffect } from 'react';

/** Canonical signup is on `/partners#partner-signup` (single self-service path). */
export default function PartnerSignupRedirectPage() {
  useEffect(() => {
    // The destination is served by Astro and cannot handle a Next RSC request.
    window.location.replace('/partners#partner-signup');
  }, []);
  return (
    <div className="mdx inner-page" style={{ background: 'var(--mdx-bg)', minHeight: '60vh' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto', padding: '32px 16px' }}>
        <section className="mdx-stage" style={{ textAlign: 'center' }}>
          <span className="mdx-pill">Partner Registration</span>
          <h1>
            Opening <span className="mdx-grad-accent">partner registration</span>
          </h1>
          <p style={{ margin: '0 auto' }}>
            Taking you to the WorkforceAP partner sign-up. If it does not load
            automatically, use the button below.
          </p>
          <div style={{ marginTop: '24px' }}>
            <a
              href="/partners#partner-signup"
              className="btn btn-primary"
            >
              Continue to partner sign-up
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
