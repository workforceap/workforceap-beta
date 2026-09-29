import { randomUUID } from 'crypto';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { prisma } from '@/lib/db/prisma';
import { getDefaultOrganizationId } from '@/lib/tenant/organization';
import { resolveSupabasePublicAssetUrl } from '@/lib/storage/publicAssetUrl';
import { hasAdminAccess, hasSuperAdminAccess, resolveEffectiveRole } from '@/lib/auth/roleAccess';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';
import { crossTenantOK } from '@/lib/tenant/withTenantScope';
import { logger } from '@/lib/observability/logger';

export { hasAdminAccess, hasSuperAdminAccess } from '@/lib/auth/roleAccess';

export const SUPER_ADMIN_EMPLOYER_COOKIE = 'wa_super_admin_employer_id';
export const SUPER_ADMIN_PARTNER_COOKIE = 'wa_super_admin_partner_id';
const SUPER_ADMIN_FALLBACK_PARTNER_SLUG = 'workforce-solutions-austin';
const SUPER_ADMIN_FALLBACK_PARTNER_NAME = 'Workforce Solutions Capital Area';
const SUPER_ADMIN_FALLBACK_EMPLOYER_EMAIL = 'employer-preview@example.com';
const SUPER_ADMIN_FALLBACK_EMPLOYER_NAME = 'WorkforceAP Example Employer';

type RoleContext = {
  userExists: boolean;
  deletedAt: Date | null;
  profileRole: string | null;
  userRoleNames: string[];
};

/**
 * One identity read per request for everything role-related (WAP-182
 * item 1): `users.deleted_at`, `profiles.role` and the `user_roles` names.
 * `getProfileRole`, `getUserRoles` and the `is*` guards all consume it, so
 * the hot path (`isAdmin` -> profile + rows) stays a single round-trip.
 * React `cache()` scopes it to the request; a missing user reads as an
 * account with nothing anywhere.
 */
const loadRoleContext = cache(async function loadRoleContext(userId: string): Promise<RoleContext> {
  // Identity lookup by auth user id: deliberately cross-tenant, the role is
  // not tenant data (super_admin in particular is platform-level).
  const user = await crossTenantOK(() =>
    prisma.$transaction((tx) =>
      tx.user.findUnique({
        where: { id: userId },
        select: {
          deletedAt: true,
          profile: { select: { role: true } },
          userRoles: { select: { role: { select: { name: true } } } },
        },
      })
    )
  );
  return {
    userExists: !!user,
    deletedAt: user?.deletedAt ?? null,
    profileRole: user?.profile?.role ?? null,
    userRoleNames: user?.userRoles.map((entry) => entry.role.name) ?? [],
  };
});

/** Persisted identity facts for member entitlement checks. The effective-role
 * default and baseline `member` row cannot establish that a member profile exists. */
export async function getStoredRoleIdentity(userId: string): Promise<Pick<RoleContext, 'userExists' | 'deletedAt' | 'profileRole'>> {
  const { userExists, deletedAt, profileRole } = await loadRoleContext(userId);
  return { userExists, deletedAt, profileRole };
}

export const getUserRoles = cache(async function getUserRoles(userId: string): Promise<string[]> {
  const context = await loadRoleContext(userId);
  // A soft-deleted account keeps its rows until the hard delete, but they
  // grant nothing (WAP-182 item 1, matches getProfileRole).
  if (context.deletedAt) return [];
  return [...context.userRoleNames];
});

let profileRoleFallbackLogged = false;

/**
 * The user's effective role, with `user_roles` as the source of truth
 * (WAP-182 item 1). Precedence lives in `resolveEffectiveRole`
 * (lib/auth/roleAccess.ts): soft-deleted -> member; a `super_admin` profile
 * stays super_admin; otherwise the most privileged non-`member` `user_roles`
 * row by `ROLE_PRECEDENCE`; only the baseline `member` row or none ->
 * `profiles.role` (logged once, no PII); nothing -> `member`. Signature and
 * return type are unchanged so the ~20 callers (login redirect,
 * /api/auth/me, feature flags, route guards) keep working;
 * `scripts/backfill-user-roles-from-profile.ts` seeds the missing rows so
 * the profile fallback becomes the exception.
 */
export const getProfileRole = cache(async function getProfileRole(userId: string): Promise<string> {
  const resolution = resolveEffectiveRole(await loadRoleContext(userId));
  if (resolution.source === 'profile' && !profileRoleFallbackLogged) {
    profileRoleFallbackLogged = true;
    logger.debug('role resolution fell back to profiles.role; no matching user_roles row', {
      source: 'profile',
    });
  }
  return resolution.role;
});

export const isSuperAdmin = cache(async function isSuperAdmin(userId: string): Promise<boolean> {
  const profileRole = await getProfileRole(userId);
  if (hasSuperAdminAccess(profileRole, [])) return true;
  const roles = await getUserRoles(userId);
  return hasSuperAdminAccess(profileRole, roles);
});

export async function isAdmin(userId: string): Promise<boolean> {
  const profileRole = await getProfileRole(userId);
  if (hasAdminAccess(profileRole, [])) return true;
  const roles = await getUserRoles(userId);
  return hasAdminAccess(profileRole, roles);
}

/**
 * Tenant-aware admin check. Required for any route that pairs with
 * `resolveOrgFromRequest()` — the global `isAdmin()` does not verify
 * that the user belongs to the resolved org, so a default-org admin
 * could otherwise hit a custom-domain URL and read another tenant's
 * data (Codex P1 catch on PR #1046).
 *
 * `super_admin` is platform-level and bypasses the tenant check —
 * that role is intentionally cross-tenant for support / ops.
 */
export async function isAdminInOrg(userId: string, orgId: string): Promise<boolean> {
  if (await isSuperAdmin(userId)) return true;
  if (!(await isAdmin(userId))) return false;
  const userRow = await prisma.user.findUnique({
    where: { id: userId },
    select: { organizationId: true },
  });
  return userRow?.organizationId === orgId;
}

export async function isStaff(userId: string): Promise<boolean> {
  const profileRole = await getProfileRole(userId);
  if (hasAdminAccess(profileRole, [])) return true;
  const roles = await getUserRoles(userId);
  return hasAdminAccess(profileRole, roles) || roles.includes('case_manager');
}

/**
 * Returns true if this user should bypass the member-assessment gate on
 * member-side dashboard pages. Super-admins and platform-admins viewing
 * member dashboards either to verify what members see, demo the platform,
 * or dogfood their own Coursera-linked progress shouldn't be forced
 * through the member assessment gauntlet.
 *
 * Members (`profileRole === 'member'` or no privileged role) still hit
 * the gate — that's working as intended.
 *
 * Cached per request via React `cache()` so multiple page-level checks
 * share one DB roundtrip.
 */
export const canBypassMemberAssessment = cache(async function canBypassMemberAssessment(
  userId: string
): Promise<boolean> {
  const profileRole = await getProfileRole(userId);
  if (hasAdminAccess(profileRole, [])) return true;
  const roles = await getUserRoles(userId);
  return hasAdminAccess(profileRole, roles);
});

export async function isCaseManager(userId: string): Promise<boolean> {
  const profileRole = await getProfileRole(userId);
  if (profileRole === 'case_manager') return true;
  const roles = await getUserRoles(userId);
  return roles.includes('case_manager');
}

export async function requireAdmin(userId: string): Promise<void> {
  const ok = await isAdmin(userId);
  if (!ok) {
    throw new Error('Forbidden: admin access required');
  }
}

export const isCounselor = cache(async function isCounselor(userId: string): Promise<boolean> {
  const row = await prisma.counselor.findFirst({
    where: { userId, active: true },
    select: { id: true },
  });
  if (row) return true;
  return isSuperAdmin(userId);
});

export async function isPartner(userId: string): Promise<boolean> {
  const row = await prisma.partnerUser.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (row) return true;
  return isSuperAdmin(userId);
}

export type PartnerPortalContext = {
  partnerId: string;
  partner: {
    id: string;
    organizationId: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    brandColor: string | null;
    /** Taxonomy used to gate payout UI/APIs. See `lib/partner/partnerType`. */
    partnerType: string;
  };
  /** Org-level branding colors (primary + accent/secondary). */
  orgBranding: {
    primaryColor: string | null;
    accentColor: string | null;
  };
  /** User has a real `partner_users` row (not super-admin viewing first partner). */
  hasDirectPartnerLink: boolean;
};

const PARTNER_BRANDING_SELECT = {
  id: true,
  organizationId: true,
  name: true,
  slug: true,
  logoUrl: true,
  brandColor: true,
  partnerType: true,
} as const;

async function getOrgBranding(organizationId: string): Promise<{ primaryColor: string | null; accentColor: string | null }> {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { primaryColor: true, accentColor: true },
    });
    return { primaryColor: org?.primaryColor ?? null, accentColor: org?.accentColor ?? null };
  } catch {
    return { primaryColor: null, accentColor: null };
  }
}

export async function getPartnerForUser(
  userId: string,
  options?: { isSuperAdminHint?: boolean; readOnlyAudit?: boolean }
): Promise<PartnerPortalContext | null> {
  const row = await prisma.partnerUser.findUnique({
    where: { userId },
    include: { partner: { select: { ...PARTNER_BRANDING_SELECT, active: true } } },
  });
  if (row) {
    if (!row.partner.active) return null;
    const { active: _a, ...partner } = row.partner;
    const orgBranding = await getOrgBranding(partner.organizationId);
    return { partnerId: row.partnerId, partner, orgBranding, hasDirectPartnerLink: true };
  }
  const superUser = options?.isSuperAdminHint ?? (await isSuperAdmin(userId));
  if (superUser) {
    const readOnlyAudit = options?.readOnlyAudit ?? await (async () => {
      try {
        return isReadOnlyPortalAuditHeader(await headers());
      } catch {
        return false;
      }
    })();
    const cookieStore = await cookies();
    const fromCookie = cookieStore.get(SUPER_ADMIN_PARTNER_COOKIE)?.value;
    if (fromCookie) {
      const byCookie = await prisma.partner.findFirst({
        where: { id: fromCookie, active: true },
        select: PARTNER_BRANDING_SELECT,
      });
      if (byCookie) {
        const orgBranding = await getOrgBranding(byCookie.organizationId);
        return { partnerId: byCookie.id, partner: byCookie, orgBranding, hasDirectPartnerLink: false };
      }
    }

    const fallbackPartner = await prisma.partner.findFirst({
      where: { slug: SUPER_ADMIN_FALLBACK_PARTNER_SLUG, active: true },
      select: PARTNER_BRANDING_SELECT,
    });
    if (fallbackPartner) {
      const orgBranding = await getOrgBranding(fallbackPartner.organizationId);
      return { partnerId: fallbackPartner.id, partner: fallbackPartner, orgBranding, hasDirectPartnerLink: false };
    }

    if (!readOnlyAudit) {
      const actor = await prisma.user.findUnique({
        where: { id: userId },
        select: { organizationId: true },
      });
      const ensuredFallbackPartner = await ensureSuperAdminFallbackPartner(actor?.organizationId);
      if (ensuredFallbackPartner) {
        const orgBranding = await getOrgBranding(ensuredFallbackPartner.organizationId);
        return {
          partnerId: ensuredFallbackPartner.id,
          partner: { ...ensuredFallbackPartner, logoUrl: null, brandColor: null },
          orgBranding,
          hasDirectPartnerLink: false,
        };
      }

      const anyActivePartner = await prisma.partner.findFirst({
        where: { active: true },
        orderBy: { createdAt: 'asc' },
        select: PARTNER_BRANDING_SELECT,
      });
      if (anyActivePartner) {
        const orgBranding = await getOrgBranding(anyActivePartner.organizationId);
        return { partnerId: anyActivePartner.id, partner: anyActivePartner, orgBranding, hasDirectPartnerLink: false };
      }
    }

    return null;
  }
  return null;
}

export async function getCounselorForUser(
  userId: string
): Promise<{ counselorId: string; partnerId: string | null; partnerName: string } | null> {
  const counselor = await prisma.counselor.findFirst({
    where: { userId, active: true },
    include: { partner: { select: { id: true, name: true } } },
  });
  if (!counselor) return null;
  return {
    counselorId: counselor.id,
    partnerId: counselor.partnerId,
    partnerName: counselor.partner?.name ?? 'WorkforceAP',
  };
}

export async function hasMultiplePortalRoles(userId: string): Promise<{
  isCounselor: boolean;
  isPartner: boolean;
  isEmployer: boolean;
  isAdmin: boolean;
}> {
  const [counselor, partner, employer, admin] = await Promise.all([
    isCounselor(userId),
    isPartner(userId),
    isEmployer(userId),
    isAdmin(userId),
  ]);
  
  return {
    isCounselor: counselor,
    isPartner: partner,
    isEmployer: employer,
    isAdmin: admin,
  };
}

/** Subgroup leader: user is leader_id of a subgroup or in subgroup_leaders */
export async function isSubgroupLeader(userId: string): Promise<boolean> {
  const [led, inLeaders] = await Promise.all([
    prisma.subgroup.findFirst({ where: { leaderId: userId }, select: { id: true } }),
    prisma.subgroupLeader.findFirst({ where: { userId }, select: { id: true } }),
  ]);
  return !!led || !!inLeaders;
}

/** Get subgroups this user can view (as leader or secondary leader) */
export async function getSubgroupsForUser(
  userId: string
): Promise<{ subgroupId: string; subgroup: { id: string; name: string; type: string } }[]> {
  const led = await prisma.subgroup.findMany({
    where: { leaderId: userId },
    select: { id: true, name: true, type: true },
  });
  const viaLeaders = await prisma.subgroupLeader.findMany({
    where: { userId },
    include: { subgroup: { select: { id: true, name: true, type: true } } },
  });
  const seen = new Set<string>();
  const result: { subgroupId: string; subgroup: { id: string; name: string; type: string } }[] = [];
  for (const s of led) {
    if (!seen.has(s.id)) {
      seen.add(s.id);
      result.push({ subgroupId: s.id, subgroup: s });
    }
  }
  for (const sl of viaLeaders) {
    if (!seen.has(sl.subgroup.id)) {
      seen.add(sl.subgroup.id);
      result.push({ subgroupId: sl.subgroup.id, subgroup: sl.subgroup });
    }
  }
  return result;
}

export async function requireSubgroupLeader(userId: string): Promise<{ subgroupId: string; subgroup: { id: string; name: string; type: string } }[]> {
  const subgroups = await getSubgroupsForUser(userId);
  if (subgroups.length === 0) {
    throw new Error('Forbidden: subgroup leader access required');
  }
  return subgroups;
}

/** Employer: user has an Employer record */
export async function isEmployer(userId: string): Promise<boolean> {
  const row = await prisma.employer.findUnique({
    where: { userId },
    select: { id: true },
  });
  return !!row;
}

async function resolvePreviewFallbackOrganizationId(
  preferredOrganizationId?: string | null,
): Promise<string> {
  const preferred = preferredOrganizationId?.trim();
  if (preferred) return preferred;
  return getDefaultOrganizationId();
}

async function ensureSuperAdminFallbackPartner(
  preferredOrganizationId?: string | null,
): Promise<{
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  partnerType: string;
}> {
  const existing = await prisma.partner.findUnique({
    where: { slug: SUPER_ADMIN_FALLBACK_PARTNER_SLUG },
    select: { organizationId: true },
  });
  // Keep an existing fallback partner in its current tenant; only new
  // creates take the actor org (or default when the actor has none).
  const organizationId = existing?.organizationId
    ?? await resolvePreviewFallbackOrganizationId(preferredOrganizationId);
  return prisma.partner.upsert({
    where: { slug: SUPER_ADMIN_FALLBACK_PARTNER_SLUG },
    update: { active: true, referralCode: SUPER_ADMIN_FALLBACK_PARTNER_SLUG },
    create: {
      organizationId,
      name: SUPER_ADMIN_FALLBACK_PARTNER_NAME,
      slug: SUPER_ADMIN_FALLBACK_PARTNER_SLUG,
      referralCode: SUPER_ADMIN_FALLBACK_PARTNER_SLUG,
      active: true,
    },
    select: { id: true, organizationId: true, name: true, slug: true, partnerType: true },
  });
}

async function ensureSuperAdminFallbackEmployer(
  preferredOrganizationId?: string | null,
): Promise<{
  id: string;
  companyName: string;
  contactEmail: string;
  tier: string;
  logoUrl: string | null;
}> {
  const createOrganizationId = await resolvePreviewFallbackOrganizationId(preferredOrganizationId);
  const user = await prisma.user.upsert({
    where: { email: SUPER_ADMIN_FALLBACK_EMPLOYER_EMAIL },
    update: { fullName: 'Preview Employer Seed' },
    create: {
      id: randomUUID(),
      organizationId: createOrganizationId,
      email: SUPER_ADMIN_FALLBACK_EMPLOYER_EMAIL,
      fullName: 'Preview Employer Seed',
    },
    select: { id: true, organizationId: true },
  });
  // If the seed user already exists, stamp the employer row with THAT org
  // rather than the default tenant.
  const organizationId = user.organizationId;

  return prisma.employer.upsert({
    where: { userId: user.id },
    update: {
      companyName: SUPER_ADMIN_FALLBACK_EMPLOYER_NAME,
      contactEmail: SUPER_ADMIN_FALLBACK_EMPLOYER_EMAIL,
      status: 'active',
    },
    create: {
      organizationId,
      userId: user.id,
      companyName: SUPER_ADMIN_FALLBACK_EMPLOYER_NAME,
      contactName: 'WorkforceAP',
      contactEmail: SUPER_ADMIN_FALLBACK_EMPLOYER_EMAIL,
      tier: 'basic',
      status: 'active',
    },
    select: { id: true, companyName: true, contactEmail: true, tier: true, logoUrl: true },
  });
}

function mapEmployerRow(row: {
  id: string;
  companyName: string;
  contactEmail: string;
  tier: string;
  logoUrl: string | null;
  status?: string;
}): {
  employerId: string;
  employer: { id: string; companyName: string; contactEmail: string; tier: string; logoUrl: string | null; status: string };
} {
  return {
    employerId: row.id,
    employer: {
      id: row.id,
      companyName: row.companyName,
      contactEmail: row.contactEmail,
      tier: row.tier,
      logoUrl: resolveSupabasePublicAssetUrl('employer-logos', row.logoUrl),
      status: row.status ?? 'active',
    },
  };
}

/**
 * Employer portal context. Super-admins can open a specific employer via Admin → Employers ("Open portal"),
 * stored in a cookie; otherwise they fall back only to their own employer row (if any).
 * Pass `isSuperAdminHint` when the caller already computed it to avoid duplicate `profile` reads.
 */
export async function getEmployerForUser(
  userId: string,
  options?: { isSuperAdminHint?: boolean; readOnlyAudit?: boolean }
): Promise<{
  employerId: string;
  employer: { id: string; companyName: string; contactEmail: string; tier: string; logoUrl: string | null; status: string };
} | null> {
  const superUser =
    options?.isSuperAdminHint !== undefined ? options.isSuperAdminHint : await isSuperAdmin(userId);

  if (superUser) {
    const readOnlyAudit = options?.readOnlyAudit ?? await (async () => {
      try {
        return isReadOnlyPortalAuditHeader(await headers());
      } catch {
        return false;
      }
    })();
    const cookieStore = await cookies();
    const fromCookie = cookieStore.get(SUPER_ADMIN_EMPLOYER_COOKIE)?.value;
    if (fromCookie) {
      const byCookie = await prisma.employer.findFirst({
        where: { id: fromCookie, status: 'active' },
        select: { id: true, companyName: true, contactEmail: true, tier: true, logoUrl: true, status: true },
      });
      if (byCookie) return mapEmployerRow(byCookie);
    }

    const fallbackEmployer = await prisma.employer.findFirst({
      where: { contactEmail: SUPER_ADMIN_FALLBACK_EMPLOYER_EMAIL, status: 'active' },
      select: { id: true, companyName: true, contactEmail: true, tier: true, logoUrl: true, status: true },
    });
    if (fallbackEmployer) return mapEmployerRow(fallbackEmployer);

    if (!readOnlyAudit) {
      const actor = await prisma.user.findUnique({
        where: { id: userId },
        select: { organizationId: true },
      });
      const ensuredFallbackEmployer = await ensureSuperAdminFallbackEmployer(actor?.organizationId);
      if (ensuredFallbackEmployer) return mapEmployerRow(ensuredFallbackEmployer);

      const anyActiveEmployer = await prisma.employer.findFirst({
        where: { status: 'active' },
        orderBy: { createdAt: 'asc' },
        select: { id: true, companyName: true, contactEmail: true, tier: true, logoUrl: true, status: true },
      });
      if (anyActiveEmployer) return mapEmployerRow(anyActiveEmployer);
    }
  }

  const row = await prisma.employer.findUnique({
    where: { userId },
    select: { id: true, companyName: true, contactEmail: true, status: true, tier: true, logoUrl: true },
  });
  if (row && (row.status === 'active' || row.status === 'pending_approval')) {
    return mapEmployerRow(row);
  }

  if (superUser) {
    return null;
  }

  return null;
}

/**
 * Employer context for marketing nav / portal entry link.
 * Super-admins only get a company when impersonating via cookie — never the global DB fallback
 * (see getEmployerForUser), so the public nav does not send them to a random employer portal.
 */
export async function getEmployerAccountForNav(
  userId: string
): Promise<{ employerId: string; companyName: string } | null> {
  const superUser = await isSuperAdmin(userId);
  if (superUser) {
    const cookieStore = await cookies();
    const fromCookie = cookieStore.get(SUPER_ADMIN_EMPLOYER_COOKIE)?.value;
    if (!fromCookie) return null;
    const byCookie = await prisma.employer.findFirst({
      where: { id: fromCookie, status: 'active' },
      select: { id: true, companyName: true },
    });
    return byCookie ? { employerId: byCookie.id, companyName: byCookie.companyName } : null;
  }

  const row = await prisma.employer.findUnique({
    where: { userId },
    select: { id: true, companyName: true, status: true },
  });
  if (row && (row.status === 'active' || row.status === 'pending_approval')) {
    return { employerId: row.id, companyName: row.companyName };
  }
  return null;
}

/** Check if user is an approved mentor */
export async function isMentor(userId: string): Promise<boolean> {
  const row = await prisma.mentor.findUnique({
    where: { userId },
    select: { id: true, isActive: true, approvedAt: true },
  });
  if (!row) return false;
  return row.isActive && !!row.approvedAt;
}

/**
 * Require admin or counselor access for an API route.
 * Checks user roles and counselor status.
 * Returns { ok: true, userId: string } or { ok: false, error: string, status: number }.
 */
export async function requireAdminOrCounselor(req: Request): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string; status: number }
> {
  const { getUser } = await import('@/lib/auth/server');
  const user = await getUser();
  if (!user) {
    return { ok: false, error: 'Unauthorized', status: 401 };
  }

  const [admin, counselor] = await Promise.all([
    isAdmin(user.id),
    isCounselor(user.id),
  ]);

  if (!admin && !counselor) {
    return { ok: false, error: 'Forbidden: admin or counselor access required', status: 403 };
  }

  return { ok: true, userId: user.id };
}
