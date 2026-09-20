import Link from 'next/link';
import type { CareerBriefContext } from '@/lib/content/careerBriefPersonalization';

type CareerBriefForYouProps = {
  context: CareerBriefContext;
};

export default function CareerBriefForYou({ context }: CareerBriefForYouProps) {
  const {
    location,
    programShortLabel,
    applicationsCount,
    recommendedActions,
    jobSearchUrl,
    jobSearchEngines,
    bestBoardsForProgram,
    suburbPresets,
  } = context;

  const hasContext = location || programShortLabel || applicationsCount > 0 || jobSearchUrl;
  const hasActions = recommendedActions.length > 0;

  return (
    <div className="career-brief-for-you">
      <h2 className="career-brief-for-you-title">For You</h2>
      <div className="career-brief-for-you-content">
        {!hasContext && !hasActions ? (
          <p className="career-brief-for-you-line" style={{ color: 'var(--color-on-surface-variant)', marginBottom: 0 }}>
            Personalized tips will appear here as you add your location, program interests, and applications. Until then, use the
            weekly briefs below and explore the{' '}
            <a href="/dashboard/ai-tools" className="career-brief-for-you-link">
              AI Career Toolkit
            </a>
            .
          </p>
        ) : null}
        {programShortLabel && (
          <p className="career-brief-for-you-line">
            You&rsquo;re targeting <strong>{programShortLabel}</strong>
            {location && (
              <> in <strong>{location}</strong></>
            )}
            .
          </p>
        )}
        {location && !programShortLabel && (
          <p className="career-brief-for-you-line">
            Based in <strong>{location}</strong>.
          </p>
        )}
        {applicationsCount > 0 && (
          <p className="career-brief-for-you-line">
            You&rsquo;ve logged {applicationsCount} application{applicationsCount !== 1 ? 's' : ''} so far.
          </p>
        )}
        {jobSearchUrl && (
          <div className="career-brief-for-you-line">
            <a href={jobSearchUrl} target="_blank" rel="noopener noreferrer" className="career-brief-for-you-link">
              {location ? `Search jobs near ${location} →` : 'Search Austin-area jobs →'}
            </a>
            {bestBoardsForProgram.length > 0 ? (
              <div style={{ marginTop: '0.45rem' }}>
                <p style={{ margin: '0 0 0.35rem', color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem', fontWeight: 700 }}>
                  Best boards for your path
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                  {bestBoardsForProgram.map((board) => (
                    <span
                      key={board}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '0.22rem 0.5rem',
                        borderRadius: '999px',
                        background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
                        color: 'var(--color-on-surface)',
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                      }}
                    >
                      {board}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {jobSearchEngines.length > 1 ? (
              <p style={{ margin: '0.35rem 0 0', color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem' }}>
                Also useful: {jobSearchEngines.slice(1).map((engine, index) => (
                  <span key={engine.label}>
                    {index > 0 ? ' · ' : ''}
                    <a href={engine.href} target="_blank" rel="noopener noreferrer" className="career-brief-for-you-link">
                      {engine.label}
                    </a>
                  </span>
                ))}
              </p>
            ) : null}
            {suburbPresets.length > 0 ? (
              <div style={{ marginTop: '0.45rem' }}>
                <p style={{ margin: '0 0 0.35rem', color: 'var(--color-on-surface-variant)', fontSize: '0.8125rem', fontWeight: 700 }}>
                  Quick area searches
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {suburbPresets.map((preset) => (
                    <a
                      key={preset.label}
                      href={preset.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="career-brief-for-you-link"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '0.22rem 0.5rem',
                        borderRadius: '999px',
                        background: 'var(--surface-container-high)',
                        textDecoration: 'none',
                      }}
                    >
                      {preset.label}
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
        {recommendedActions.length > 0 && (
          <div className="career-brief-for-you-actions">
            <p className="career-brief-for-you-subtitle">Recommended this week:</p>
            <ul className="career-brief-for-you-list">
              {recommendedActions.map((action) => (
                <li key={action.href}>
                  <Link href={action.href} className="career-brief-for-you-action-link">
                    {action.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
