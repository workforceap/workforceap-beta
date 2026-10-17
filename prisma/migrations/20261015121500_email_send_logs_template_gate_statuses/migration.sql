-- WAP-304 template send reuses email_send_logs for a per-student gate
-- (gate_busy / gate_idle, recipient_count 0) and a reserved attempt row
-- before provider egress. The 2026-09-20 delivery-audit CHECK only allowed
-- skipped|sending|sent|failed and recipient_count >= 1, so every migrated
-- send 503'd on the first insert.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
ALTER TABLE "email_send_logs" DROP CONSTRAINT IF EXISTS "email_send_logs_status_check";
ALTER TABLE "email_send_logs" ADD CONSTRAINT "email_send_logs_status_check"
  CHECK ("status" IN ('skipped', 'sending', 'sent', 'failed', 'reserved', 'gate_busy', 'gate_idle'));
ALTER TABLE "email_send_logs" DROP CONSTRAINT IF EXISTS "email_send_logs_recipient_count_check";
ALTER TABLE "email_send_logs" ADD CONSTRAINT "email_send_logs_recipient_count_check"
  CHECK ("recipient_count" >= 0);
COMMIT;
