-- Durable, independently owned external effects for member Storage,
-- notifications, and email. Each operation has its own row, so sibling effects do not
-- exclude one another. A User cannot be hard-deleted with an unresolved row.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS public.member_external_effect_claims (
  id UUID PRIMARY KEY,
  member_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('storage', 'notification', 'email')),
  status TEXT NOT NULL DEFAULT 'in_flight' CHECK (status IN ('in_flight', 'needs_reconciliation')),
  reason TEXT,
  provider_idempotency_key TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Prisma @updatedAt supplies this on create and update; no DB default.
  updated_at TIMESTAMP(3) NOT NULL,
  CONSTRAINT member_external_effect_claims_email_key_check
    CHECK (kind <> 'email' OR NULLIF(BTRIM(provider_idempotency_key), '') IS NOT NULL),
  CONSTRAINT member_external_effect_claims_member_id_fkey
    FOREIGN KEY (member_id) REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS member_external_effect_claims_member_id_idx
  ON public.member_external_effect_claims(member_id);

-- Existing Supabase default privileges can grant new public tables to browser
-- roles; this ledger is server-only and has no Data API access or RLS policy.
ALTER TABLE public.member_external_effect_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.member_external_effect_claims FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.member_external_effect_claims FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.member_external_effect_claims FROM authenticated;
  END IF;
END $$;

COMMIT;
