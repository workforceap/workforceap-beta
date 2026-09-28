import messages from '@/messages/en.json';

/**
 * WorkforceAP's mission statement, from `mission.*` in messages/*.json, for
 * surfaces outside next-intl (the partner invitation email is English-only).
 * Pages read the same keys with `getTranslations('mission')`. Server-only use:
 * importing this in a client component would bundle en.json.
 */
export const MISSION_HEADING: string = messages.mission.heading;
export const MISSION_STATEMENT: string = messages.mission.statement;
