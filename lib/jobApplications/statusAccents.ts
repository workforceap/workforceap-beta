/**
 * Status accents for the member job-application tracker (card + kanban).
 *
 * One token per pipeline stage, read by both the kanban column / card accent
 * (`--portal-kanban-accent`: left border, column count chip) and the status
 * badge text, so the two surfaces agree and follow dark mode. Every value is
 * a text-safe ramp (4.5:1+ on --wa-surface and on its own 10% tint, both
 * modes — tests/components/hex-sweep-2.spec.tsx does the arithmetic), not a
 * fill hue. Accepted is a green-blue mix so it stays apart from Offer.
 */
import type { JobApplicationStatus } from "./constants";

export const JOB_APPLICATION_STATUS_ACCENT: Record<JobApplicationStatus, string> = {
  SAVED: "var(--wa-muted-strong)",
  APPLIED: "var(--wa-accent-text)",
  PHONE_SCREEN: "var(--wa-info-dark)",
  INTERVIEWING: "var(--wa-gold-dark)",
  OFFER: "var(--wa-success-dark)",
  ACCEPTED: "color-mix(in srgb, var(--wa-success-dark) 50%, var(--wa-info-dark))",
  REJECTED: "var(--wa-danger-text)",
};
