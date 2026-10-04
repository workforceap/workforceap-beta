import type { Prisma, PrismaClient } from '@prisma/client';
import { runWithGucContext, type GucContext } from '../../lib/db/gucContext';

/**
 * The rehearsal deliberately uses a bare PrismaClient, not lib/db/prisma.
 * AsyncLocalStorage alone cannot set PostgreSQL's connection-local state.
 * Bind all five persona values on the transaction connection before any query.
 */
export function runWithForceRlsContext<T>(
  client: PrismaClient,
  context: GucContext,
  query: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return runWithGucContext(context, () =>
    client.$transaction(async (tx) => {
      // Tagged raw queries bind values as parameters. Always set optional IDs
      // too, so an omitted employer/partner cannot inherit session state.
      await tx.$executeRaw`
        SELECT set_config('app.current_user_id', ${context.userId ?? ''}, true),
               set_config('app.current_org_id', ${context.orgId ?? ''}, true),
               set_config('app.current_role', ${context.role}, true),
               set_config('app.current_employer_id', ${context.employerId ?? ''}, true),
               set_config('app.current_partner_id', ${context.partnerId ?? ''}, true)
      `;
      return query(tx);
    }),
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * A rejected mutation proves RLS only when PostgreSQL reports a row-security
 * denial. 42501 alone also covers missing table grants. Generic Prisma
 * constraints and row_security=off errors cannot prove a policy rejected a row.
 */
export function isForceRlsDenial(error: unknown): boolean {
  const detail = asRecord(error);
  if (!detail) return false;
  const meta = asRecord(detail.meta);
  const message = typeof detail.message === 'string' ? detail.message : '';
  const databaseDetail = asRecord(meta?.database_error);
  const databaseError = typeof meta?.database_error === 'string'
    ? meta.database_error
    : typeof databaseDetail?.message === 'string' ? databaseDetail.message : '';
  const metaMessage = typeof meta?.message === 'string' ? meta.message : '';
  const diagnostic = [message, databaseError, metaMessage].join('\n').replace(/\\"/g, '"');
  const reportsRowSecurity = /new row violates row-level security policy(?: "[^"]+")?(?: \(USING expression\))? for table\b/i.test(diagnostic);
  if (!reportsRowSecurity) return false;

  // Raw Prisma failures carry the SQLSTATE in meta.code. Model mutations in
  // Prisma 5 may surface it inside a PostgresError in an UnknownRequestError,
  // which preserves both the SQLSTATE and canonical row rejection wording.
  return detail.code === '42501'
    || meta?.code === '42501'
    || databaseDetail?.code === '42501'
    // Some Prisma constraint translations omit SQLSTATE but retain the
    // canonical PostgreSQL row-security diagnostic in database_error.
    || (detail.code === 'P2004' && /new row violates row-level security policy(?: "[^"]+")?(?: \(USING expression\))? for table\b/i.test(databaseError.replace(/\\"/g, '"')))
    || /\bPostgresError\s*\{\s*code:\s*"42501"\s*,/i.test(diagnostic);
}
