import type { Metadata } from 'next';
import { buildPageMetadataAsync, SITE_URL } from '@/app/seo';
import { getRequestLocale } from '@/lib/i18n/server';
import { withLocalePrefix } from '@/lib/i18n/config';
import { getProgramBySlug, type Program } from '@/lib/content/programs';

export function resolveApplyProgramSlug(raw: string | string[] | undefined): string | undefined {
  if (raw == null) return undefined;
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (typeof s !== 'string' || !s.trim()) return undefined;
  return s.trim();
}

export function buildApplyProgramBlockCopy(program: Program): {
  bullets: string[];
} {
  const bullets = program.skills.slice(0, 3);
  return { bullets };
}

/** Field label for meta description (e.g. "cybersecurity and IT"). */
function programFieldLabel(program: Program): string {
  const map: Record<string, string> = {
    'it-cyber': 'cybersecurity and IT',
    'cloud-data': 'data and cloud',
    'ai-software': 'software and AI',
    business: 'business and digital skills',
    healthcare: 'healthcare technology',
    manufacturing: 'skilled trades and manufacturing',
    'digital-literacy': 'digital literacy',
  };
  return map[program.category] ?? 'career training';
}

export function buildApplyProgramSeo(program: Program): { title: string; description: string } {
  const cert = program.partner;
  const field = programFieldLabel(program);
  const title = `Apply for ${program.title} Training — WorkforceAP`;
  const description = `Get ${program.title} training at no cost to members with ${cert} from WorkforceAP. Career certification in ${field}. Apply in 10 minutes.`;
  return { title, description };
}

export async function buildApplyPageMetadata(programParam: string | undefined): Promise<Metadata> {
  const slug = resolveApplyProgramSlug(programParam);
  const program = slug ? getProgramBySlug(slug) : undefined;
  const locale = await getRequestLocale();

  // Use the existing full-resolution brand asset, including its real dimensions.
  const applyOgImage = {
    url: '/images/logo-tight.png',
    width: 1930,
    height: 985,
    alt: 'Workforce Advancement Project — Empowering People. Advancing Futures.',
  };
  const { title, description } = program ? buildApplyProgramSeo(program) : {
    title: 'Apply for Career Training',
    description:
      'Apply for career certification training at no cost to members. CompTIA, Google, IBM, AWS, and more. Serving communities nationwide. A counselor reviews every application; you\'ll get an email when a decision is made.',
  };
  const base = await buildPageMetadataAsync({
    title,
    description,
    path: '/apply',
    image: applyOgImage.url,
  });
  const branded: Metadata = {
    ...base,
    openGraph: { ...base.openGraph, images: [applyOgImage] },
    twitter: { ...base.twitter, images: [{ url: applyOgImage.url, alt: applyOgImage.alt }] },
  };
  if (!program) return branded;

  const localizedApply = withLocalePrefix('/apply', locale);
  return {
    ...branded,
    alternates: {
      ...base.alternates,
      canonical: `${SITE_URL}${localizedApply}?program=${encodeURIComponent(program.slug)}`,
    },
  };
}

export { getProgramBySlug };
