/**
 * VoiceAgentSurface presets for messaging — same gradient-ring + badge language as voice agents.
 *
 * `glowColor` is always a `--wa-*` token: VoiceAgentSurface color-mixes it for
 * the ring shadow and icon tile, and it is the badge text where no `badgeColor`
 * is set, so it must follow light-dark(). The ring gradients are 1px
 * text-free bands (the surface also blurs them into the card's corner blob);
 * their stops derive from the glow token with color-mix so the ring follows
 * the theme too (#2491 follow-up; they used to be literal hex stops).
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

/**
 * Three-stop ring from one glow token: `deep` starts three quarters of the
 * way to black and `hue` starts on the glow itself; both end in a 35% tint
 * toward white. Approximates the former literal stops (#670024 → #8c0f37 →
 * #e8a0b3 and friends) while tracking the token's light-dark() value.
 */
export function ringGradient(glow: string, start: 'deep' | 'hue'): string {
  const first = start === 'deep' ? `color-mix(in srgb, ${glow} 75%, black)` : glow;
  const middle = start === 'deep' ? glow : `color-mix(in srgb, ${glow} 80%, white)`;
  return `linear-gradient(135deg, ${first}, ${middle}, color-mix(in srgb, ${glow} 35%, white))`;
}

export const memberMessagingSurface: MessagingSurface = {
  badge: 'Messages',
  subtext: 'Private thread with your counselor — replies in real time.',
  icon: '💬',
  glowColor: 'var(--wa-accent-text)',
  gradient: ringGradient('var(--wa-accent-text)', 'deep'),
};

export const partnerMessagingSurface: MessagingSurface = {
  badge: 'Partnership desk',
  subtext: 'Direct line to WorkforceAP — referrals, milestones, and resources.',
  icon: '🤝',
  glowColor: 'var(--wa-glow-ember)',
  // The ember glow on white measured 3.56:1; the text-on-gold token is the warm text hue.
  badgeColor: 'var(--wa-gold-dark)',
  gradient: ringGradient('var(--wa-glow-ember)', 'hue'),
};

export const employerMessagingSurface: MessagingSurface = {
  badge: 'Employer messages',
  subtext: 'Your team channel and candidate threads in one place.',
  icon: '🏢',
  glowColor: 'var(--wa-glow-indigo)',
  // The indigo glow on the dark card measured 3.08:1; the text-on-info token is the cool text hue.
  badgeColor: 'var(--wa-info-dark)',
  gradient: ringGradient('var(--wa-glow-indigo)', 'hue'),
};

export const counselorStaffMessagingSurface: MessagingSurface = {
  badge: 'Member thread',
  subtext: 'Staff view — synced with the member inbox.',
  icon: '💬',
  glowColor: 'var(--wa-glow-fuchsia)',
  gradient: ringGradient('var(--wa-glow-fuchsia)', 'deep'),
};

export const adminMessagingSurface: MessagingSurface = {
  badge: 'Member messages',
  subtext: 'Admin view — use responsibly; members are notified on send.',
  icon: '🛡️',
  glowColor: 'var(--wa-glow-slate)',
  gradient: ringGradient('var(--wa-glow-slate)', 'deep'),
};
