import { NextResponse } from 'next/server';
import { getUser, hasSupabaseServerEnv } from '@/lib/auth/server';
import {
  getProfileRole,
  getPartnerForUser,
  getEmployerAccountForNav,
  getCounselorForUser,
  getUserRoles,
  isAdmin,
  isSuperAdmin,
} from '@/lib/auth/roles';
import { getPortalSwitcherRoles } from '@/lib/auth/portalRoleSwitcher';
import { captureApiError } from '@/lib/observability/captureApiError';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { withDbRetry } from '@/lib/db/withDbRetry';
import { isReadOnlyPortalAuditHeader } from '@/lib/audit/readOnlyPortalAudit';

export const GET = withApiGuc(async (request: Request) => {
  try {
    const readOnlyAudit = isReadOnlyPortalAuditHeader(request.headers);
    if (!hasSupabaseServerEnv()) {
      return NextResponse.json(
        {
          role: null,
          partner: null,
          employer: null,
          counselor: null,
          superAdmin: false,
          canAccessMemberDashboard: false,
          availablePortals: [],
        },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const user = await getUser();
    if (!user) {
      return NextResponse.json(
        {
          role: null,
          partner: null,
          employer: null,
          counselor: null,
          superAdmin: false,
          canAccessMemberDashboard: false,
          availablePortals: [],
        },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const role = await withDbRetry(() => getProfileRole(user.id)).catch((err) => {
      if (readOnlyAudit) throw err;
      console.error('[api:auth-me] profileRole lookup failed; degrading to member', err);
      return 'member';
    });
    const superAdmin = await withDbRetry(() => isSuperAdmin(user.id)).catch((err) => {
      if (readOnlyAudit) throw err;
      console.error('[api:auth-me] isSuperAdmin lookup failed; falling back to profile role', err);
      return role === 'super_admin';
    });

    if (superAdmin) {
      const availablePortals = await withDbRetry(() => getPortalSwitcherRoles(user.id, {
        superAdmin: true,
        userRoleNames: ['super_admin'],
        hasEmployer: false,
        hasPartner: false,
        hasCounselor: false,
        hasAdmin: true,
      }));

      return NextResponse.json(
        {
          role,
          partner: null,
          employer: null,
          counselor: null,
          superAdmin: true,
          canAccessMemberDashboard: true,
          availablePortals,
        },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Fetch each primitive once, then hand them to getPortalSwitcherRoles as
    // precomputed inputs. Previously the switcher re-fetched partner / counselor
    // / employer / roles / super-admin internally, doubling DB work on this
    // frequently polled endpoint and amplifying connection-pool pressure
    // (Sentry JAVASCRIPT-NEXTJS-T: "Unable to start a transaction in the given time").
    const [partnerCtx, counselorCtx, employerNav, userRoleNames, adminAccess] =
      await withDbRetry(() =>
        Promise.all([
          getPartnerForUser(user.id),
          getCounselorForUser(user.id),
          getEmployerAccountForNav(user.id),
          getUserRoles(user.id),
          isAdmin(user.id),
        ]),
      );

    const availablePortals = await withDbRetry(() => getPortalSwitcherRoles(user.id, {
      superAdmin: false,
      userRoleNames,
      hasEmployer: !!employerNav,
      hasPartner: !!partnerCtx,
      hasCounselor: !!counselorCtx,
      hasAdmin: adminAccess,
    }));

    const canAccessMemberDashboard = availablePortals.some(({ role }) => role === 'member');

    return NextResponse.json(
      {
        role: role || 'member',
        partner: partnerCtx ? { partnerId: partnerCtx.partnerId, name: partnerCtx.partner.name } : null,
        employer: employerNav,
        counselor: counselorCtx ? { counselorId: counselorCtx.counselorId, partnerId: counselorCtx.partnerId } : null,
        superAdmin: false,
        canAccessMemberDashboard,
        availablePortals,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    captureApiError(err, { route: 'auth/me' });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
