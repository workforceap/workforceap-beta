/**
 * Where a staff message notification opens. A counselor lands on the member's
 * thread in the counselor inbox (`/counselor/messages` resolves `?memberId=`
 * against the counselor's own caseload); the member inbox
 * (`/dashboard/messages`) is never a staff destination.
 */
export function counselorMemberThreadLink(memberId: string): string {
  return `/counselor/messages?memberId=${encodeURIComponent(memberId)}`;
}
