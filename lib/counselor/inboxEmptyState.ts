import type { KitEmptyKind } from '@/components/portal/kit/KitEmptyState';
import type { KitTone } from '@/components/portal/kit/tokens';

/**
 * Counselor empty-state routes and kinds (KIT_GUIDE §6). The sentences live in
 * messages/*.json under `empty.counselor.*` (Inbox zero still reads
 * `counselor.inboxZero*`); this module only fixes the situation (`kind`), the
 * tone override and the routes the CTAs point at, so pages and their proofs
 * agree on both without re-deriving them.
 */
export const COUNSELOR_INBOX_ZERO_EMPTY = {
  title: 'Inbox zero',
  description:
    'No assigned members need attention today. Dismissed members stay hidden until tomorrow.',
  primaryCta: 'Open messages',
  secondaryCta: 'Back to dashboard',
  primaryHref: '/counselor/messages',
  secondaryHref: '/counselor',
} as const;

/** Routes counselor empty states point at — every one is an app route that exists. */
export const COUNSELOR_EMPTY_ROUTES = {
  today: '/counselor',
  guide: '/counselor/guide',
  resources: '/counselor/resources',
  students: '/counselor/students',
  messages: '/counselor/messages',
  inboxZero: '/counselor/inbox',
  workQueue: '/counselor/queue',
  adminMembers: '/admin/members',
} as const;

/**
 * Roster with nothing to list. Both are `unavailable`: the counselor cannot
 * create assignments, and an admin without a counselor row never has any.
 */
export const COUNSELOR_ROSTER_EMPTY = {
  unassigned: {
    kind: 'unavailable',
    tone: 'info',
    primaryHref: COUNSELOR_EMPTY_ROUTES.guide,
    secondaryHref: COUNSELOR_EMPTY_ROUTES.resources,
  },
  noCounselorRecord: {
    kind: 'unavailable',
    tone: 'info',
    primaryHref: COUNSELOR_EMPTY_ROUTES.adminMembers,
  },
} as const satisfies Record<string, { kind: KitEmptyKind; tone: KitTone; primaryHref: string; secondaryHref?: string }>;

/** Messages inbox with no assigned members — same situation as the roster, same routes. */
export const COUNSELOR_MESSAGES_NO_MEMBERS_EMPTY = {
  kind: 'unavailable',
  tone: 'info',
  primaryHref: COUNSELOR_EMPTY_ROUTES.guide,
  secondaryHref: COUNSELOR_EMPTY_ROUTES.today,
} as const satisfies { kind: KitEmptyKind; tone: KitTone; primaryHref: string; secondaryHref: string };

/** Messages inbox where the search / filter matched nothing — rows exist. */
export const COUNSELOR_MESSAGES_FILTER_EMPTY = {
  kind: 'filtered',
} as const satisfies { kind: KitEmptyKind };
