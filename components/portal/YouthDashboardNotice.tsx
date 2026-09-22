import Link from 'next/link';
import { GraduationCap, BookOpen, Sparkles } from 'lucide-react';

export default function YouthDashboardNotice({ age }: { age: number }) {
  return (
    <div style={{
      padding: '1.5rem',
      background: 'linear-gradient(135deg, color-mix(in srgb, var(--wa-gold) 15%, transparent) 0%, color-mix(in srgb, var(--color-accent) 8%, transparent) 100%)',
      border: '2px solid rgba(240, 205, 131, 0.4)',
      borderRadius: 'var(--radius-md)',
      marginBottom: '2rem'
    }}>
      <h3 style={{ 
        fontSize: '1.15rem', 
        fontWeight: 700, 
        marginBottom: '0.75rem',
        color: 'var(--color-primary)'
      }}>
        🎓 Youth Member Portal (Age {age})
      </h3>
      
      <p style={{ 
        color: 'var(--color-on-surface)', 
        lineHeight: 1.6, 
        marginBottom: '1rem',
        fontSize: '0.95rem'
      }}>
        Welcome to WorkforceAP! As a youth member, your portal is designed for career exploration 
        and skill-building. Focus on these areas to prepare for your future career:
      </p>

      <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'start' }}>
          <div style={{ 
            padding: '0.5rem', 
            background: 'rgba(173, 44, 77, 0.1)',
            borderRadius: '8px',
            flexShrink: 0
          }}>
            <GraduationCap size={20} style={{ color: 'var(--wa-accent-text)' }} aria-hidden />
          </div>
          <div>
            <strong style={{ fontSize: '0.95rem' }}>Training & Courses</strong>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', margin: '0.25rem 0 0' }}>
              Build skills through certified training programs designed for young learners
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'start' }}>
          <div style={{ 
            padding: '0.5rem', 
            background: 'rgba(240, 205, 131, 0.2)', 
            borderRadius: '8px',
            flexShrink: 0
          }}>
            <BookOpen size={20} style={{ color: 'var(--color-gold)' }} aria-hidden />
          </div>
          <div>
            <strong style={{ fontSize: '0.95rem' }}>Career Resources</strong>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', margin: '0.25rem 0 0' }}>
              Explore career paths and learn about different industries
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'start' }}>
          <div style={{ 
            padding: '0.5rem', 
            background: 'rgba(173, 44, 77, 0.1)',
            borderRadius: '8px',
            flexShrink: 0
          }}>
            <Sparkles size={20} style={{ color: 'var(--wa-accent-text)' }} aria-hidden />
          </div>
          <div>
            <strong style={{ fontSize: '0.95rem' }}>AI Career Tools</strong>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', margin: '0.25rem 0 0' }}>
              Use AI tools to explore careers, build resumes, and practice interviews
            </p>
          </div>
        </div>
      </div>

      <div style={{
        padding: '1rem',
        background: 'rgba(255, 255, 255, 0.7)',
        borderRadius: '8px',
        fontSize: '0.85rem',
        lineHeight: 1.5,
        color: 'var(--color-on-surface)'
      }}>
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
        <p style={{ 
          marginTop: '1rem', 
          fontSize: '0.85rem', 
          color: 'var(--color-on-surface-variant)',
          fontStyle: 'italic'
        }}>
          Questions? Your counselor can help you plan your career path. Reach out via the Messages tab.
        </p>
      ) : null}
    </div>
  );
}
