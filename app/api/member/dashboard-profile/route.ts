import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { z } from 'zod';

import { invalidateMemberState } from '@/lib/member/getMemberState';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { isValidPostalCode } from '@/lib/validation/postalCode';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';
import { MemberLifecycleWriteError, withActiveMemberWrite } from '@/lib/member/activeWrite';

const VALID_BARRIER_TYPES = [
  'justice_involved',
  'employment_gap',
  'limited_work_history',
  'disability',
  'housing_instability',
  'domestic_violence',
  'homelessness',
  'substance_recovery',
  'other',
] as const;

const VALID_EMPLOYMENT_STATUS_AT_ENROLL = [
  'employed_full_time',
  'employed_part_time',
  'unemployed',
  'underemployed',
  'not_looking',
] as const;

const updateSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1, 'Last name is required.').max(100),
  phone: z
    .string()
    .max(50)
    .nullable()
    .refine((value) => !value || value.replace(/\D/g, '').length >= 10, 'Use a phone number with at least 10 digits.'),
  address: z.string().max(500).nullable().refine((value) => !value || value.trim().length >= 5, 'Enter a street address.'),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(50).optional().nullable(),
  zip: z
    .string()
    .max(20)
    .optional()
    .nullable()
    .refine((value) => !value || isValidPostalCode(value), 'Enter a valid ZIP or postal code.'),
  linkedin: z.string().max(500).nullable(),
  bio: z.string().max(2000).nullable(),
  financialAidInterest: z.boolean().optional(),
  referralSource: z.string().max(200).optional().nullable(),
  hasEmploymentBarrier: z.boolean().optional(),
  barrierTypes: z.array(z.enum(VALID_BARRIER_TYPES)).optional(),
  employmentStatusAtEnroll: z.enum(VALID_EMPLOYMENT_STATUS_AT_ENROLL).optional().nullable(),
});export const PATCH = withApiGuc(async (request: Request) => {
  try {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? 'Validation failed' }, { status: 400 });
  }

  const {
    firstName,
    lastName,
    phone,
    address,
    city,
    state,
    zip,
    linkedin,
    bio,
    financialAidInterest,
    referralSource,
    hasEmploymentBarrier,
    barrierTypes,
    employmentStatusAtEnroll,
  } = parsed.data;
  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

  await withActiveMemberWrite(user.id, async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { fullName, phone: phone || null },
    });
    await tx.profile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        profilePhone: phone || null,
        profileAddress: address || null,
        city: city?.trim() || null,
        state: state?.trim() || null,
        zip: zip?.trim() || null,
        profileLinkedin: linkedin?.trim() ? linkedin.trim() : null,
        profileBio: bio || null,
        ...(financialAidInterest !== undefined ? { financialAidInterest } : {}),
        ...(referralSource !== undefined ? { referralSource: referralSource?.trim() || null } : {}),
        ...(hasEmploymentBarrier !== undefined ? { hasEmploymentBarrier } : {}),
        ...(barrierTypes !== undefined ? { barrierTypes } : {}),
        ...(employmentStatusAtEnroll !== undefined ? { employmentStatusAtEnroll: employmentStatusAtEnroll ?? null } : {}),
      },
      update: {
        profilePhone: phone || null,
        profileAddress: address || null,
        ...(city !== undefined ? { city: city?.trim() || null } : {}),
        ...(state !== undefined ? { state: state?.trim() || null } : {}),
        ...(zip !== undefined ? { zip: zip?.trim() || null } : {}),
        profileLinkedin: linkedin?.trim() ? linkedin.trim() : null,
        profileBio: bio || null,
        ...(financialAidInterest !== undefined ? { financialAidInterest } : {}),
        ...(referralSource !== undefined ? { referralSource: referralSource?.trim() || null } : {}),
        ...(hasEmploymentBarrier !== undefined ? { hasEmploymentBarrier } : {}),
        ...(barrierTypes !== undefined ? { barrierTypes } : {}),
        ...(employmentStatusAtEnroll !== undefined ? { employmentStatusAtEnroll: employmentStatusAtEnroll ?? null } : {}),
      },
    });
  });

  // Invalidate cached member state so dashboard reflects changes immediately
  await invalidateMemberState(user.id);

  auditLog({ actorUserId: user.id, action: 'member.dashboardProfile.update', targetType: 'DashboardProfile', targetId: user.id }).catch(() => {});
  logAuditEvent({ user: { id: user.id, role: 'member' }, verb: 'update', object: { type: 'DashboardProfile', id: user.id }, result: { success: true } }).catch(() => {});
  return NextResponse.json({ ok: true });

  } catch (error) {
    if (error instanceof MemberLifecycleWriteError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('/member/dashboard-profile error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

