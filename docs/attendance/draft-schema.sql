-- DRAFT ONLY — NOT APPLIED. Not a Prisma migration. Do not run against shared or live databases.
-- Attendance schema design artifact for Rigel review. Owner: Lin. Acceptance: Ada.
-- Rollback: drop these tables only if no retained objects exist; never drop a restrictive
-- storage policy after any attendance object has been stored.

CREATE TABLE attendance_sheet (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  member_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('weekly', 'monthly', 'yearly')),
  selected_date date NOT NULL,
  reporting_timezone text NOT NULL DEFAULT 'America/Chicago',
  current_revision uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, member_id, enrollment_id, kind, selected_date)
);

CREATE TABLE attendance_evidence_revision (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  member_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  source_key text NOT NULL,
  evidence_date date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('verified-duration', 'estimated', 'W', 'CR', 'A')),
  minutes integer CHECK (minutes IS NULL OR (minutes >= 0 AND minutes <= 1440)),
  reference text NOT NULL,
  reason text NOT NULL,
  verified_by uuid,
  content_sha256 text NOT NULL,
  supersedes_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE attendance_snapshot (
  revision_id uuid PRIMARY KEY,
  sheet_id uuid NOT NULL REFERENCES attendance_sheet (id),
  schema_version integer NOT NULL,
  canonical_json jsonb NOT NULL,
  snapshot_sha256 text NOT NULL,
  rule_version text NOT NULL,
  template_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE attendance_sheet ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_evidence_revision ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_snapshot ENABLE ROW LEVEL SECURITY;
-- No policies granted here. Direct table access stays revoked until a reviewed migration.
