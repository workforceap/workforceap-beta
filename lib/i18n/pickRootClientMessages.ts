import type { AbstractIntlMessages } from 'next-intl';

type MsgRecord = Record<string, unknown>;

/** Chrome used by MainNav, Footer, LanguageToggle, and shared form strings. */
export const ROOT_CHROME_NAMESPACES = ['nav', 'cta', 'footer', 'form', 'common'] as const;

/**
 * Marketing keys read by client `useTranslations` under the root provider.
 * Server `getTranslations('marketing.*')` stays server-side and is omitted.
 */
export const ROOT_MARKETING_CLIENT_KEYS = ['programs', 'testimonials', 'careers'] as const;

/** Member + staff portal namespaces used by client components under `(portal)`. */
export const PORTAL_CLIENT_NAMESPACES = [
  'dashboard',
  'profile',
  'jobs',
  'workspace',
  'courseraProgress',
  'partner',
  'group',
  'counselor',
  'employer',
  'journeyGuide',
  'resumeStudio',
  'trainingBridge',
  'benefitsCliff',
  'goals',
  'coach',
  'first90',
  // components/portal/WioaQualificationClient — /dashboard/learning/wioa-qualification
  // and /dev/member/wioa-qualification render it under the portal provider.
  'wioa',
] as const;

/**
 * Public WIOA screening (`/wioa-qualification`) renders the same client
 * component under the root marketing layout. The catalog is ~6.5KB, so it
 * attaches in `app/wioa-qualification/layout.tsx` (like `app/invite/layout.tsx`
 * does for `auth`) instead of riding on every marketing HTML response.
 */
export const WIOA_CLIENT_NAMESPACES = ['wioa'] as const;

/**
 * `dashboard.*` keys read by `components/portal/MemberProgressStrip`, which the
 * admin member pages (`/admin/members/[id]`, `/stakeholder`) render under the
 * admin layout. The full `dashboard` namespace is ~22KB, so the admin slice
 * ships only these keys instead of the whole catalog.
 */
export const ADMIN_DASHBOARD_CLIENT_KEYS = [
  'memberJourneyProgress',
  'progressIntake',
  'progressAssessment',
  'progressTraining',
  'progressCerts',
  'progressEmployed',
  'stepComplete',
  'stepInProgress',
  'stepUpcoming',
] as const;

export type ClientMessageSlice = 'root' | 'portal' | 'admin' | 'apply' | 'auth' | 'wioa';

function pickNamespaces(messages: MsgRecord, keys: readonly string[]): MsgRecord {
  const out: MsgRecord = {};
  for (const key of keys) {
    if (messages[key] !== undefined) {
      out[key] = messages[key];
    }
  }
  return out;
}

function pickAdminDashboardClientSlice(messages: MsgRecord): MsgRecord | undefined {
  const dashboard = messages.dashboard as MsgRecord | undefined;
  if (!dashboard) return undefined;
  const slice = pickNamespaces(dashboard, ADMIN_DASHBOARD_CLIENT_KEYS);
  return Object.keys(slice).length > 0 ? slice : undefined;
}

function pickMarketingClientSlice(messages: MsgRecord): MsgRecord | undefined {
  const mk = messages.marketing as MsgRecord | undefined;
  if (!mk) return undefined;
  const slice: MsgRecord = {};
  for (const key of ROOT_MARKETING_CLIENT_KEYS) {
    if (mk[key] !== undefined) {
      slice[key] = mk[key];
    }
  }
  return Object.keys(slice).length > 0 ? slice : undefined;
}

/**
 * Root-layout client payload: chrome + marketing client keys + tiny find-your-path.
 * Portal / admin / apply / auth catalogs attach in those route-group layouts so a
 * marketing HTML response does not serialize `admin.*` / `dashboard.*` / `apply.*`.
 */
export function pickRootClientMessages(messages: AbstractIntlMessages): AbstractIntlMessages {
  return pickClientMessageSlice(messages, 'root');
}

export function pickPortalClientMessages(messages: AbstractIntlMessages): AbstractIntlMessages {
  return pickClientMessageSlice(messages, 'portal');
}

export function pickAdminClientMessages(messages: AbstractIntlMessages): AbstractIntlMessages {
  return pickClientMessageSlice(messages, 'admin');
}

export function pickApplyClientMessages(messages: AbstractIntlMessages): AbstractIntlMessages {
  return pickClientMessageSlice(messages, 'apply');
}

export function pickAuthClientMessages(messages: AbstractIntlMessages): AbstractIntlMessages {
  return pickClientMessageSlice(messages, 'auth');
}

export function pickWioaClientMessages(messages: AbstractIntlMessages): AbstractIntlMessages {
  return pickClientMessageSlice(messages, 'wioa');
}

export function pickClientMessageSlice(
  messages: AbstractIntlMessages,
  slice: ClientMessageSlice,
): AbstractIntlMessages {
  const m = messages as MsgRecord;
  const out = pickNamespaces(m, ROOT_CHROME_NAMESPACES);

  switch (slice) {
    case 'root': {
      if (m.cookieConsent !== undefined) out.cookieConsent = m.cookieConsent;
      const marketing = pickMarketingClientSlice(m);
      if (marketing) out.marketing = marketing;
      if (m.findYourPath !== undefined) out.findYourPath = m.findYourPath;
      break;
    }
    case 'portal':
      Object.assign(out, pickNamespaces(m, PORTAL_CLIENT_NAMESPACES));
      break;
    case 'admin':
      // AdminPortalShell uses the shared WorkspaceShell label namespaces too.
      Object.assign(out, pickNamespaces(m, ['admin', 'courseraProgress', 'workspace', 'group']));
      {
        const dashboard = pickAdminDashboardClientSlice(m);
        if (dashboard) out.dashboard = dashboard;
      }
      break;
    case 'apply':
      Object.assign(out, pickNamespaces(m, ['apply']));
      break;
    case 'auth':
      Object.assign(out, pickNamespaces(m, ['auth']));
      break;
    case 'wioa':
      Object.assign(out, pickNamespaces(m, WIOA_CLIENT_NAMESPACES));
      break;
    default: {
      const _exhaustive: never = slice;
      throw new Error(`Unhandled client message slice: ${String(_exhaustive)}`);
    }
  }

  return out as AbstractIntlMessages;
}

/** UTF-8 JSON bytes — what NextIntlClientProvider serializes into the RSC payload. */
export function clientMessagesBytes(messages: AbstractIntlMessages): number {
  return Buffer.byteLength(JSON.stringify(messages), 'utf8');
}

/** @deprecated kept for tests that compare the pre-slice union picker. */
export function pickLegacyFatRootClientMessages(
  messages: AbstractIntlMessages,
): AbstractIntlMessages {
  const m = messages as MsgRecord;
  const mk = m.marketing as MsgRecord | undefined;
  const out: MsgRecord = {
    ...pickNamespaces(m, [
      ...ROOT_CHROME_NAMESPACES,
      'auth',
      'dashboard',
      'messages',
      'profile',
      'jobs',
      'workspace',
      'courseraProgress',
      'partner',
      'group',
      'apply',
      'admin',
      'findYourPath',
      'counselor',
      'employer',
      'journeyGuide',
      'resumeStudio',
      'trainingBridge',
      'benefitsCliff',
      'goals',
      'coach',
      'first90',
    ]),
  };
  if (mk && mk.programs !== undefined) {
    out.marketing = { programs: mk.programs };
  }
  return out as AbstractIntlMessages;
}
