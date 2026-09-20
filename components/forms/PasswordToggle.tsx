'use client';

import type { CSSProperties } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export type PasswordToggleProps = {
  /** Whether the paired password field currently reveals its value. */
  visible: boolean;
  /** Flips `visible`; the owner keeps the field `type` in sync. */
  onToggle: () => void;
  /** Accessible name while the value is hidden (e.g. "Show password"). */
  showLabel: string;
  /** Accessible name while the value is shown (e.g. "Hide password"). */
  hideLabel: string;
  /** `id` of the password input this control reveals. */
  controls?: string;
  /** Optional page skin (color, offset). Geometry comes from `.password-toggle`. */
  className?: string;
  style?: CSSProperties;
  iconSize?: number;
};

/**
 * One accessible show/hide password control shared by every public and
 * portal password field (login, signup, reset, apply account, employer signup).
 *
 * Contract:
 * - real `<button type="button">` in the natural tab order (never `tabindex=-1`);
 * - `aria-pressed` mirrors the revealed state; `aria-label` names the action;
 * - `aria-controls` points at the input it reveals;
 * - a 44px minimum hit target (`.password-toggle`, css/main.css) and a
 *   decorative Lucide glyph — no icon-font ligature.
 */
export default function PasswordToggle({
  visible,
  onToggle,
  showLabel,
  hideLabel,
  controls,
  className,
  style,
  iconSize = 20,
}: PasswordToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={className ? `password-toggle ${className}` : 'password-toggle'}
      style={style}
      aria-label={visible ? hideLabel : showLabel}
      aria-pressed={visible}
      aria-controls={controls}
    >
      {visible ? <EyeOff size={iconSize} aria-hidden="true" /> : <Eye size={iconSize} aria-hidden="true" />}
    </button>
  );
}
