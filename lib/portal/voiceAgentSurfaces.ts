import { createElement, type ReactNode } from 'react';
import { AudioLines, Briefcase, Building2, Handshake, Headphones, MessageSquare, Sparkles, Target } from 'lucide-react';

type Surface = {
  badge: string;
  subtext?: string;
  icon: ReactNode;
  glowColor: string;
  gradient: string;
  ctaGradient?: string;
  ctaShadow?: string;
};

const CRIMSON = '#ad2c4d';
const CRIMSON_DARK = '#8c0f37';
const GOLD = '#a47f38';
/**
 * White CTA text sits on these gradients, so the floor must be the tuned
 * hero gold (#7d5f26, 5.9:1 with white) rather than brand gold (#a47f38,
 * 3.7:1). `--wa-gold` stays a fill/stroke colour (WAP-100).
 */
export const GOLD_TEXT_GRADIENT = 'linear-gradient(135deg, var(--wa-hero-gold), var(--wa-hero-gold-dark))';
const BLUE = '#2b7bb9';
const BLUE_DARK = '#1f5a87';

const icon = (Icon: typeof Target) => createElement(Icon, { size: 22, 'aria-hidden': true });

export const readinessVoiceSurface: Surface = {
  /* Badges normalized to short Title Case across all voice surfaces
     (audit #55) — was "Workforce Readiness & career coach". */
  badge: 'READINESS',
  subtext: 'Stuck on what to do next? Talk it through and leave with one clear next step.',
  icon: icon(Target),
  glowColor: GOLD,
  gradient: GOLD_TEXT_GRADIENT,
  ctaGradient: GOLD_TEXT_GRADIENT,
  ctaShadow: '0 8px 24px rgba(164,127,56,0.24)',
};

export const resumeCoachVoiceSurface: Surface = {
  badge: 'RESUME',
  subtext:
    'Reads your uploaded resume or live draft and coaches you line by line on bullets, framing, and gaps.',
  icon: icon(Sparkles),
  glowColor: CRIMSON,
  gradient: `linear-gradient(135deg, ${CRIMSON}, ${CRIMSON_DARK})`,
  ctaGradient: `linear-gradient(135deg, ${CRIMSON}, ${CRIMSON_DARK})`,
  ctaShadow: '0 8px 24px rgba(173,44,77,0.2)',
};

export const counselorStaffVoiceSurface: Surface = {
  badge: 'COUNSELOR',
  subtext: 'Member support, outreach, and how to use this workspace.',
  icon: icon(MessageSquare),
  glowColor: BLUE,
  gradient: `linear-gradient(135deg, ${BLUE}, ${BLUE_DARK})`,
  ctaGradient: `linear-gradient(135deg, ${BLUE}, ${BLUE_DARK})`,
  ctaShadow: '0 8px 24px rgba(43,123,185,0.2)',
};

export const studentCounselorVoiceSurface: Surface = {
  badge: 'LILLEY',
  subtext: 'Knows your WorkforceAP plan and progress — then your saved action plan.',
  icon: icon(Headphones),
  glowColor: BLUE,
  gradient: `linear-gradient(135deg, ${BLUE}, ${BLUE_DARK})`,
  ctaGradient: `linear-gradient(135deg, ${BLUE}, ${BLUE_DARK})`,
  ctaShadow: '0 8px 24px rgba(43,123,185,0.2)',
};

export const employerVoiceSurface: Surface = {
  badge: 'Employer assistant',
  subtext: 'Postings, applicants, and navigating the employer portal.',
  icon: icon(Building2),
  glowColor: CRIMSON,
  gradient: `linear-gradient(135deg, ${CRIMSON}, ${CRIMSON_DARK})`,
  ctaGradient: `linear-gradient(135deg, ${CRIMSON}, ${CRIMSON_DARK})`,
  ctaShadow: '0 8px 24px rgba(173,44,77,0.2)',
};

export const partnerVoiceSurface: Surface = {
  badge: 'Partner assistant',
  subtext: 'Referrals, member progress, and partner tools.',
  icon: icon(Handshake),
  glowColor: GOLD,
  gradient: GOLD_TEXT_GRADIENT,
  ctaGradient: GOLD_TEXT_GRADIENT,
  ctaShadow: '0 8px 24px rgba(164,127,56,0.24)',
};

export const mockInterviewVoiceSurface: Surface = {
  badge: 'PRACTICE',
  subtext: 'A realistic interviewer for the role you name — optional camera recording for review.',
  icon: icon(AudioLines),
  glowColor: CRIMSON,
  gradient: `linear-gradient(135deg, ${CRIMSON_DARK}, #5e1426)`,
  ctaGradient: `linear-gradient(135deg, ${CRIMSON}, ${CRIMSON_DARK})`,
  ctaShadow: '0 8px 24px rgba(173,44,77,0.2)',
};

export const careerBusinessVoiceSurface: Surface = {
  badge: 'ADVANCED',
  subtext: 'Lilley in a wider lane: project management, sales, marketing, and business questions.',
  icon: icon(Briefcase),
  glowColor: CRIMSON,
  gradient: `linear-gradient(135deg, ${CRIMSON}, ${CRIMSON_DARK})`,
  ctaGradient: `linear-gradient(135deg, ${CRIMSON}, ${CRIMSON_DARK})`,
  ctaShadow: '0 8px 24px rgba(173,44,77,0.2)',
};
