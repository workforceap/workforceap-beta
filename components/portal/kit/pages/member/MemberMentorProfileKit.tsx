import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, Linkedin, Building2 } from 'lucide-react';
import { Card } from '@astryxdesign/core/Card';
import { Token } from '@astryxdesign/core/Token';
import { DesignSurface, Avatar, PageOpener } from '@/components/portal/kit';

/**
 * Member Portal — MENTOR PROFILE / SESSION REQUEST view.
 * Elevates the bespoke mentor detail page to the Command Center kit language.
 *
 * Target route: app/(portal)/dashboard/mentors/[mentorId]
 * Surface: warm (member-facing).
 */

export interface MentorProfile {
  id: string;
  fullName: string;
  title: string | null;
  company: string | null;
  industry: string | null;
  bio: string | null;
  linkedinUrl: string | null;
}

export interface MemberMentorProfileKitProps {
  mentor: MentorProfile;
  /** The (client) session-request form, passed through unchanged. */
  sessionForm: ReactNode;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function MemberMentorProfileKit({ mentor, sessionForm }: MemberMentorProfileKitProps) {
  const metaLine = [mentor.title, mentor.company].filter(Boolean).join(' · ');
  return (
    <DesignSurface surface="warm">
      <div style={{ maxWidth: 720, margin: '0 auto', padding: 16 }} className="wa-space-y-5">
        <Link
          href="/dashboard/mentors"
          className="wa-kit-focus hover:wa-opacity-80 wa-transition-opacity wa-duration-150 motion-reduce:wa-transition-none"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--wa-type-meta)', fontWeight: 700, color: 'var(--wa-accent)', textDecoration: 'none' }}
        >
          <ArrowLeft size={13} aria-hidden="true" /> Back to mentors
        </Link>

        <PageOpener
          kicker="Mentor"
          title={mentor.fullName}
          lede={metaLine || undefined}
          action={mentor.industry ? <Token label={mentor.industry} size="sm" color="blue" /> : undefined}
        />

        <Card>
          <div className="wa-flex wa-items-center wa-gap-4" style={{ flexWrap: 'wrap' }}>
            <Avatar initials={initialsOf(mentor.fullName)} size={56} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <h2 style={{ fontSize: 'var(--wa-type-body)', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>About {mentor.fullName.split(' ')[0]}</h2>
              {mentor.company ? (
                <p style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)', marginTop: 2 }}>{mentor.company}</p>
              ) : null}
            </div>
          </div>

          {mentor.bio ? (
            <p style={{ fontSize: 'var(--wa-type-body)', lineHeight: 1.65, color: 'var(--wa-text)', marginTop: 16 }}>{mentor.bio}</p>
          ) : null}

          <div className="wa-flex wa-items-center wa-gap-4" style={{ marginTop: 16, flexWrap: 'wrap' }}>
            {mentor.company ? (
              <span className="wa-flex wa-items-center wa-gap-2" style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)' }}>
                <Building2 size={13} aria-hidden="true" /> {mentor.company}
              </span>
            ) : null}
            {mentor.linkedinUrl ? (
              <a
                href={mentor.linkedinUrl}
                target="_blank"
                rel="noreferrer"
                className="wa-kit-focus hover:wa-opacity-80 wa-transition-opacity wa-duration-150 motion-reduce:wa-transition-none"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--wa-type-meta)', fontWeight: 700, color: 'var(--wa-accent)', textDecoration: 'none' }}
              >
                <Linkedin size={13} aria-hidden="true" /> View LinkedIn profile
              </a>
            ) : null}
          </div>
        </Card>

        <Card>
          <p style={{ fontSize: 'var(--wa-type-meta)', color: 'var(--wa-muted)' }}>
            Pick a time and share what you&rsquo;d like to cover — {mentor.fullName.split(' ')[0]} will confirm by email.
          </p>
          {sessionForm}
        </Card>
      </div>
    </DesignSurface>
  );
}
