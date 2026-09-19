import { Prisma } from '@prisma/client';

export type EligibilityFormMeta = {
  version: 1;
  updatedAt: string;
  ageGroup: string | null;
  county: string | null;
  q1: string | null;
  q2: string | null;
  q3: string | null;
  receivingUnemployment: string | null;
  exhaustedUnemployment: string | null;
  layoffCompany: string | null;
  snapWic: string | null;
  hearAbout: string | null;
  hearAboutOther: string | null;
  partnerAmbassadorReferral: string | null;
};

/** Real transaction required. Share the member-row lock used by reviews and assignment. */
export async function lockEligibilityMember(
  tx: Prisma.TransactionClient,
  userId: string,
  organizationId?: string,
) {
  const organizationClause = organizationId === undefined
    ? Prisma.empty : Prisma.sql`AND organization_id = ${organizationId}`;
  const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM users WHERE id = ${userId} AND deleted_at IS NULL
    ${organizationClause} FOR UPDATE
  `);
  if (locked.length !== 1) throw new Error('ELIGIBILITY_SUBJECT_UNAVAILABLE');
  const current = await tx.user.findFirst({
    where: { id: userId, deletedAt: null, ...(organizationId === undefined ? {} : { organizationId }) },
    select: { wioaQualificationJson: true, organizationId: true, fullName: true, email: true },
  });
  if (!current) throw new Error('ELIGIBILITY_SUBJECT_UNAVAILABLE');
  return current;
}

/** Replace only eligibilityForm, retaining the saved self-screening and other ancillary keys. */
export async function saveEligibilityForm(
  tx: Prisma.TransactionClient,
  input: { userId: string; organizationId: string; previous: Prisma.JsonValue; form: EligibilityFormMeta },
) {
  const { userId, organizationId, previous, form } = input;
  const existing = previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {};
  const updated = await tx.user.updateMany({
    where: {
      id: userId, organizationId, deletedAt: null,
      wioaQualificationJson: { equals: previous ?? Prisma.AnyNull },
    },
    data: { wioaQualificationJson: { ...existing, eligibilityForm: form } as Prisma.InputJsonObject },
  });
  if (updated.count !== 1) throw new Error('ELIGIBILITY_FORM_CONFLICT');
}

export function eligibilityWriteFailure(error: unknown): { status: 404 | 409; error: string } | null {
  if (error instanceof Error && error.message === 'ELIGIBILITY_SUBJECT_UNAVAILABLE') {
    return { status: 404, error: 'Member not found' };
  }
  if ((error instanceof Error && error.message === 'ELIGIBILITY_FORM_CONFLICT') ||
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')) {
    return { status: 409, error: 'Your screening changed. Reload and try again.' };
  }
  return null;
}
