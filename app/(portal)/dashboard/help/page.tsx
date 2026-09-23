import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Gift, GraduationCap, Headset, Sparkles, ArrowRight } from 'lucide-react';
import { buildPageMetadataAsync } from '@/app/seo';
import { getUser } from '@/lib/auth/server';
import PageHeader from '@/components/portal/PageHeader';
import { DesignSurface, CardHead } from '@/components/portal/kit';
import type { HelpRequestAudience } from '@/lib/member/helpContactCopy';
import { helpRequestAudienceOf, resolveHelpRequestRecipient } from '@/lib/member/helpRequestRecipient';
import NeedAPersonCard from './NeedAPersonCard';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard');
  return buildPageMetadataAsync({
    title: t('helpMetaTitle'),
    description: t('helpMetaDesc'),
    path: '/dashboard/help',
  });
}

type HelpItem = { icon: LucideIcon; title: string; body: string; href?: string; cta?: string };

/**
 * Quick links. The Messages entry follows the same recipient the "Need a
 * person?" card names: with no counselor, Messages reaches the WorkforceAP
 * support team (the inbox labels it that way), so the link must not tell the
 * member to message a counselor they do not have.
 */
function helpItems(audience: HelpRequestAudience | null): HelpItem[] {
  const messages: HelpItem =
    audience?.kind === 'team'
      ? {
          icon: Headset,
          title: 'Message the WorkforceAP team',
          body: 'You do not have a counselor yet. Message the WorkforceAP support team from the Messages page for any support.',
          href: '/dashboard/messages',
          cta: 'Open messages',
        }
      : {
          icon: Headset,
          title: 'Talk to your counselor',
          body: 'Your counselor is your main point of contact. Message them directly from the Messages page for any support.',
          href: '/dashboard/messages',
          cta: 'Open messages',
        };
  return [
    {
      icon: GraduationCap,
      title: 'Coursera Access',
      body: 'Request access to professional certificate courses included through your WorkforceAP membership.',
    },
    messages,
    {
      icon: Sparkles,
      title: 'AI Career Tools',
      body: 'Use our suite of tools to build your resume, prep for interviews, and match to jobs.',
      href: '/dashboard/ai-tools',
      cta: 'Open AI Career Tools',
    },
  ];
}

export default async function DashboardHelpPage() {
  const user = await getUser();
  if (!user) redirect('/login?redirectTo=/dashboard/help');

  // Same recipient POST /api/member/request-help emails, so "Need a person?"
  // names the right person. A failed read must not take the help page down:
  // the card then describes both possible recipients instead of guessing.
  let audience: HelpRequestAudience | null = null;
  try {
    audience = helpRequestAudienceOf(await resolveHelpRequestRecipient(user.id));
  } catch (error) {
    console.error('[dashboard/help] help request recipient lookup failed', error);
  }

  return (
    <DesignSurface surface="warm">
      <div style={{ maxWidth: 'var(--max-width, 52rem)', margin: '0 auto', padding: '0 1rem 4rem' }}>
        <div style={{ marginTop: '1rem', marginBottom: '2rem' }}>
          <PageHeader
            title="Help and support"
            subtitle="Questions or need access to a benefit? Here&rsquo;s how to get help."
            breadcrumbs={[
              { label: 'Member Portal', href: '/dashboard' },
              { label: 'Help and support' },
            ]}
          />
        </div>

        {/* Need a person? — Request help + Share feedback (were legacy-home only, WAP-188) */}
        <div style={{ marginBottom: '2rem' }}>
          <NeedAPersonCard audience={audience} />
        </div>

        {/* Request benefit access */}
        <section style={{ marginBottom: '2rem' }}>
          <div className="wa-kit-card">
            <div className="wa-flex wa-items-start wa-gap-4">
              <div
                aria-hidden="true"
                style={{
                  width: '2.5rem',
                  height: '2.5rem',
                  borderRadius: 'var(--wa-radius-sm)',
                  background: 'var(--wa-accent-soft)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Gift size={20} style={{ color: 'var(--wa-accent)' }} aria-hidden="true" />
              </div>
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--wa-text)', marginBottom: '0.5rem' }}>
                  Request Benefit Access
                </h2>
                <p style={{ fontSize: '0.875rem', color: 'var(--wa-muted)', lineHeight: 1.6, marginBottom: '0.75rem' }}>
                  To request access to Coursera or other member benefits,{' '}
                  {audience?.kind === 'team'
                    ? 'message the WorkforceAP team from the Messages page'
                    : 'contact your WorkforceAP counselor'}{' '}
                  or email{' '}
                  <a href="mailto:info@workforceap.org" style={{ color: 'var(--wa-accent)', fontWeight: 600, textDecoration: 'none' }}>
                    info@workforceap.org
                  </a>{' '}
                  with your name and the benefit you&rsquo;d like to request.
                </p>
                <p style={{ fontSize: '0.8125rem', color: 'var(--wa-muted)', lineHeight: 1.5, margin: 0 }}>
                  We&rsquo;ll review your request and follow up by email.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Quick links */}
        <section style={{ marginBottom: '2rem' }}>
          <CardHead title="Quick links" />
          <div className="wa-space-y-3">
            {helpItems(audience).map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="wa-kit-card wa-kit-card--sm">
                  <div className="wa-flex wa-items-start wa-gap-4">
                    <div
                      aria-hidden="true"
                      style={{
                        width: '2.25rem',
                        height: '2.25rem',
                        borderRadius: 'var(--wa-radius-sm)',
                        background: 'var(--wa-accent-soft)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Icon size={18} style={{ color: 'var(--wa-accent)' }} aria-hidden="true" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--wa-text)', marginBottom: '0.25rem' }}>{item.title}</h3>
                      <p style={{ fontSize: '0.8125rem', color: 'var(--wa-muted)', lineHeight: 1.55, marginBottom: item.href ? '0.75rem' : 0 }}>{item.body}</p>
                      {item.href && (
                        <Link
                          href={item.href}
                          className="wa-kit-focus"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--wa-accent)', textDecoration: 'none' }}
                        >
                          {item.cta}
                          <ArrowRight size={14} aria-hidden="true" />
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </DesignSurface>
  );
}
