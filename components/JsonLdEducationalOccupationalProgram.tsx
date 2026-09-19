import type { Program } from '@/lib/content/programs';
import { getProgramDisplayTitle, getProgramDisplayPartner } from '@/lib/content/programs';

interface Props {
  program: Program;
  url: string;
}

export default function JsonLdEducationalOccupationalProgram({ program, url }: Props) {
  const displayTitle = getProgramDisplayTitle(program);
  const displayPartner = getProgramDisplayPartner(program);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'EducationalOccupationalProgram',
    name: displayTitle,
    description: `${displayTitle} training and certification offered at no cost for qualifying members. ${program.duration}.`,
    url,
    provider: {
      '@type': 'Organization',
      name: displayPartner,
      url: 'https://www.workforceap.org',
    },
    educationalProgramMode: 'online',
    timeToComplete: program.duration,
    occupationalCredentialAwarded: program.title + ' Certificate',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      eligibleRegion: {
        '@type': 'Country',
        name: 'United States',
      },
    },
    programPrerequisites: program.courses.map((course) => ({
      '@type': 'Course',
      name: course.name,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
    />
  );
}
