-- WAP-169: audit_events.actor_user_id was NOT NULL + ON DELETE RESTRICT, so any
-- member with a row in the admin audit trail could never be hard-purged after
-- the 30-day soft-delete window, and one such account failed the whole batch.
-- audit_logs already uses ON DELETE SET NULL with actor snapshots; audit_events
-- keeps the actor id inside statement_json.actor.account.name, so the row
-- stays attributable after the FK is nulled. No rows are rewritten.
ALTER TABLE "audit_events" ALTER COLUMN "actor_user_id" DROP NOT NULL;
ALTER TABLE "audit_events" DROP CONSTRAINT IF EXISTS "audit_events_actor_user_id_fkey";
ALTER TABLE "audit_events"
  ADD CONSTRAINT "audit_events_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
