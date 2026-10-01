import { ArrowRight, Check, Download } from 'lucide-react';
import LocalizedLink from '@/components/LocalizedLink';
import Footer from '@/components/Footer';
import MobileBottomNav from '@/components/MobileBottomNav';
import ThankYouViewTracker from '@/components/marketing/ThankYouViewTracker';
import type { ThankYouFunnel } from '@/lib/analytics/events';

type ConversionThankYouPageProps = {
  funnel: ThankYouFunnel;
  title: string;
  lead: string;
  bullets?: { title: string; description: string }[];
  resource?: { label: string; href: string; external?: boolean };
  ctas?: { label: string; href: string; variant?: 'primary' | 'outline' | 'muted' }[];
};

function CtaLink({ label, href, variant = 'primary' }: { label: string; href: string; variant?: 'primary' | 'outline' | 'muted' }) {
  const className = variant === 'primary' ? 'btn btn-primary' : variant === 'outline' ? 'btn btn-secondary' : 'btn btn-muted';
  return (
    <LocalizedLink href={href} className={className}>
      {label}
    </LocalizedLink>
  );
}

export default function ConversionThankYouPage({
  funnel,
  title,
  lead,
  bullets,
  resource,
  ctas = [],
}: ConversionThankYouPageProps) {
  const defaultCtas =
    ctas.length > 0
      ? ctas
      : [{ label: 'Back to home', href: '/', variant: 'muted' as const }];

  return (
    <div className="inner-page">
      <ThankYouViewTracker funnel={funnel} />
      <section className="content-section" style={{ paddingBottom: '2rem' }}>
        <div className="container" style={{ maxWidth: 720, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div
              style={{
                width: '5rem',
                height: '5rem',
                borderRadius: '9999px',
                background: 'linear-gradient(135deg, #8c0f37, #ad2c4d)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.25rem',
                boxShadow: '0 20px 40px -12px rgba(140,15,55,0.35)',
              }}
            >
              <Check size={40} strokeWidth={2.5} color="#fff" aria-hidden="true" />
            </div>
            <h1 className="text-display-sm" style={{ marginBottom: '0.75rem', color: 'var(--color-on-surface)' }}>
              {title}
            </h1>
            <p style={{ color: 'var(--color-on-surface)', fontSize: '1.05rem', lineHeight: 1.65, maxWidth: '36rem', margin: '0 auto', fontWeight: 600 }}>
              {lead}
            </p>
          </div>

          {bullets && bullets.length > 0 ? (
            <section
              style={{
                background: 'var(--surface-container-low)',
                borderRadius: '1rem',
                padding: '1.5rem',
                marginBottom: '1.5rem',
              }}
            >
              <h2
                style={{
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  color: 'var(--wa-accent-text)',
                  margin: '0 0 1.25rem',
                }}
              >
                What to expect
              </h2>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {bullets.map((item) => (
                  <li key={item.title} style={{ display: 'flex', gap: '0.875rem', alignItems: 'flex-start' }}>
                    <ArrowRight
                      size={20}
                      aria-hidden="true"
                      style={{ color: 'var(--wa-accent-text)', flexShrink: 0, marginTop: '0.1rem' }}
                    />
                    <div>
                      <p style={{ margin: 0, fontWeight: 700, color: 'var(--color-on-surface)' }}>{item.title}</p>
                      <p style={{ margin: '0.35rem 0 0', color: 'var(--color-on-surface-variant)', lineHeight: 1.6 }}>{item.description}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {resource ? (
            <section
              style={{
                background: 'var(--surface-container-lowest)',
                border: '1px solid var(--outline-variant)',
                borderRadius: '1rem',
                padding: '1.5rem',
                marginBottom: '1.5rem',
                textAlign: 'center',
              }}
            >
              <p style={{ margin: '0 0 1rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.6 }}>In the meantime:</p>
              <ResourceLink resource={resource} />
            </section>
          ) : null}

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', justifyContent: 'center' }}>
            {defaultCtas.map((cta) => (
              <CtaLink key={`${cta.href}-${cta.label}`} label={cta.label} href={cta.href} variant={cta.variant} />
            ))}
          </div>
        </div>
      </section>

      <Footer />
      <MobileBottomNav />
      <div className="mobile-bottom-nav-spacer" aria-hidden="true" />
    </div>
  );
}

function ResourceLink({ resource }: { resource: { label: string; href: string; external?: boolean } }) {
  if (resource.external) {
    return (
      <a
        href={resource.href}
        className="btn btn-primary"
        target="_blank"
        rel="noopener noreferrer"
        download={resource.href.endsWith('.pdf') ? true : undefined}
      >
        <Download size={18} aria-hidden="true" style={{ marginRight: '0.35rem' }} />
        {resource.label}
      </a>
    );
  }

  return (
    <LocalizedLink href={resource.href} className="btn btn-primary">
      <Download size={18} aria-hidden="true" style={{ marginRight: '0.35rem' }} />
      {resource.label}
    </LocalizedLink>
  );
}
