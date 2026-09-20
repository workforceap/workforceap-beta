-- WAP-20: a self-reported certification must not count as a verified
-- credential. New rows default to `pending` and enter the admin review queue.
-- Existing rows are not rewritten: the two `approved` rows in production
-- (2026-09-18 measurement) are left for a staff decision.
ALTER TABLE "user_certifications" ALTER COLUMN "status" SET DEFAULT 'pending';
