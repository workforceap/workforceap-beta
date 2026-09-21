/**
 * `at_risk_alerts.status` values that mean a saved case is still open.
 * Shared by the persisted at-risk loader and every count that must agree
 * with it (Command Center KPI, counselor roster, at-risk API). Kept free of
 * server-only imports so pure helpers and their node:test specs can use it.
 */
export const ACTIVE_AT_RISK_STATUSES = ['open', 'acknowledged', 'escalated'] as const;
