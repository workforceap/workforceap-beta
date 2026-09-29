import { NextRequest, NextResponse } from 'next/server';

import { getUser } from '@/lib/auth/server';
import { isAdminInOrg, isSuperAdmin } from '@/lib/auth/roles';
import { seedCanonicalMappingsFromCatalog } from '@/lib/coursera/seedCanonicalMappingsFromCatalog';
import { captureApiError } from '@/lib/observability/captureApiError';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { auditLog } from '@/lib/audit';
import { logAuditEvent } from '@/lib/audit/log';
import { withApiGuc } from '@/lib/db/withRequestGuc';

/**
 * POST /api/admin/coursera/seed-canonical-mappings-from-catalog
 *
 * One-click action that walks the program catalog (`courses` table) and
 * upserts a `CourseraCanonicalCourseMapping` row for every Course with a real
 * (non-`TODO_…`, non-empty) Coursera course id. This is the production fix
 * for an empty mapping table — without it, every inbound xAPI event from
 * Coursera bounces with `completion_status='unresolved_course'` (`'ignored'` before WAP-276) and never promotes to
 * `course_progress`. The /admin/coursera/health page flags the empty state in
 * red; this endpoint resolves it from data we already have.
 *
 * Auth: super_admin OR admin in the actor's org. Mirrors
 * `app/api/admin/coursera/sync-user-from-b4b/route.ts`.
 *
 * Body: none. (The seeder always walks the entire catalog — there's no row
 * filter to expose.)
 *
 * Response: the SeedCanonicalMappingsSummary returned by the lib function:
 *   { scanned, upsertedCreated, upsertedUpdated, skippedPlaceholder, skippedNoProgram }
 *
 * Idempotent — running twice is safe (each row is upserted on the unique
 * `courseraCourseId` column).
 */

async function _POST(_request: NextRequest) {
  try {
    const actor = await getUser();
    if (!actor) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  
    let orgId: string;
    try {
      orgId = await getActorOrganizationId(actor.id);
    } catch (err) {
      captureApiError(err, { route: 'admin/coursera/seed-canonical-mappings-from-catalog' });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  
    const superAdmin = await isSuperAdmin(actor.id);
    if (!superAdmin && !(await isAdminInOrg(actor.id, orgId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  
    try {
      const summary = await seedCanonicalMappingsFromCatalog({ actorUserId: actor.id });
      void auditLog({ actorUserId: actor.id, action: 'admin_coursera_seed_mappings_catalog', targetType: 'User', targetId: actor.id, metadata: {} }).catch(() => {});
      logAuditEvent({ user: { id: actor.id, role: 'admin' }, verb: 'created', object: { type: 'CourseraSeedMappingsCatalog', id: actor.id }, result: { success: true } }).catch(() => {});
      return NextResponse.json(summary);
    } catch (err) {
      captureApiError(err, { route: 'admin/coursera/seed-canonical-mappings-from-catalog' });
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : 'Seed canonical mappings failed',
        },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error('/admin/coursera/seed-canonical-mappings-from-catalog:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withApiGuc(_POST);
