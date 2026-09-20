/** Prisma/client-free mirrors of DB enums — safe for `'use client'` bundles. */

export const JOB_APPLICATION_STATUS = [
  "SAVED",
  "APPLIED",
  "PHONE_SCREEN",
  "INTERVIEWING",
  "OFFER",
  "ACCEPTED",
  "REJECTED",
] as const;

export type JobApplicationStatus = (typeof JOB_APPLICATION_STATUS)[number];

export const JobApplicationStatusMembers = Object.freeze(
  Object.fromEntries(
    JOB_APPLICATION_STATUS.map((status) => [status, status]),
  ) as { [K in JobApplicationStatus]: K },
);

export const JOB_APPLICATION_SOURCE = [
  "INDEED",
  "LINKEDIN",
  "DIRECT",
  "OTHER",
] as const;

export type JobApplicationSource = (typeof JOB_APPLICATION_SOURCE)[number];

export const JobApplicationSourceMembers = Object.freeze(
  Object.fromEntries(
    JOB_APPLICATION_SOURCE.map((source) => [source, source]),
  ) as { [K in JobApplicationSource]: K },
);

