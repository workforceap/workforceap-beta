import type { Metadata } from 'next';
import Link from 'next/link';
import { Award, BadgeCheck } from 'lucide-react';
import { SITE_URL } from '@/app/seo';
import { parseOgShareCardParams } from '@/lib/og/shareCards';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function searchParamsToUrlSearchParams(searchParams: SearchParams): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    const v = first(value);
    if (v) params.set(key, v);
  }
  // Achievement shares deliberately encode the result, not member PII.
  // `/api/og/dynamic-card` supports `name` for generic use, but this public
  // share page should not echo names even if someone hand-edits the URL.
  params.delete('name');
  return params;
}

function buildOgImageUrl(searchParams: SearchParams): string {
  const params = searchParamsToUrlSearchParams(searchParams);
  const imageParams = new URLSearchParams(params);
  imageParams.delete('program');
  imageParams.delete('course');
  imageParams.delete('score');
  imageParams.delete('utm_source');
  imageParams.delete('utm_medium');
  imageParams.delete('utm_campaign');
  return `${SITE_URL}/api/og/dynamic-card?${imageParams.toString()}`;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const card = parseOgShareCardParams(searchParamsToUrlSearchParams(sp));
  const isCertificate = card.kind === 'certificate';
  const title = isCertificate
    ? `Certificate earned: ${card.certificateTitle}`
    : `Skill demonstrated: ${card.skillName}`;
  const description = isCertificate
    ? `A WorkforceAP member recorded ${card.certificateTitle}.`
    : `A WorkforceAP member completed a Skill Checkpoint for ${card.skillName}.`;
  const image = buildOgImageUrl(sp);

  return {
    title,
    description,
    alternates: {
      canonical: `${SITE_URL}/share/achievement?${searchParamsToUrlSearchParams(sp).toString()}`,
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/share/achievement?${searchParamsToUrlSearchParams(sp).toString()}`,
      siteName: 'Workforce Advancement Project',
      type: 'website',
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  };
}

export default async function ShareAchievementPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const params = searchParamsToUrlSearchParams(sp);
  const card = parseOgShareCardParams(params);
  const isCertificate = card.kind === 'certificate';
  const program = first(sp.program);
  const course = first(sp.course);
  const score = first(sp.score);

  // Page canvas + icon tint read tokens this root-only route defines: main.css's
  // surface scale and the global brand tints (css/wa-brand-tokens.css). The former
  // --color-surface / --color-accent-container names exist in no stylesheet.
  return (
    <main style={{ minHeight: '100vh', background: 'var(--surface-container-low)', padding: '4rem 1rem' }}>
      <section
        className="portal-card"
        style={{
          maxWidth: '42rem',
          margin: '0 auto',
          padding: '2rem',
          borderRadius: 'var(--radius-xl)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 24,
            margin: '0 auto 1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--wa-accent-soft)',
            color: 'var(--wa-accent-text)',
          }}
        >
          {isCertificate ? <Award size={36} aria-hidden="true" /> : <BadgeCheck size={36} aria-hidden="true" />}
        </div>
        <p style={{ margin: '0 0 0.5rem', color: 'var(--color-on-surface-variant)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.8125rem' }}>
          {isCertificate ? 'Certificate earned' : 'Skill checkpoint complete'}
        </p>
        <h1 style={{ margin: '0 0 0.75rem', fontSize: 'clamp(2rem, 6vw, 3.25rem)', lineHeight: 1.05, color: 'var(--color-on-surface)' }}>
          {isCertificate ? card.certificateTitle : card.skillName}
        </h1>
        {isCertificate ? (
          <p style={{ margin: '0 0 1.5rem', color: 'var(--color-on-surface-variant)', fontSize: '1rem' }}>
            Issued by {card.issuer} · {card.displayDate}
          </p>
        ) : (
          <p style={{ margin: '0 0 1.5rem', color: 'var(--color-on-surface-variant)', fontSize: '1rem' }}>
            {course ? `${course} · ` : ''}{program ?? 'WorkforceAP'}{score ? ` · ${score}` : ''}
          </p>
        )}
        <p style={{ color: 'var(--color-on-surface-variant)', lineHeight: 1.6, maxWidth: '32rem', margin: '0 auto 1.5rem' }}>
          WorkforceAP helps members build job-ready skills through career training, certificates, and coaching support.
        </p>
        <Link className="btn btn-primary" href="/programs" style={{ display: 'inline-flex' }}>
          Explore WorkforceAP programs
        </Link>
      </section>
    </main>
  );
}
