import { SITE_URL } from '@/app/seo';
import type { Program } from '@/lib/content/programs';

/**
 * Server-rendered Course schema (schema.org/Course) for /programs/[slug]
 * pages. Lets Google list the program in Course rich results with the
 * provider, name, description, and URL. Inserted as an
 * `<script type="application/ld+json">` tag — invisible to users.
 *
 * Field choices:
 * - `provider` is the catalog `partner` field (IBM / Google / MSSC etc.)
 * - `description` is a short blurb composed from the program's
 *   `categoryLabel` and `duration` so it reads independently
 *   of any marketing-only copy the page might also render
 * - `educationalCredentialAwarded` is the program title; aligns with
 *   how members describe what they earn
 */
function safeJsonLdStringify(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export default function JsonLdCourse({ program }: { program: Program }) {
  const url = `${SITE_URL}/programs/${program.slug}`;
  const description =
    `${program.categoryLabel} pathway: ${program.title}. ` +
    `${program.duration}.`;

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: program.title,
    description,
    url,
    provider: {
      '@type': 'Organization',
      name: program.partner || 'Workforce Advancement Project',
      sameAs: SITE_URL,
    },
    educationalCredentialAwarded: program.title,
    inLanguage: 'en',
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLdStringify(schema) }}
    />
  );
}
