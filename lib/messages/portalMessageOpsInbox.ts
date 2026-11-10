/** Ops inbox for portal Messages — dad gets a copy of every notification email. */
export const PORTAL_MESSAGE_OPS_INBOX = 'michael.brown@workforceap.org';

export function portalMessageForwardBcc(primaryTo: string): string[] | undefined {
  const normalized = primaryTo.trim().toLowerCase();
  if (normalized === PORTAL_MESSAGE_OPS_INBOX) return undefined;
  return [PORTAL_MESSAGE_OPS_INBOX];
}
