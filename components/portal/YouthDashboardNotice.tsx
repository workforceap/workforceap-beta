import { GraduationCap, BookOpen, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const FOCUS_AREAS: Array<{ icon: LucideIcon; title: string; body: string }> = [
  {
    icon: GraduationCap,
    title: 'Training & Courses',
    body: 'Build skills through certified training programs designed for young learners',
  },
  {
    icon: BookOpen,
    title: 'Career Resources',
    body: 'Explore career paths and learn about different industries',
  },
  {
    icon: Sparkles,
    title: 'AI Career Tools',
    body: 'Use AI tools to explore careers, build resumes, and practice interviews',
  },
];

/**
 * Youth member notice (under 18, age from `profile.dob`).
 *
 * Shown on the kit member home (and, until it is retired, the `?ui=legacy`
 * home). Kit card on `--wa-*` tokens: an info edge because this is a fact
 * about the account, not a warning; the three focus areas use the kit
 * tone-icon chip, and the job-board rule sits on the raised neutral fill.
 * Copy is unchanged from the legacy notice.
 */
export default function YouthDashboardNotice({ age }: { age: number }) {
  return (
    <section
      className="wa-kit-card wa-kit-tone--info wa-kit-tone-edge"
      aria-labelledby="youth-notice-title"
      style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
    >
      <div>
        <p
          className="wa-kit-meta"
          style={{ margin: 0, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}
        >
          Youth member
        </p>
        <h3
          id="youth-notice-title"
          style={{ margin: '4px 0 0', fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--wa-text)' }}
        >
          Youth Member Portal (Age {age})
        </h3>
      </div>

      <p className="wa-kit-lede" style={{ margin: 0 }}>
        Welcome to WorkforceAP! As a youth member, your portal is designed for career exploration
        and skill-building. Focus on these areas to prepare for your future career:
      </p>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
        {FOCUS_AREAS.map(({ icon: Icon, title, body }) => (
          <li key={title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span className="wa-kit-tone-icon" aria-hidden>
              <Icon size={18} />
            </span>
            <span style={{ minWidth: 0 }}>
              <strong style={{ display: 'block', fontSize: 'var(--wa-type-body)', color: 'var(--wa-text)' }}>{title}</strong>
              <span style={{ display: 'block', fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', marginTop: 2 }}>
                {body}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <div
        style={{
          padding: 'var(--wa-pad-sm)',
          background: 'var(--wa-surface-2)',
          borderRadius: 'var(--wa-radius-sm)',
          fontSize: 'var(--wa-type-meta)',
          lineHeight: 1.5,
          color: 'var(--wa-text)',
        }}
      >
        <strong>Job Board Access:</strong> {age >= 16 ? (
          <>
            You can view youth-appropriate jobs. Full job board access and applications become
            available when you turn 18. Some positions may require work permits.
          </>
        ) : age >= 14 ? (
          <>
            You can view youth-appropriate jobs that comply with youth labor laws.
            All positions require work permits for ages 14-15.
          </>
        ) : (
          <>
            Job applications become available at age 14. For now, focus on skill-building
            and career exploration through our training programs.
          </>
        )}
      </div>

      {age < 14 ? (
        <p style={{ margin: 0, fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)' }}>
          Questions? Your counselor can help you plan your career path. Reach out via the Messages tab.
        </p>
      ) : null}
    </section>
  );
}
