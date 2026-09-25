/**
 * URL filters for the default /admin/feedback kit view (WAP-193 slice 2).
 * They used to exist only in the ?ui=legacy client (AdminFeedbackClient).
 * Pure: parse the search params, build the Prisma `where` and the page links.
 * The page adds the actor's tenant/counselor scope on top.
 */

export const FEEDBACK_TYPES = ['training', 'counselor', 'platform', 'program', 'general'] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export const FEEDBACK_PAGE_SIZE = 50;

export type FeedbackFilters = {
  type: FeedbackType | null;
  rating: number | null;
  /** Inclusive UTC calendar days, `YYYY-MM-DD`. */
  from: string | null;
  to: string | null;
  page: number;
};

type SearchParamsLike = Record<string, string | string[] | undefined>;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
}

function validDay(value: string): string | null {
  if (!DAY.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

/** Unknown or malformed values are dropped, never an error. */
export function parseFeedbackFilters(params: SearchParamsLike): FeedbackFilters {
  const type = first(params.type);
  const rating = Number(first(params.rating));
  const page = Number(first(params.page));
  return {
    type: (FEEDBACK_TYPES as readonly string[]).includes(type) ? (type as FeedbackType) : null,
    rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null,
    from: validDay(first(params.from)),
    to: validDay(first(params.to)),
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/** Prisma `where` for the filters (without the actor scope). `to` covers its whole day. */
export function feedbackFilterWhere(filters: FeedbackFilters) {
  const createdAt = {
    ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00.000Z`) } : {}),
    ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999Z`) } : {}),
  };
  return {
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.rating ? { rating: filters.rating } : {}),
    ...(filters.from || filters.to ? { createdAt } : {}),
  };
}

export function hasFeedbackFilters(filters: FeedbackFilters): boolean {
  return Boolean(filters.type || filters.rating || filters.from || filters.to);
}

/** `/admin/feedback?…` keeping the filters, for page `page` (page 1 omits it). */
export function feedbackPageHref(filters: FeedbackFilters, page: number): string {
  const query = new URLSearchParams({
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.rating ? { rating: String(filters.rating) } : {}),
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {}),
    ...(page > 1 ? { page: String(page) } : {}),
  }).toString();
  return query ? `/admin/feedback?${query}` : '/admin/feedback';
}
