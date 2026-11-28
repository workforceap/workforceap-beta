import 'server-only';
import { getClientIpFromRequest } from '@/lib/http/clientIp';

import type { Prisma } from '@prisma/client';
import type { NextRequest } from 'next/server';
import { withAuthGuc } from '@/lib/auth/server';
import { getGucContext } from '@/lib/db/gucContext';
import { prisma } from '@/lib/db/prisma';

const XAPI_HOMEPAGE =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || 'https://www.workforceap.org';

const ADL_VERBS: Record<string, string> = {
  approved: 'http://adlnet.gov/expapi/verbs/approved',
  deleted: 'http://adlnet.gov/expapi/verbs/deleted',
  voided: 'http://adlnet.gov/expapi/verbs/voided',
  completed: 'http://adlnet.gov/expapi/verbs/completed',
  experienced: 'http://adlnet.gov/expapi/verbs/experienced',
  launched: 'http://adlnet.gov/expapi/verbs/launched',
};

export type AuditActor = {
  id: string;
  role?: string;
};

export type AuditObject = {
  type: string;
  id: string;
};

export type AuditResult = {
  success?: boolean;
  extensions?: Record<string, unknown>;
};

export type AuditRequestMeta = {
  ip?: string | null;
  ua?: string | null;
};

export type XapiAuditStatement = {
  actor: {
    account: {
      homePage: string;
      name: string;
    };
  };
  verb: {
    id: string;
  };
  object: {
    id: string;
    definition?: {
      type?: string;
    };
  };
  result?: {
    success?: boolean;
    extensions?: Record<string, unknown>;
  };
};

export function resolveVerbId(verb: string): string {
  if (verb.startsWith('http://') || verb.startsWith('https://')) return verb;
  const adl = ADL_VERBS[verb.toLowerCase()];
  if (adl) return adl;
  return `${XAPI_HOMEPAGE}/xapi/verbs/${verb}`;
}

export function buildObjectIri(objectType: string, objectId: string): string {
  const segment = objectType.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  return `${XAPI_HOMEPAGE}/admin/${segment}/${objectId}`;
}

export function buildActivityType(objectType: string): string {
  const segment = objectType.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  return `${XAPI_HOMEPAGE}/xapi/activities/${segment}`;
}

export function buildXapiStatement(options: {
  actor: AuditActor;
  verb: string;
  object: AuditObject;
  result?: AuditResult;
}): XapiAuditStatement {
  const verbId = resolveVerbId(options.verb);
  const statement: XapiAuditStatement = {
    actor: {
      account: {
        homePage: XAPI_HOMEPAGE,
        name: options.actor.id,
      },
    },
    verb: { id: verbId },
    object: {
      id: buildObjectIri(options.object.type, options.object.id),
      definition: {
        type: buildActivityType(options.object.type),
      },
    },
  };

  if (options.result !== undefined) {
    statement.result = {
      success: options.result.success ?? true,
      ...(options.result.extensions ? { extensions: options.result.extensions } : {}),
    };
  }

  return statement;
}

/** Trusted client IP for audit rows; null when no trusted proxy header is present. */
function trustedAuditIp(request: Request | NextRequest): string | null {
  const ip = getClientIpFromRequest(request);
  return ip === 'unknown' ? null : ip;
}

export function auditRequestMeta(request?: Request | NextRequest): AuditRequestMeta {
  if (!request) return {};
  return {
    ip: trustedAuditIp(request),
    ua: request.headers.get('user-agent'),
  };
}

/**
 * Persist an xAPI-shaped admin audit event. Writes through `withAuthGuc` so RLS
 * policies on `audit_events` see the actor's org/role.
 */
export async function logAuditEvent(params: {
  user: AuditActor;
  verb: string;
  object: AuditObject;
  result?: AuditResult;
  request?: AuditRequestMeta;
  orgId?: string | null;
}): Promise<void> {
  const ctx = getGucContext();
  const orgId = params.orgId ?? ctx?.orgId ?? null;
  if (!orgId) {
    console.warn('[audit] logAuditEvent skipped: missing orgId', {
      verb: params.verb,
      object: params.object,
    });
    return;
  }

  const actorRole = params.user.role ?? ctx?.role ?? 'anonymous';
  const verbId = resolveVerbId(params.verb);
  const statement = buildXapiStatement({
    actor: { ...params.user, role: actorRole },
    verb: params.verb,
    object: params.object,
    result: params.result,
  });

  await withAuthGuc(async () => {
    await prisma.auditEvent.create({
      data: {
        actorUserId: params.user.id,
        actorRole,
        verb: verbId,
        objectType: params.object.type,
        objectId: params.object.id,
        orgId,
        statementJson: statement as Prisma.InputJsonValue,
        ip: params.request?.ip ?? null,
        ua: params.request?.ua ?? null,
      },
    });
  });
}
