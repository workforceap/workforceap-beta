/**
 * VoiceAgentSurface presets for messaging — same gradient-ring + badge language as voice agents.
 *
 * `glowColor` is always a `--wa-*` token: VoiceAgentSurface color-mixes it for
 * the ring shadow and icon tile, and it is the badge text where no `badgeColor`
 * is set, so it must follow light-dark(). The ring gradients are 1px
 * text-free bands and keep their literal stops.
 */
type MessagingSurface = {
  badge: string;
  subtext?: string;
  icon: string;
  glowColor: string;
  /**
   * Badge label colour when the glow hue is too light to read as 13px text on
   * the card (same contract as voiceAgentSurfaces.ts). The glow keeps the hue.
   */
  badgeColor?: string;
  gradient: string;
};

export const memberMessagingSurface: MessagingSurface = {
  badge: 'Messages',
  subtext: 'Private thread with your counselor — replies in real time.',
  icon: '💬',
  glowColor: 'var(--wa-accent-text)',
  gradient: 'linear-gradient(135deg, #670024, #8c0f37, #e8a0b3)',
};

export const partnerMessagingSurface: MessagingSurface = {
  badge: 'Partnership desk',
  subtext: 'Direct line to WorkforceAP — referrals, milestones, and resources.',
  icon: '🤝',
  glowColor: 'var(--wa-glow-ember)',
  // The ember glow on white measured 3.56:1; the text-on-gold token is the warm text hue.
  badgeColor: 'var(--wa-gold-dark)',
  gradient: 'linear-gradient(135deg, #ea580c, #f97316, #fdba74)',
};

export const employerMessagingSurface: MessagingSurface = {
  badge: 'Employer messages',
  subtext: 'Your team channel and candidate threads in one place.',
  icon: '🏢',
  glowColor: 'var(--wa-glow-indigo)',
  // The indigo glow on the dark card measured 3.08:1; the text-on-info token is the cool text hue.
  badgeColor: 'var(--wa-info-dark)',
  gradient: 'linear-gradient(135deg, #4f46e5, #6366f1, #a5b4fc)',
};

export const counselorStaffMessagingSurface: MessagingSurface = {
  badge: 'Member thread',
  subtext: 'Staff view — synced with the member inbox.',
  icon: '💬',
  glowColor: 'var(--wa-glow-fuchsia)',
  gradient: 'linear-gradient(135deg, #86198f, #c026d3, #f0abfc)',
};

export const adminMessagingSurface: MessagingSurface = {
  badge: 'Member messages',
  subtext: 'Admin view — use responsibly; members are notified on send.',
  icon: '🛡️',
  glowColor: 'var(--wa-glow-slate)',
  gradient: 'linear-gradient(135deg, #1e293b, #475569, #94a3b8)',
};
