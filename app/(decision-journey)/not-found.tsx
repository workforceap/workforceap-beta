import LocalizedLink from '@/components/LocalizedLink';

export default function DecisionJourneyNotFound() {
  return (
    <section
      style={{
        maxWidth: '42rem',
        margin: '0 auto',
        padding: '3rem 1.25rem 4rem',
        textAlign: 'center',
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: '0.8125rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--color-accent)',
        }}
      >
        Page not found
      </p>
      <h1 style={{ margin: '0.75rem 0 1rem', fontSize: 'clamp(2rem, 4vw, 3rem)', lineHeight: 1.1 }}>
        That program page is not available.
      </h1>
      <p
        style={{
          margin: '0 auto 1.5rem',
          maxWidth: '32rem',
          color: 'var(--color-on-surface-variant)',
          lineHeight: 1.6,
        }}
      >
        The link may be outdated, or the program may have moved. You can keep exploring career paths, compare
        options, or restart the quiz from here.
      </p>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          justifyContent: 'center',
        }}
      >
        <LocalizedLink href="/programs" className="btn btn-primary">
          Browse programs
        </LocalizedLink>
        <LocalizedLink href="/find-your-path" className="btn btn-secondary">
          Restart the quiz
        </LocalizedLink>
        <LocalizedLink href="/program-comparison" className="btn btn-ghost">
          Compare options
        </LocalizedLink>
      </div>
    </section>
  );
}
