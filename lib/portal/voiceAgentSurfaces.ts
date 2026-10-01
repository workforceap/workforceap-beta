import { createElement, type ReactNode } from 'react';
import { AudioLines, Briefcase, Building2, Handshake, Headphones, MessageSquare, Sparkles, Target } from 'lucide-react';

type Surface = {
  badge: string;
  subtext?: string;
  icon: ReactNode;
  glowColor: string;
  /** Badge label colour when the glow hue is too light to read as text. */
  badgeColor?: string;
  gradient: string;
  ctaGradient?: string;
  ctaShadow?: string;
};

/**
 * The text-bearing crimson ring / CTA gradient reads the same `--wa-hero-*`
 * pair as CertificationsEarnMoreCard, so it stays dark under white copy in
 * either theme. VoiceAgentSurface tints `glowColor` with color-mix, so a
 * `var()` is valid there too.
 */
const CRIMSON = 'var(--wa-hero-crimson)';
const CRIMSON_DARK = 'var(--wa-hero-crimson-dark)';
/**
 * The mock-interview ring's deep end stop (was the bare #5e1426): the same
 * 70% hero-crimson-dark over black VoiceStudioKit's crimson-deep card uses.
 */
const CRIMSON_PLUM = `color-mix(in srgb, ${CRIMSON_DARK} 70%, black)`;
/**
 * Badge copy on the crimson surfaces sits on the card, where the constant hero
 * crimson (#ad2c4d) is 2.99:1 on the dark card (scout M10). `--wa-accent-text`
 * is the text-on-surface accent (#8c0f37 light / #f39ab5 dark).
 */
const CRIMSON_TEXT = 'var(--wa-accent-text)';
/** Glow / icon-tile hue; brand gold that follows light-dark() (#a47f38 → #d4ad5a). */
const GOLD = 'var(--wa-gold)';
/**
 * Badge copy on the gold surfaces sits on the card surface, where brand gold is
 * 3.7:1 on white. `--wa-gold-dark` is the text-on-gold token (#7d5f26 / #e0b062:
 * 5.9:1 on white, 9.0:1 on the dark surface); the glow keeps the brand gold.
 */
const GOLD_TEXT = 'var(--wa-gold-dark)';
/**
 * White CTA text sits on these gradients, so the floor must be the tuned
 * hero gold (#7d5f26, 5.9:1 with white) rather than brand gold (#a47f38,
 * 3.7:1). `--wa-gold` stays a fill/stroke colour (WAP-100).
 */
export const GOLD_TEXT_GRADIENT = 'linear-gradient(135deg, var(--wa-hero-gold), var(--wa-hero-gold-dark))';
/**
 * The blue gradients carry white CTA copy, so their stops stay constant in
 * both themes (like the hero pair). The glow and the badge follow the info
 * tone tokens instead: the glow is color-mixed and the badge is 13px text on
 * the card, where a constant #2b7bb9 sits at 4.53:1 light and under AA dark.
 */
const BLUE = '#2b7bb9';
const BLUE_DARK = '#1f5a87';
const BLUE_GLOW = 'var(--wa-info)';
const BLUE_TEXT = 'var(--wa-info-dark)';
/** CTA shadows: a color-mix of the surface hue, never an rgba() literal, so they follow the theme. */
const GOLD_CTA_SHADOW = `0 8px 24px color-mix(in srgb, ${GOLD} 24%, transparent)`;
const CRIMSON_CTA_SHADOW = `0 8px 24px color-mix(in srgb, ${CRIMSON} 20%, transparent)`;
const BLUE_CTA_SHADOW = `0 8px 24px color-mix(in srgb, ${BLUE_GLOW} 20%, transparent)`;

/**
 * PortalVoiceSession accent props for the employer voice card (scout M8). The
 * panel's orb / tints keep the info hue; the solid "Start voice session" fill
 * is the info tone pairing: --wa-info-dark under --wa-on-accent-control (white
 * in light, dark ink in dark, where the fill lightens to #74b3e3). The former
 * `accent="var(--color-blue)"` with the panel's white label measured 2.36:1
 * in dark mode.
 */
export const employerVoiceSessionAccent = {
  accent: 'var(--color-blue)',
  accentDark: 'var(--color-blue)',
  ctaBackground: 'var(--wa-info-dark)',
  ctaColor: 'var(--wa-on-accent-control)',
} as const;

const icon = (Icon: typeof Target) => createElement(Icon, { size: 22, 'aria-hidden': true });

export const readinessVoiceSurface: Surface = {
  /* Badges normalized to short Title Case across all voice surfaces
     (audit #55) — was "Workforce Readiness & career coach". */
  badge: 'READINESS',
  subtext: 'Stuck on what to do next? Talk it through and leave with one clear next step.',
  icon: icon(Target),
  glowColor: GOLD,
  badgeColor: GOLD_TEXT,
  gradient: GOLD_TEXT_GRADIENT,
  ctaGradient: GOLD_TEXT_GRADIENT,
  ctaShadow: GOLD_CTA_SHADOW,
};

export const resumeCoachVoiceSurface: Surface = {
  badge: 'RESUME',
  subtext:
    'Reads your uploaded resume or live draft and coaches you line by line on bullets, framing, and gaps.',
  icon: icon(Sparkles),
  glowColor: CRIMSON,
  badgeColor: CRIMSON_TEXT,
  gradient: `linear-gradient(135deg, ${CRIMSON}, ${CRIMSON_DARK})`,
  ctaGradient: `linear-gradient(135deg, ${CRIMSON}, ${CRIMSON_DARK})`,
  ctaShadow: CRIMSON_CTA_SHADOW,
};

export const counselorStaffVoiceSurface: Surface = {
  badge: 'COUNSELOR',
  subtext: 'Member support, outreach, and how to use this workspace.',
  icon: icon(MessageSquare),
  glowColor: BLUE_GLOW,
  badgeColor: BLUE_TEXT,
  gradient: `linear-gradient(135deg, ${BLUE}, ${BLUE_DARK})`,
  ctaGradient: `linear-gradient(135deg, ${BLUE}, ${BLUE_DARK})`,
  ctaShadow: BLUE_CTA_SHADOW,
};

export const studentCounselorVoiceSurface: Surface = {
  badge: 'LILLEY',
  subtext: 'Knows your WorkforceAP plan and progress — then your saved action plan.',
  icon: icon(Headphones),
  glowColor: BLUE_GLOW,
  badgeColor: BLUE_TEXT,
  gradient: `linear-gradient(135deg, ${BLUE}, ${BLUE_DARK})`,
  ctaGradient: `linear-gradient(135deg, ${BLUE}, ${BLUE_DARK})`,
  ctaShadow: BLUE_CTA_SHADOW,
};

export const employerVoiceSurface: Surface = {
  badge: 'Employer assistant',
  subtext: 'Postings, applicants, and navigating the employer portal.',
  icon: icon(Building2),
  glowColor: CRIMSON,
  badgeColor: CRIMSON_TEXT,
  gradient: `linear-gradient(135deg, ${CRIMSON}, ${CRIMSON_DARK})`,
  ctaGradient: `linear-gradient(135deg, ${CRIMSON}, ${CRIMSON_DARK})`,
  ctaShadow: CRIMSON_CTA_SHADOW,
};

export const partnerVoiceSurface: Surface = {
  badge: 'Partner assistant',
  subtext: 'Referrals, member progress, and partner tools.',
  icon: icon(Handshake),
  glowColor: GOLD,
  badgeColor: GOLD_TEXT,
  gradient: GOLD_TEXT_GRADIENT,
  ctaGradient: GOLD_TEXT_GRADIENT,
  ctaShadow: GOLD_CTA_SHADOW,
};

export const mockInterviewVoiceSurface: Surface = {
  badge: 'PRACTICE',
  subtext: 'A realistic interviewer for the role you name — optional camera recording for review.',
  icon: icon(AudioLines),
  glowColor: CRIMSON,
  badgeColor: CRIMSON_TEXT,
  gradient: `linear-gradient(135deg, ${CRIMSON_DARK}, ${CRIMSON_PLUM})`,
  ctaGradient: `linear-gradient(135deg, ${CRIMSON}, ${CRIMSON_DARK})`,
  ctaShadow: CRIMSON_CTA_SHADOW,
};

export const careerBusinessVoiceSurface: Surface = {
  badge: 'ADVANCED',
  subtext: 'Lilley in a wider lane: project management, sales, marketing, and business questions.',
  icon: icon(Briefcase),
  glowColor: CRIMSON,
  badgeColor: CRIMSON_TEXT,
  gradient: `linear-gradient(135deg, ${CRIMSON}, ${CRIMSON_DARK})`,
  ctaGradient: `linear-gradient(135deg, ${CRIMSON}, ${CRIMSON_DARK})`,
  ctaShadow: CRIMSON_CTA_SHADOW,
};
