import 'server-only';

import { prisma } from '@/lib/db/prisma';

export type PartnerIntakeMetadata = {
  orgType: string | null;
  serveArea: string | null;
  expectedMonthly: string | null;
  /** True when a PartnerSignupRequest row was matched to this partner. */
  fromSignupRequest: boolean;
};

/**
 * Intake fields captured on PartnerSignupRequest at self-serve signup.
 * Partner rows keep `organizationType` but not serveArea / expectedMonthly —
 * those live only on the signup audit row. Match by contact email first, then
 * organization name (same values written in the signup transaction).
 */
export async function loadPartnerIntakeMetadata(partner: {
  name: string;
  contactEmail: string | null;
  organizationType: string | null;
}): Promise<PartnerIntakeMetadata> {
  const email = partner.contactEmail?.trim().toLowerCase() || null;
  const signup = email
    ? await prisma.partnerSignupRequest.findFirst({
        where: { contactEmail: email },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { orgType: true, serveArea: true, expectedMonthly: true },
      })
    : await prisma.partnerSignupRequest.findFirst({
        where: { organizationName: partner.name },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { orgType: true, serveArea: true, expectedMonthly: true },
      });

  if (!signup) {
    return {
      orgType: partner.organizationType?.trim() || null,
      serveArea: null,
      expectedMonthly: null,
      fromSignupRequest: false,
    };
  }

  return {
    orgType: signup.orgType?.trim() || partner.organizationType?.trim() || null,
    serveArea: signup.serveArea?.trim() || null,
    expectedMonthly: signup.expectedMonthly?.trim() || null,
    fromSignupRequest: true,
  };
}

export function partnerContactIncomplete(partner: {
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
}): boolean {
  return !partner.contactName?.trim() || !partner.contactEmail?.trim() || !partner.contactPhone?.trim();
}
