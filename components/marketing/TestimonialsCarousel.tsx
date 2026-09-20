import { prisma } from '@/lib/db/prisma';
import { Prisma, TestimonialStatus } from '@prisma/client';
import Image from 'next/image';
import { Quote, Star } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { InfoCard } from '@/components/marketing/ui';
import { programDisplayTitle } from '@/lib/content/programTitle';

type PublishedTestimonial = Prisma.TestimonialGetPayload<{
  include: {
    member: {
      select: {
        fullName: true;
        enrolledProgram: true;
      };
    };
  };
}>;

/**
 * Server component: fetch approved/published testimonials and render
 * a simple grid. Used on public marketing pages like /impact.
 */
export default async function TestimonialsCarousel({ limit = 6 }: { limit?: number }) {
  const t = await getTranslations('marketing.publicImpact');
  let testimonials: PublishedTestimonial[];

  try {
    testimonials = await prisma.testimonial.findMany({
      where: {
        status: TestimonialStatus.PUBLISHED,
        deletedAt: null,
        consentGiven: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        member: {
          select: {
            fullName: true,
            enrolledProgram: true,
          },
        },
      },
    });
  } catch {
    testimonials = [];
  }

  if (testimonials.length === 0) {
    return (
      <InfoCard
        variant="bordered"
        title={t('testimonialsEmptyTitle')}
        description={t('testimonialsEmptyDesc')}
      />
    );
  }

  return (
    <div className="testimonials-carousel__grid">
      {testimonials.map((testimonial) => {
        const enrolledProgramTitle = testimonial.member.enrolledProgram
          ? programDisplayTitle(testimonial.member.enrolledProgram)
          : null;

        return (
        <div
          key={testimonial.id}
          style={{
            background: 'var(--surface-container-lowest)',
            border: '1px solid var(--outline-variant)',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.875rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Quote className="w-5 h-5" style={{ color: 'var(--color-accent)', opacity: 0.6 }} />
            {testimonial.rating && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.125rem', marginLeft: 'auto' }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className="w-3.5 h-3.5"
                    style={{
                      color: i < testimonial.rating! ? '#f59e0b' : '#d4d4d8',
                      fill: i < testimonial.rating! ? '#f59e0b' : 'none',
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          <p
            style={{
              fontSize: '0.9375rem',
              lineHeight: 1.6,
              color: 'var(--color-on-surface)',
              flex: 1,
            }}
          >
            {testimonial.content}
          </p>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: 'auto' }}>
            {testimonial.photoUrl ? (
              <Image
                src={testimonial.photoUrl}
                alt={testimonial.member.fullName ? `${testimonial.member.fullName} photo` : 'Member photo'}
                width={40}
                height={40}
                unoptimized
                style={{
                  width: '2.5rem',
                  height: '2.5rem',
                  borderRadius: '9999px',
                  objectFit: 'cover',
                }}
              />
            ) : (
              <div
                style={{
                  width: '2.5rem',
                  height: '2.5rem',
                  borderRadius: '9999px',
                  background: 'var(--color-light, #f8f5f3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  color: 'var(--color-on-surface-variant)',
                }}
              >
                {testimonial.member.fullName?.charAt(0).toUpperCase() ?? 'M'}
              </div>
            )}
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>{testimonial.member.fullName}</div>
              {enrolledProgramTitle ? (
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-on-surface-variant)' }}>
                  {enrolledProgramTitle}
                </div>
              ) : null}
            </div>
          </div>
        </div>
        );
      })}
    </div>
  );
}
