-- No-account inquiry durability. Additive only; apply before deploying API handlers.
-- Bodies and notification state expire together under PUBLIC_LEAD_RETENTION_DAYS (180).
BEGIN;
CREATE TABLE public.public_inquiries (
  id TEXT NOT NULL PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE ON UPDATE CASCADE,
  submission_key VARCHAR(100) NOT NULL,
  payload_hash VARCHAR(64) NOT NULL,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('contact', 'sponsorship', 'careers')),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL,
  phone VARCHAR(80),
  topic VARCHAR(200) NOT NULL,
  message VARCHAR(10000) NOT NULL,
  organization_name VARCHAR(200),
  interest_area VARCHAR(200),
  role_title VARCHAR(200),
  seats INTEGER CHECK (seats IS NULL OR seats BETWEEN 1 AND 100000),
  sms_preferred BOOLEAN NOT NULL DEFAULT false,
  notification_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (notification_status IN ('pending', 'accepted', 'failed', 'unavailable')),
  notification_attempts INTEGER NOT NULL DEFAULT 0 CHECK (notification_attempts >= 0),
  notification_attempted_at TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX public_inquiries_organization_id_submission_key_key ON public.public_inquiries(organization_id, submission_key);
CREATE INDEX public_inquiries_organization_id_created_at_idx ON public.public_inquiries(organization_id, created_at);
CREATE INDEX public_inquiries_created_at_idx ON public.public_inquiries(created_at);

-- Server-only: public API handlers validate/rate-limit/CAPTCHA before table-owner
-- Prisma writes; admin readers use tenant-scoped server queries. No browser path.
ALTER TABLE public.public_inquiries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.public_inquiries FROM PUBLIC;
DO $$
DECLARE api_role TEXT;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.public_inquiries FROM %I', api_role);
    END IF;
  END LOOP;
END $$;
COMMIT;
