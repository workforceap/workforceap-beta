import Link from 'next/link';
import type { CareerMatchResult } from '@/lib/onet/types';

export default function MemberCareerPathSection({
  careerMatch,
  coursesCompletedCount,
  trainingNextStep,
}: {
  careerMatch: CareerMatchResult | null;
  coursesCompletedCount: number;
  trainingNextStep?: {
    programTitle: string;
    href: string;
    ctaLabel: string;
    detail: string;
  } | null;
}) {
  const top = careerMatch?.topOccupations[0];
  if (!top) return null;

  const readiness =
    coursesCompletedCount > 0
      ? `You’ve completed ${coursesCompletedCount} course step(s) toward this path — keep going.`
      : 'Start your first learning module to build momentum toward this role.';

  return (
    <section
      style={{
        marginBottom: '1.5rem',
        padding: '1.25rem',
        borderRadius: '0.75rem',
        border: '1px solid var(--outline-variant)',
        background: 'var(--surface-container-low)',
      }}
      aria-labelledby="member-career-path-heading"
    >
      <h2 id="member-career-path-heading" className="wa-text-xs wa-font-bold wa-uppercase wa-tracking-[0.1em] wa-text-[var(--color-on-surface-variant)]" style={{ marginBottom: '0.75rem' }}>
        Your career path
      </h2>
      <h3 style={{ fontSize: '1.05rem', margin: '0 0 0.5rem', fontWeight: 700 }}>{top.title}</h3>
      <p style={{ margin: '0 0 0.75rem', fontSize: '0.92rem', lineHeight: 1.55 }}>{top.description}</p>
      {(top.skills?.length ?? 0) > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <p style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>Skills employers often look for</p>
          <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.88rem' }}>
            {top.skills.slice(0, 6).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      <p style={{ fontSize: '0.88rem', color: 'var(--color-on-surface-variant)', marginBottom: '0.75rem' }}>{readiness}</p>
      {trainingNextStep ? (
        <div
          style={{
            marginBottom: '0.9rem',
            padding: '0.9rem',
            borderRadius: '0.75rem',
            border: '1px solid color-mix(in srgb, var(--color-accent) 22%, transparent)',
            background: 'color-mix(in srgb, var(--color-accent) 7%, transparent)',
          }}
        >
          <p style={{ margin: '0 0 0.25rem', fontSize: '0.8125rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-accent-dark)' }}>
            Training next step
          </p>
          <p style={{ margin: '0 0 0.55rem', fontSize: '0.92rem', lineHeight: 1.45 }}>
            Your plan maps this career direction to <strong>{trainingNextStep.programTitle}</strong>. {trainingNextStep.detail}
          </p>
          <Link href={trainingNextStep.href} className="btn btn-primary btn-small">
            {trainingNextStep.ctaLabel}
          </Link>
        </div>
      ) : null}
      <p style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>Suggested next steps</p>
      <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.88rem' }}>
        <li>
          <Link href="/dashboard/ai-tools/resume-studio?view=rewrite">Resume Rewriter</Link>
        </li>
        <li>
          <Link href="/dashboard/ai-tools/interview-practice">Interview Practice</Link>
        </li>
        <li>
          <Link href="/dashboard/learning">Learning hub</Link>
        </li>
      </ul>
    </section>
  );
}
