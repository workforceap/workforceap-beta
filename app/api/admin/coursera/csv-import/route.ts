import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/server';
import { isAdmin } from '@/lib/auth/roles';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import {
  detectCourseraCsvKind,
  parseCourseActivityCsv,
  parseLearningPathActivityCsv,
} from '@/lib/coursera/csvImport';
import {
  ingestCourseActivityRows,
  ingestLearningPathActivityRows,
} from '@/lib/coursera/csvImport.server';
import { withApiGuc } from '@/lib/db/withRequestGuc';
import { auditLog } from '@/lib/audit';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/** Ingest failures (Prisma, mapping helpers) keep their text in the server log. */
const INGEST_FAILED = 'Unable to import the Coursera CSV right now. Please try again in a few minutes.';

export const runtime = 'nodejs';

async function requireAdminUser() {
  const user = await getUser();
  if (!user || !(await isAdmin(user.id))) return null;
  return user;
}

async function readCsvFromRequest(request: NextRequest): Promise<{ content: string; filename: string | null } | { error: string; status: number }> {
  const contentType = request.headers.get('content-type') || '';

  // Cheap pre-flight on Content-Length when present.
  const declaredLength = Number(request.headers.get('content-length') || '0');
  if (declaredLength && declaredLength > MAX_BYTES) {
    return { error: 'CSV exceeds 5 MB limit', status: 413 };
  }

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const entry = form.get('csv') ?? form.get('file');
    if (!entry || typeof entry === 'string') {
      return { error: 'Expected a file upload in the "csv" form field', status: 400 };
    }
    const file = entry as File;
    if (file.size > MAX_BYTES) {
      return { error: 'CSV exceeds 5 MB limit', status: 413 };
    }
    const content = await file.text();
    return { content, filename: file.name || null };
  }

  if (contentType.includes('text/csv') || contentType.includes('text/plain')) {
    const buffer = await request.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) {
      return { error: 'CSV exceeds 5 MB limit', status: 413 };
    }
    return { content: new TextDecoder('utf-8').decode(buffer), filename: null };
  }

  return {
    error: 'Unsupported Content-Type. Send multipart/form-data with a "csv" file field, or raw text/csv.',
    status: 415,
  };
}

async function _POST(request: NextRequest) {
  try {
    const user = await requireAdminUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const organizationId = await getActorOrganizationId(user.id);

    const read = await readCsvFromRequest(request);
    if ('error' in read) {
      return NextResponse.json({ error: read.error }, { status: read.status });
    }
  
    // Auto-detect CSV type from the header row so admins don't have to pick.
    // Existing CourseActivity behaviour is preserved (was the only supported
    // format before this PR); LearningPathActivity is the new sibling.
    const kind = detectCourseraCsvKind(read.content);
    if (!kind) {
      return NextResponse.json(
        {
          error:
            'Could not detect CSV type. Expected a CourseActivity or LearningPathActivity export from the Coursera enterprise ZIP.',
        },
        { status: 400 }
      );
    }
  
    if (kind === 'course-activity') {
      let parsedRows;
      try {
        parsedRows = parseCourseActivityCsv(read.content);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to parse CSV';
        return NextResponse.json({ error: message }, { status: 400 });
      }
  
      if (parsedRows.length === 0) {
        return NextResponse.json(
          {
            error:
              'No valid rows found in CSV (expected at least one row with email + course id + program slug).',
          },
          { status: 400 }
        );
      }
  
      try {
        const result = await ingestCourseActivityRows(parsedRows, { source: 'csv_import', organizationId });
        void auditLog({
          actorUserId: user.id,
          action: 'admin_coursera_csv_import',
          targetType: 'organization',
          targetId: organizationId,
          metadata: { kind, filename: read.filename, parsed: parsedRows.length, ...summarizeIngest(result) },
        }).catch(() => {});
        return NextResponse.json({
          ok: true,
          kind,
          filename: read.filename,
          parsed: parsedRows.length,
          ...result,
        });
      } catch (error) {
        console.error('[admin/coursera/csv-import] course-activity ingest failed:', error);
        return NextResponse.json({ error: INGEST_FAILED }, { status: 500 });
      }
    }
  
    // kind === 'learning-path-activity'
    let parsedBadgeRows;
    try {
      parsedBadgeRows = parseLearningPathActivityCsv(read.content);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to parse CSV';
      return NextResponse.json({ error: message }, { status: 400 });
    }
  
    if (parsedBadgeRows.length === 0) {
      return NextResponse.json(
        {
          error:
            'No valid rows found in CSV (expected at least one row with email + badge slug + badge title).',
        },
        { status: 400 }
      );
    }
  
    try {
      const result = await ingestLearningPathActivityRows(parsedBadgeRows, { source: 'csv_import', organizationId });
      void auditLog({
        actorUserId: user.id,
        action: 'admin_coursera_csv_import',
        targetType: 'organization',
        targetId: organizationId,
        metadata: { kind, filename: read.filename, parsed: parsedBadgeRows.length, ...summarizeIngest(result) },
      }).catch(() => {});
      return NextResponse.json({
        ok: true,
        kind,
        filename: read.filename,
        parsed: parsedBadgeRows.length,
        ...result,
      });
    } catch (error) {
      console.error('[admin/coursera/csv-import] learning-path ingest failed:', error);
      return NextResponse.json({ error: INGEST_FAILED }, { status: 500 });
    }
  } catch (error) {
    console.error('/admin/coursera/csv-import:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Numeric ingest counters only — never row contents (learner emails). */
function summarizeIngest(result: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'number') out[key] = value;
  }
  return out;
}

export const POST = withApiGuc(_POST);
