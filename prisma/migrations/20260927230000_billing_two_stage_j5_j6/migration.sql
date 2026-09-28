-- Two-stage J5 quote/voucher request + J6 invoice/voucher cover letter
-- (docs/BILLING-PACKETS.md "Two-stage J5/J6"). Mike Brown, 2026-09-27.
--
-- Purely additive: nine new tables, their constraints, triggers and grants.
-- training_billing_packets (20260904020000) is not touched, so an older app
-- revision still inserting legacy packets keeps working during the
-- Vercel migrate/build overlap, and existing packet rows are preserved.
--
-- File bytes live in a private Supabase Storage finance bucket
-- (BILLING_FINANCE_BUCKET, default billing-finance; its creation and policies
-- are a separate, reviewed slice, not this migration). lib/gdpr/deleteUserStorage.ts
-- never traverses it; billing_artifacts holds the content-addressed key, size
-- and SHA-256 of each immutable object.
--
-- Retained finance archive: account erasure detaches billing_cases.member_id
-- (ON DELETE SET NULL) and keeps subject_member_id; every other actor column
-- is a historical subject id with no FK. Nothing here cascades from users.
--
-- Browser roles: every new table enables RLS (no policies) and revokes all
-- privileges from PUBLIC, anon and authenticated in this same transaction,
-- so Supabase's default ALL grants (incl. TRUNCATE, which RLS does not
-- guard) never take effect. The anon/authenticated revokes are skipped on a
-- plain PostgreSQL without those roles.
--
-- Every CHECK is wrapped in coalesce(..., false) so a NULL can never pass it.
--
-- Idempotent (IF NOT EXISTS / OR REPLACE / DROP IF EXISTS) so the disposable
-- proof can apply it twice. Proof: tests/migrations/billing-two-stage-j5-j6.mjs.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ------------------------------------------------------------- helpers
-- The business date: WorkforceAP is in Texas. Every "today" guard uses this,
-- never CURRENT_DATE (which follows the session TimeZone).
CREATE OR REPLACE FUNCTION public.billing_chicago_date(ts TIMESTAMPTZ)
RETURNS DATE LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT (ts AT TIME ZONE 'America/Chicago')::date
$$;
CREATE OR REPLACE FUNCTION public.billing_today()
RETURNS DATE LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
  SELECT public.billing_chicago_date(now())
$$;
-- Send-claim statuses and delivery evidence kinds, shared by the CHECKs below
-- and asserted equal to SEND_STATUSES / DELIVERY_EVENT_KINDS in
-- lib/billing/twoStage/sendClaims.ts by the PG16 proof.
-- The calendar date (America/Chicago) of a TIMESTAMP(3) column the app writes in UTC.
CREATE OR REPLACE FUNCTION public.billing_sent_on(sent_at TIMESTAMP)
RETURNS DATE LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public AS $$
  SELECT public.billing_chicago_date(sent_at AT TIME ZONE 'UTC')
$$;

-- Recipient normalization shared with lib/billing/twoStage/recipients.ts
-- (normalizeEmail / normalizeRecipientName; the PG16 proof checks parity):
-- trim ASCII whitespace (space, tab, LF, VT, FF, CR); email lowercased; runs
-- of whitespace inside a name collapsed to one space.
CREATE OR REPLACE FUNCTION public.billing_normalize_email(value TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT lower(regexp_replace(value, '^[ \t\n\v\f\r]+|[ \t\n\v\f\r]+$', '', 'g'))
$$;
CREATE OR REPLACE FUNCTION public.billing_normalize_name(value TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT regexp_replace(regexp_replace(value, '^[ \t\n\v\f\r]+|[ \t\n\v\f\r]+$', '', 'g'), '[ \t\n\v\f\r]+', ' ', 'g')
$$;

CREATE OR REPLACE FUNCTION public.billing_send_statuses()
RETURNS TEXT[] LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT ARRAY['pending', 'provider_accepted', 'ambiguous', 'needs_reconciliation', 'failed', 'reconciled_delivered', 'reconciled_failed']::TEXT[]
$$;
CREATE OR REPLACE FUNCTION public.billing_delivery_event_kinds()
RETURNS TEXT[] LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT ARRAY['delivered', 'bounced', 'complained']::TEXT[]
$$;

-- ---------------------------------------------------------------- cases
CREATE TABLE IF NOT EXISTS "billing_cases" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "member_id" TEXT,
    "subject_member_id" TEXT NOT NULL,
    "program_slug" TEXT NOT NULL,
    "member_merged_from_id" TEXT,
    "member_merged_at" TIMESTAMP(3),
    "created_by_subject_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_cases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "billing_cases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "billing_cases_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "billing_cases_subject_check" CHECK (coalesce((btrim("subject_member_id") <> '' AND btrim("program_slug") <> '' AND btrim("created_by_subject_id") <> ''), false)),
    -- member_id is the current live account: the original subject, the survivor
    -- of a recorded member merge (billing_case_identity_guard), or NULL after
    -- erasure. subject_member_id never changes.
    CONSTRAINT "billing_cases_member_check" CHECK (coalesce((
      ("member_merged_at" IS NULL AND "member_merged_from_id" IS NULL AND ("member_id" IS NULL OR "member_id" = "subject_member_id"))
      OR ("member_merged_at" IS NOT NULL AND btrim(coalesce("member_merged_from_id", '')) <> '')
    ), false))
);
CREATE UNIQUE INDEX IF NOT EXISTS "billing_cases_id_organization_id_key" ON "billing_cases"("id", "organization_id");
CREATE INDEX IF NOT EXISTS "billing_cases_organization_id_subject_member_id_created_at_idx" ON "billing_cases"("organization_id", "subject_member_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "billing_cases_member_id_idx" ON "billing_cases"("member_id");

-- ------------------------------------------------------------ artifacts
CREATE TABLE IF NOT EXISTS "billing_artifacts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "byte_length" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "storage_bucket" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "stage_record_id" TEXT,
    "stage" TEXT,
    "stage_version" INTEGER,
    "rendered_content_sha256" CHAR(64),
    "created_by_subject_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_artifacts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "billing_artifacts_case_id_organization_id_fkey" FOREIGN KEY ("case_id", "organization_id") REFERENCES "billing_cases"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "billing_artifacts_kind_check" CHECK (coalesce((
      "mime_type" = 'application/pdf'
      -- A rendered signed PDF is bound to exactly one stage record version and its
      -- frozen content hash (composite FK below); uploads are case-level files.
      AND (("kind" IN ('j5_signed_pdf', 'j6_signed_pdf') AND "source" = 'rendered'
            AND "stage_record_id" IS NOT NULL AND "stage" = left("kind", 2) AND "stage_version" >= 1
            AND "rendered_content_sha256" ~ '^[0-9a-f]{64}$')
        OR ("kind" IN ('board_signed_voucher', 'board_invoice', 'external_j5_copy') AND "source" = 'uploaded'
            AND num_nonnulls("stage_record_id", "stage", "stage_version", "rendered_content_sha256") = 0))
    ), false)),
    -- Bytes live only in the private finance bucket `billing-finance`
    -- (provisioned separately, #2700/#2704) under a server-generated,
    -- content-addressed key; never a member or public bucket, never a member prefix.
    CONSTRAINT "billing_artifacts_storage_check" CHECK (coalesce((
      "byte_length" BETWEEN 1 AND 10485760
      AND "sha256" ~ '^[0-9a-f]{64}$'
      AND "storage_bucket" = 'billing-finance'
      AND "storage_key" = 'cases/' || "case_id" || '/' || CASE "kind"
            WHEN 'j5_signed_pdf' THEN 'j5' WHEN 'j6_signed_pdf' THEN 'j6'
            WHEN 'board_signed_voucher' THEN 'voucher' WHEN 'board_invoice' THEN 'board-invoice'
            WHEN 'external_j5_copy' THEN 'external-j5' END || '/' || "sha256" || '.pdf'
    ), false)),
    CONSTRAINT "billing_artifacts_file_name_check" CHECK (coalesce((btrim("file_name") <> '' AND length("file_name") <= 200), false))
);
CREATE UNIQUE INDEX IF NOT EXISTS "billing_artifacts_id_case_id_key" ON "billing_artifacts"("id", "case_id");
CREATE UNIQUE INDEX IF NOT EXISTS "billing_artifacts_storage_bucket_storage_key_key" ON "billing_artifacts"("storage_bucket", "storage_key");
CREATE INDEX IF NOT EXISTS "billing_artifacts_case_id_kind_created_at_idx" ON "billing_artifacts"("case_id", "kind", "created_at" DESC);

-- --------------------------------------------------------- attestations
CREATE TABLE IF NOT EXISTS "billing_attestations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "evidence_reference" TEXT NOT NULL,
    "class_start_date" DATE,
    "class_end_date" DATE,
    "artifact_id" TEXT,
    "voucher_reference" TEXT,
    "authorized_amount_cents" INTEGER,
    "authorized_start_date" DATE,
    "authorized_end_date" DATE,
    "received_on" DATE,
    "receiving_signature_present" BOOLEAN,
    "external_reference" TEXT,
    "external_quote_date" DATE,
    "quoted_program_slug" TEXT,
    "quoted_class_name" TEXT,
    "authorized_program_slug" TEXT,
    "authorized_class_name" TEXT,
    "student_ready_confirmed" BOOLEAN,
    "counselor_requested_by" TEXT,
    "counselor_requested_on" DATE,
    "counselor_request_reference" TEXT,
    "attested_by_subject_id" TEXT NOT NULL,
    "attested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_attestations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "billing_attestations_case_id_organization_id_fkey" FOREIGN KEY ("case_id", "organization_id") REFERENCES "billing_cases"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "billing_attestations_artifact_id_case_id_fkey" FOREIGN KEY ("artifact_id", "case_id") REFERENCES "billing_artifacts"("id", "case_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "billing_attestations_text_check" CHECK (coalesce((btrim("statement") <> '' AND btrim("evidence_reference") <> '' AND btrim("attested_by_subject_id") <> ''), false)),
    -- Each kind carries exactly its own facts. j5_readiness records two separately
    -- required facts: the student is approved/ready, and the counselor requested
    -- the quote (who, when, reference). The voucher needs Michael's receiving
    -- signature on it. An external quote names the program/class it quoted.
    CONSTRAINT "billing_attestations_kind_check" CHECK (coalesce((
      CASE "kind"
        WHEN 'j5_readiness' THEN "class_start_date" IS NOT NULL
          AND "student_ready_confirmed" IS TRUE
          AND btrim(coalesce("counselor_requested_by", '')) <> '' AND "counselor_requested_on" IS NOT NULL
          AND btrim(coalesce("counselor_request_reference", '')) <> ''
          AND num_nonnulls("class_end_date", "artifact_id", "voucher_reference", "authorized_amount_cents", "authorized_start_date",
                "authorized_end_date", "received_on", "receiving_signature_present", "external_reference", "external_quote_date",
                "quoted_program_slug", "quoted_class_name", "authorized_program_slug", "authorized_class_name") = 0
        WHEN 'class_started' THEN "class_start_date" IS NOT NULL AND "class_end_date" > "class_start_date"
          AND num_nonnulls("artifact_id", "voucher_reference", "authorized_amount_cents", "authorized_start_date",
                "authorized_end_date", "received_on", "receiving_signature_present", "external_reference", "external_quote_date",
                "quoted_program_slug", "quoted_class_name", "student_ready_confirmed", "counselor_requested_by",
                "counselor_requested_on", "counselor_request_reference", "authorized_program_slug", "authorized_class_name") = 0
        WHEN 'voucher_board_signed' THEN "artifact_id" IS NOT NULL AND btrim(coalesce("voucher_reference", '')) <> ''
          AND "authorized_amount_cents" > 0
          AND btrim(coalesce("authorized_program_slug", '')) <> '' AND btrim(coalesce("authorized_class_name", '')) <> ''
          AND "authorized_start_date" IS NOT NULL AND "authorized_end_date" > "authorized_start_date"
          AND "received_on" IS NOT NULL AND "receiving_signature_present" IS TRUE
          AND num_nonnulls("class_start_date", "class_end_date", "external_reference", "external_quote_date",
                "quoted_program_slug", "quoted_class_name", "student_ready_confirmed", "counselor_requested_by",
                "counselor_requested_on", "counselor_request_reference") = 0
        WHEN 'external_j5_reference' THEN btrim(coalesce("external_reference", '')) <> '' AND "external_quote_date" IS NOT NULL
          AND btrim(coalesce("quoted_program_slug", '')) <> '' AND btrim(coalesce("quoted_class_name", '')) <> ''
          AND num_nonnulls("class_start_date", "class_end_date", "voucher_reference", "authorized_amount_cents",
                "authorized_start_date", "authorized_end_date", "received_on", "receiving_signature_present",
                "student_ready_confirmed", "counselor_requested_by", "counselor_requested_on", "counselor_request_reference",
                "authorized_program_slug", "authorized_class_name") = 0
        ELSE false
      END
    ), false))
);
CREATE UNIQUE INDEX IF NOT EXISTS "billing_attestations_id_case_id_key" ON "billing_attestations"("id", "case_id");
CREATE INDEX IF NOT EXISTS "billing_attestations_case_id_kind_attested_at_idx" ON "billing_attestations"("case_id", "kind", "attested_at" DESC);

-- --------------------------------------------- signer delegations (hook)
CREATE TABLE IF NOT EXISTS "billing_signer_delegations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "principal_subject_id" TEXT NOT NULL,
    "delegate_subject_id" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "approved_by_subject_id" TEXT NOT NULL,
    "approval_reference" TEXT NOT NULL,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_until" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_signer_delegations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "billing_signer_delegations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "billing_signer_delegations_check" CHECK (coalesce((
      "stage" IN ('j5', 'j6') AND "valid_until" > "valid_from"
      AND "principal_subject_id" <> "delegate_subject_id" AND btrim("approval_reference") <> ''
    ), false))
);
CREATE INDEX IF NOT EXISTS "billing_signer_delegations_organization_id_delegate_subject_idx" ON "billing_signer_delegations"("organization_id", "delegate_subject_id");

-- -------------------------------------------------------- stage records
CREATE TABLE IF NOT EXISTS "billing_stage_records" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "supersedes_record_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "document_number" TEXT NOT NULL,
    "content_version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "content_sha256" CHAR(64) NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "class_name" TEXT NOT NULL,
    "contact_hours" INTEGER NOT NULL,
    "class_start_date" DATE NOT NULL,
    "class_end_date" DATE NOT NULL,
    "prior_j5_source" TEXT,
    "prior_j5_record_id" TEXT,
    "external_j5_attestation_id" TEXT,
    "review_required" BOOLEAN NOT NULL DEFAULT false,
    "review_reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "review_cleared_by_subject_id" TEXT,
    "review_cleared_at" TIMESTAMP(3),
    "review_note" TEXT,
    "readiness_attestation_id" TEXT,
    "class_start_attestation_id" TEXT,
    "voucher_artifact_id" TEXT,
    "voucher_attestation_id" TEXT,
    "board_invoice_artifact_id" TEXT,
    "signed_at" TIMESTAMP(3),
    "signed_by_subject_id" TEXT,
    "signature_method" TEXT,
    "signer_intent" TEXT,
    "signed_via_delegation_id" TEXT,
    "signed_artifact_id" TEXT,
    "sent_at" TIMESTAMP(3),
    "send_receipt" JSONB,
    "superseded_at" TIMESTAMP(3),
    "voided_at" TIMESTAMP(3),
    "closed_by_subject_id" TEXT,
    "close_reason" TEXT,
    "accepted_roles_at_close" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "send_cancelled_at" TIMESTAMP(3),
    "send_cancelled_by_subject_id" TEXT,
    "send_cancel_reason" TEXT,
    "created_by_subject_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_stage_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "billing_stage_records_case_id_organization_id_fkey" FOREIGN KEY ("case_id", "organization_id") REFERENCES "billing_cases"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "billing_stage_records_external_j5_attestation_id_case_id_fkey" FOREIGN KEY ("external_j5_attestation_id", "case_id") REFERENCES "billing_attestations"("id", "case_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "billing_stage_records_readiness_attestation_id_case_id_fkey" FOREIGN KEY ("readiness_attestation_id", "case_id") REFERENCES "billing_attestations"("id", "case_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "billing_stage_records_class_start_attestation_id_case_id_fkey" FOREIGN KEY ("class_start_attestation_id", "case_id") REFERENCES "billing_attestations"("id", "case_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "billing_stage_records_voucher_artifact_id_case_id_fkey" FOREIGN KEY ("voucher_artifact_id", "case_id") REFERENCES "billing_artifacts"("id", "case_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "billing_stage_records_voucher_attestation_id_case_id_fkey" FOREIGN KEY ("voucher_attestation_id", "case_id") REFERENCES "billing_attestations"("id", "case_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "billing_stage_records_board_invoice_artifact_id_case_id_fkey" FOREIGN KEY ("board_invoice_artifact_id", "case_id") REFERENCES "billing_artifacts"("id", "case_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "billing_stage_records_signed_artifact_id_case_id_fkey" FOREIGN KEY ("signed_artifact_id", "case_id") REFERENCES "billing_artifacts"("id", "case_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "billing_stage_records_signed_via_delegation_id_fkey" FOREIGN KEY ("signed_via_delegation_id") REFERENCES "billing_signer_delegations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    -- One fixed line, Tuition & Fees $7,500.00, in whole cents; 160 or 200 hours.
    CONSTRAINT "billing_stage_records_terms_check" CHECK (coalesce((
      "stage" IN ('j5', 'j6') AND "version" >= 1 AND "content_version" >= 1
      AND "amount_cents" = 750000 AND "contact_hours" IN (160, 200)
      AND "class_end_date" > "class_start_date"
      AND "content_sha256" ~ '^[0-9a-f]{64}$' AND btrim("document_number") <> '' AND btrim("class_name") <> ''
    ), false)),
    -- The frozen content prints exactly the frozen columns.
    CONSTRAINT "billing_stage_records_content_check" CHECK (coalesce((
      jsonb_typeof("content" -> 'training') = 'object'
      AND "content" #>> '{training,className}' = "class_name"
      AND "content" #>> '{training,contactHours}' = "contact_hours"::text
      AND "content" #>> '{training,classStartDate}' = to_char("class_start_date", 'YYYY-MM-DD')
      AND "content" #>> '{training,classEndDate}' = to_char("class_end_date", 'YYYY-MM-DD')
      AND "content" ->> 'totalCents' = "amount_cents"::text
    ), false)),
    -- J5 is pre-voucher: readiness only. J6 needs class start, the signed voucher and its
    -- attestation, and a prior quote: our sent J5 (system) or an attested manual one (external).
    CONSTRAINT "billing_stage_records_stage_links_check" CHECK (coalesce((
      ("stage" = 'j5' AND "readiness_attestation_id" IS NOT NULL
        AND "class_start_attestation_id" IS NULL AND "voucher_artifact_id" IS NULL AND "voucher_attestation_id" IS NULL
        AND "board_invoice_artifact_id" IS NULL AND "prior_j5_source" IS NULL AND "prior_j5_record_id" IS NULL
        AND "external_j5_attestation_id" IS NULL AND NOT "review_required" AND "review_cleared_at" IS NULL)
      OR ("stage" = 'j6' AND "readiness_attestation_id" IS NULL
        AND "class_start_attestation_id" IS NOT NULL AND "voucher_artifact_id" IS NOT NULL AND "voucher_attestation_id" IS NOT NULL
        AND (("prior_j5_source" = 'system' AND "prior_j5_record_id" IS NOT NULL AND "external_j5_attestation_id" IS NULL)
          OR ("prior_j5_source" = 'external' AND "prior_j5_record_id" IS NULL AND "external_j5_attestation_id" IS NOT NULL)))
    ), false)),
    -- review_reasons are derived by billing_stage_record_rules() from the linked
    -- attestations and must match exactly. A recorded staff review never
    -- unlocks signing; every reason is a hard hold (see rules).
    CONSTRAINT "billing_stage_records_review_check" CHECK (coalesce((
      (("review_cleared_at" IS NULL AND "review_cleared_by_subject_id" IS NULL AND "review_note" IS NULL)
        OR ("review_required" AND "review_cleared_at" IS NOT NULL AND "review_cleared_by_subject_id" IS NOT NULL
          AND btrim(coalesce("review_note", '')) <> ''))
      AND ("review_required" = (cardinality(coalesce("review_reasons", ARRAY[]::TEXT[])) > 0))
      AND ("status" NOT IN ('signed', 'sent') OR NOT "review_required" OR "review_cleared_at" IS NOT NULL)
    ), false)),
    CONSTRAINT "billing_stage_records_status_check" CHECK (coalesce((
      ("status" = 'draft' AND "signed_at" IS NULL AND "signed_by_subject_id" IS NULL AND "signature_method" IS NULL
        AND "signer_intent" IS NULL AND "signed_via_delegation_id" IS NULL AND "signed_artifact_id" IS NULL
        AND "sent_at" IS NULL AND "send_receipt" IS NULL AND "superseded_at" IS NULL AND "voided_at" IS NULL)
      OR ("status" IN ('signed', 'sent') AND "signed_at" IS NOT NULL AND "signed_by_subject_id" IS NOT NULL
        AND "signature_method" IN ('typed_attestation', 'approved_image') AND btrim(coalesce("signer_intent", '')) <> ''
        AND "signed_artifact_id" IS NOT NULL AND "superseded_at" IS NULL AND "voided_at" IS NULL
        AND (("status" = 'signed' AND "sent_at" IS NULL AND "send_receipt" IS NULL)
          OR ("status" = 'sent' AND "sent_at" IS NOT NULL AND "send_receipt" IS NOT NULL)))
      OR ("status" = 'superseded' AND "superseded_at" IS NOT NULL AND "signed_at" IS NOT NULL AND "voided_at" IS NULL
        AND (("sent_at" IS NULL) = ("send_receipt" IS NULL)))
      OR ("status" = 'voided' AND "voided_at" IS NOT NULL AND "superseded_at" IS NULL)
    ), false)),
    -- accepted_roles_at_close (computed by billing_stage_record_guard) records which
    -- roles had an accepted copy of this version when it was closed; empty while open.
    -- An audited partial-send cancellation is all-or-nothing, only on a closed record
    -- that was never sent.
    CONSTRAINT "billing_stage_records_close_check" CHECK (coalesce((
      ("status" IN ('superseded', 'voided') OR cardinality(coalesce("accepted_roles_at_close", ARRAY[]::TEXT[])) = 0)
      AND "accepted_roles_at_close" IS NOT NULL
      AND ((num_nonnulls("send_cancelled_at", "send_cancelled_by_subject_id", "send_cancel_reason") = 0)
        OR ("send_cancelled_at" IS NOT NULL AND btrim(coalesce("send_cancelled_by_subject_id", '')) <> ''
          AND btrim(coalesce("send_cancel_reason", '')) <> ''
          AND "status" IN ('superseded', 'voided') AND "sent_at" IS NULL))
    ), false))
);
CREATE UNIQUE INDEX IF NOT EXISTS "billing_stage_records_supersedes_record_id_key" ON "billing_stage_records"("supersedes_record_id");
CREATE UNIQUE INDEX IF NOT EXISTS "billing_stage_records_case_id_stage_version_key" ON "billing_stage_records"("case_id", "stage", "version");
CREATE UNIQUE INDEX IF NOT EXISTS "billing_stage_records_organization_id_document_number_key" ON "billing_stage_records"("organization_id", "document_number");
CREATE UNIQUE INDEX IF NOT EXISTS "billing_stage_records_id_organization_id_stage_key" ON "billing_stage_records"("id", "organization_id", "stage");
CREATE UNIQUE INDEX IF NOT EXISTS "billing_stage_records_id_case_id_key" ON "billing_stage_records"("id", "case_id");
CREATE UNIQUE INDEX IF NOT EXISTS "billing_stage_records_id_case_id_stage_key" ON "billing_stage_records"("id", "case_id", "stage");
CREATE UNIQUE INDEX IF NOT EXISTS "billing_stage_records_id_case_id_stage_version_key" ON "billing_stage_records"("id", "case_id", "stage", "version");
CREATE INDEX IF NOT EXISTS "billing_stage_records_case_id_stage_created_at_idx" ON "billing_stage_records"("case_id", "stage", "created_at" DESC);
-- At most one open (draft/signed/sent) record per case and stage; corrections supersede.
CREATE UNIQUE INDEX IF NOT EXISTS "billing_stage_records_one_open_per_stage" ON "billing_stage_records"("case_id", "stage") WHERE "status" IN ('draft', 'signed', 'sent');
-- The self-referencing composite FKs need the unique indexes above first.
-- Supersede links stay inside one case and one stage (and one successor each).
-- A rendered artifact names the exact (record, case, stage, version) it renders.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_artifacts_stage_record_version_fkey'
                 AND conrelid = 'public.billing_artifacts'::regclass) THEN
    ALTER TABLE "billing_artifacts" ADD CONSTRAINT "billing_artifacts_stage_record_version_fkey"
      FOREIGN KEY ("stage_record_id", "case_id", "stage", "stage_version")
      REFERENCES "billing_stage_records"("id", "case_id", "stage", "version") ON DELETE RESTRICT ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_stage_records_supersedes_record_id_case_id_stage_fkey'
                 AND conrelid = 'public.billing_stage_records'::regclass) THEN
    ALTER TABLE "billing_stage_records" ADD CONSTRAINT "billing_stage_records_supersedes_record_id_case_id_stage_fkey"
      FOREIGN KEY ("supersedes_record_id", "case_id", "stage") REFERENCES "billing_stage_records"("id", "case_id", "stage") ON DELETE RESTRICT ON UPDATE NO ACTION;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_stage_records_prior_j5_record_id_case_id_fkey'
                 AND conrelid = 'public.billing_stage_records'::regclass) THEN
    ALTER TABLE "billing_stage_records" ADD CONSTRAINT "billing_stage_records_prior_j5_record_id_case_id_fkey"
      FOREIGN KEY ("prior_j5_record_id", "case_id") REFERENCES "billing_stage_records"("id", "case_id") ON DELETE RESTRICT ON UPDATE NO ACTION;
  END IF;
END;
$$;

-- ------------------------------------------------- recipient snapshot
-- The exact recipients of one stage record: one normalized address per role,
-- editable only while the record is a draft and frozen from signing on.
-- Each send row must match its role's address (composite FK below).
CREATE TABLE IF NOT EXISTS "billing_stage_recipients" (
    "stage_record_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "recipient_role" TEXT NOT NULL,
    "recipient_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_stage_recipients_pkey" PRIMARY KEY ("stage_record_id", "recipient_role"),
    CONSTRAINT "billing_stage_recipients_stage_record_id_organization_id_s_fkey" FOREIGN KEY ("stage_record_id", "organization_id", "stage") REFERENCES "billing_stage_records"("id", "organization_id", "stage") ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "billing_stage_recipients_check" CHECK (coalesce((
      (("stage" = 'j5' AND "recipient_role" IN ('student', 'counselor'))
        OR ("stage" = 'j6' AND "recipient_role" IN ('student', 'counselor', 'finance')))
      AND btrim("recipient_name") <> ''
      AND "email" = lower(btrim("email")) AND "email" ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    ), false))
);
CREATE UNIQUE INDEX IF NOT EXISTS "billing_stage_recipients_record_role_email_key" ON "billing_stage_recipients"("stage_record_id", "recipient_role", "email");
-- Each role gets its own copy: no two roles of one record share an address.
CREATE UNIQUE INDEX IF NOT EXISTS "billing_stage_recipients_record_email_key" ON "billing_stage_recipients"("stage_record_id", "email");

-- ---------------------------------------------------------------- sends
CREATE TABLE IF NOT EXISTS "billing_stage_sends" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "stage_record_id" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "attempt_no" INTEGER NOT NULL,
    "recipient_role" TEXT NOT NULL,
    "recipient_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "claim_token" TEXT NOT NULL,
    "claimed_at" TIMESTAMP(3) NOT NULL,
    "last_claimed_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "content_sha256" CHAR(64) NOT NULL,
    "attachment_sha256s" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "provider_message_id" TEXT,
    "provider_result" TEXT,
    "last_error" TEXT,
    "reconciled_by_subject_id" TEXT,
    "reconciled_at" TIMESTAMP(3),
    "reconcile_note" TEXT,
    "reconcile_evidence_artifact_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_stage_sends_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "billing_stage_sends_recipient_snapshot_fkey" FOREIGN KEY ("stage_record_id", "recipient_role", "email") REFERENCES "billing_stage_recipients"("stage_record_id", "recipient_role", "email") ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "billing_stage_sends_reconcile_evidence_artifact_id_fkey" FOREIGN KEY ("reconcile_evidence_artifact_id") REFERENCES "billing_artifacts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "billing_stage_sends_stage_record_id_organization_id_stage_fkey" FOREIGN KEY ("stage_record_id", "organization_id", "stage") REFERENCES "billing_stage_records"("id", "organization_id", "stage") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "billing_stage_sends_recipient_check" CHECK (coalesce((
      ("stage" = 'j5' AND "recipient_role" IN ('student', 'counselor'))
      OR ("stage" = 'j6' AND "recipient_role" IN ('student', 'counselor', 'finance'))
    ), false)),
    CONSTRAINT "billing_stage_sends_status_check" CHECK (coalesce((
      "attempt_no" >= 1 AND btrim("email") <> ''
      AND "status" = ANY(public.billing_send_statuses())
      -- provider_accepted = the provider ACCEPTED the copy (accepted_at + provider_message_id).
      -- This, or an audited reconciled_delivered, is what counts toward a stage's 'sent'.
      -- Later delivery evidence lives in billing_delivery_events (append-only).
      AND ("status" <> 'provider_accepted' OR ("accepted_at" IS NOT NULL AND btrim(coalesce("provider_message_id", '')) <> ''))
      AND ("status" NOT IN ('reconciled_delivered', 'reconciled_failed')
        OR ("reconciled_by_subject_id" IS NOT NULL AND "reconciled_at" IS NOT NULL AND btrim(coalesce("reconcile_note", '')) <> ''))
    ), false))
);
CREATE UNIQUE INDEX IF NOT EXISTS "billing_stage_sends_idempotency_key_key" ON "billing_stage_sends"("idempotency_key");
CREATE UNIQUE INDEX IF NOT EXISTS "billing_stage_sends_stage_record_id_stage_attempt_no_recipi_key" ON "billing_stage_sends"("stage_record_id", "stage", "attempt_no", "recipient_role");
CREATE UNIQUE INDEX IF NOT EXISTS "billing_stage_sends_id_organization_id_key" ON "billing_stage_sends"("id", "organization_id");
-- At most one accepted copy per role of a record: an accepted role is never re-sent.
CREATE UNIQUE INDEX IF NOT EXISTS "billing_stage_sends_one_accepted_per_role" ON "billing_stage_sends"("stage_record_id", "recipient_role")
  WHERE "status" IN ('provider_accepted', 'reconciled_delivered');

-- ----------------------------------------------------- delivery events
-- Delivery evidence after provider acceptance (webhook or operator). Append-only,
-- recordable after the stage is sent, and never unsends it; a bounce or
-- complaint flags the case for follow-up.
CREATE TABLE IF NOT EXISTS "billing_delivery_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "send_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "provider_event_id" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_delivery_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "billing_delivery_events_send_id_organization_id_fkey" FOREIGN KEY ("send_id", "organization_id") REFERENCES "billing_stage_sends"("id", "organization_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "billing_delivery_events_check" CHECK (coalesce((
      "kind" = ANY(public.billing_delivery_event_kinds()) AND btrim("source") <> ''
    ), false))
);
CREATE UNIQUE INDEX IF NOT EXISTS "billing_delivery_events_provider_event_id_key" ON "billing_delivery_events"("provider_event_id");
CREATE INDEX IF NOT EXISTS "billing_delivery_events_send_id_idx" ON "billing_delivery_events"("send_id");

-- ------------------------------------------------------- payment events
CREATE TABLE IF NOT EXISTS "billing_payment_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "j6_record_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "expected_follow_up_from" DATE,
    "expected_follow_up_to" DATE,
    "received_on" DATE,
    "evidence" TEXT,
    "recorded_by_subject_id" TEXT NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_payment_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "billing_payment_events_case_id_organization_id_fkey" FOREIGN KEY ("case_id", "organization_id") REFERENCES "billing_cases"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "billing_payment_events_j6_record_id_case_id_fkey" FOREIGN KEY ("j6_record_id", "case_id") REFERENCES "billing_stage_records"("id", "case_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
    -- pending = an expected follow-up window (send + 10..14 days), never a due date.
    -- received = only with a recorded date and evidence.
    CONSTRAINT "billing_payment_events_status_check" CHECK (coalesce((
      ("status" = 'pending' AND "expected_follow_up_from" IS NOT NULL AND "expected_follow_up_to" = "expected_follow_up_from" + 4
        AND "received_on" IS NULL AND "evidence" IS NULL)
      OR ("status" = 'received' AND "received_on" IS NOT NULL AND btrim(coalesce("evidence", '')) <> ''
        AND "expected_follow_up_from" IS NULL AND "expected_follow_up_to" IS NULL)
    ), false))
);
CREATE INDEX IF NOT EXISTS "billing_payment_events_case_id_recorded_at_idx" ON "billing_payment_events"("case_id", "recorded_at" DESC);

-- ------------------------------------------------------------- triggers
-- Payment events belong to a J6 that was actually sent, proven by retained
-- evidence (sent_at plus an accepted copy for finance, counselor and student),
-- not by its current status: a sent J6 later superseded by a corrected cover
-- letter still reconciles a payment that arrives afterwards. sent_at can only
-- have been written by the validated signed -> sent transition
-- (billing_stage_record_guard), so a signed J6 superseded without being sent
-- has sent_at NULL and is never billable.
CREATE OR REPLACE FUNCTION public.billing_payment_event_j6_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.billing_stage_records r
    WHERE r.id = NEW.j6_record_id AND r.case_id = NEW.case_id AND r.stage = 'j6'
      AND r.sent_at IS NOT NULL AND r.status IN ('sent', 'superseded')
      AND (SELECT count(DISTINCT s.recipient_role) FROM public.billing_stage_sends s
           WHERE s.stage_record_id = r.id AND s.status IN ('provider_accepted', 'reconciled_delivered')
             AND s.recipient_role IN ('finance', 'counselor', 'student')) = 3
  ) THEN
    RAISE EXCEPTION 'payment status is tracked only for a J6 that was sent to finance, counselor and student' USING ERRCODE = '23514';
  END IF;
  -- A pending follow-up window is anchored to that J6's own send date
  -- (America/Chicago) + 10 .. + 14 days, exactly as payment.ts computes it.
  IF NEW.status = 'pending' AND NOT EXISTS (
      SELECT 1 FROM public.billing_stage_records r
      WHERE r.id = NEW.j6_record_id
        AND NEW.expected_follow_up_from = public.billing_sent_on(r.sent_at) + 10
        AND NEW.expected_follow_up_to = public.billing_sent_on(r.sent_at) + 14) THEN
    RAISE EXCEPTION 'the expected follow-up window is the J6 send date (America/Chicago) + 10 to + 14 days' USING ERRCODE = '23514';
  END IF;
  IF NEW.received_on IS NOT NULL AND NEW.received_on > public.billing_today() THEN
    RAISE EXCEPTION 'a payment cannot be received in the future (America/Chicago date)' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS billing_payment_event_j6_only ON public.billing_payment_events;
CREATE TRIGGER billing_payment_event_j6_only
  BEFORE INSERT ON public.billing_payment_events
  FOR EACH ROW EXECUTE FUNCTION public.billing_payment_event_j6_only();

-- Artifacts, attestations and payment events are append-only.
CREATE OR REPLACE FUNCTION public.billing_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME USING ERRCODE = '23514';
END;
$$;
DROP TRIGGER IF EXISTS billing_artifacts_append_only ON public.billing_artifacts;
CREATE TRIGGER billing_artifacts_append_only
  BEFORE UPDATE OR DELETE ON public.billing_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.billing_append_only();
DROP TRIGGER IF EXISTS billing_attestations_append_only ON public.billing_attestations;
CREATE TRIGGER billing_attestations_append_only
  BEFORE UPDATE OR DELETE ON public.billing_attestations
  FOR EACH ROW EXECUTE FUNCTION public.billing_append_only();
DROP TRIGGER IF EXISTS billing_payment_events_append_only ON public.billing_payment_events;
CREATE TRIGGER billing_payment_events_append_only
  BEFORE UPDATE OR DELETE ON public.billing_payment_events
  FOR EACH ROW EXECUTE FUNCTION public.billing_append_only();

-- Case identity is fixed; member_id may only be detached (erasure) or kept.
-- Case identity is fixed. member_id may only be kept, detached (erasure, via the
-- users FK SET NULL), or repointed to the survivor of a member merge. The merge
-- executor (lib/admin/memberMerge.ts) declares the pair for its transaction with
-- set_config('app.billing_member_merge', '<merged-away id>><survivor id>', true);
-- any other repoint is refused. The trigger records the audit columns itself.
CREATE OR REPLACE FUNCTION public.billing_case_identity_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.member_merged_at IS NOT NULL OR NEW.member_merged_from_id IS NOT NULL THEN
      RAISE EXCEPTION 'a new billing case starts on its own subject' USING ERRCODE = '23514';
    END IF;
    -- A new case names a live member of its organization as its own subject.
    -- member_id becomes NULL only later, through erasure (users FK SET NULL).
    IF NEW.member_id IS NULL OR NEW.subject_member_id IS DISTINCT FROM NEW.member_id THEN
      RAISE EXCEPTION 'a new billing case names a live member as its subject (member_id = subject_member_id)' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.users u WHERE u.id = NEW.member_id AND u.organization_id = NEW.organization_id) THEN
      RAISE EXCEPTION 'the billing case member must belong to the case organization' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.subject_member_id IS DISTINCT FROM OLD.subject_member_id
     OR NEW.program_slug IS DISTINCT FROM OLD.program_slug
     OR NEW.created_by_subject_id IS DISTINCT FROM OLD.created_by_subject_id THEN
    RAISE EXCEPTION 'billing case identity is immutable' USING ERRCODE = '23514';
  END IF;
  -- member_id becomes NULL only through erasure: the users FK's ON DELETE SET
  -- NULL runs after the user row is gone. A live member cannot be detached.
  IF NEW.member_id IS NULL AND OLD.member_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = OLD.member_id) THEN
    RAISE EXCEPTION 'a billing case is detached from its member only by erasing that member' USING ERRCODE = '23514';
  END IF;
  IF NEW.member_id IS NOT NULL AND NEW.member_id IS DISTINCT FROM OLD.member_id THEN
    IF OLD.member_id IS NULL
       OR current_setting('app.billing_member_merge', true) IS DISTINCT FROM OLD.member_id || '>' || NEW.member_id
       OR NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = NEW.member_id AND u.organization_id = NEW.organization_id) THEN
      RAISE EXCEPTION 'a billing case moves to another member only through a recorded member merge' USING ERRCODE = '23514';
    END IF;
    NEW.member_merged_from_id := OLD.member_id;
    NEW.member_merged_at := now();
  ELSE
    NEW.member_merged_from_id := OLD.member_merged_from_id;
    NEW.member_merged_at := OLD.member_merged_at;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS billing_case_identity_guard ON public.billing_cases;
CREATE TRIGGER billing_case_identity_guard
  BEFORE INSERT OR UPDATE ON public.billing_cases
  FOR EACH ROW EXECUTE FUNCTION public.billing_case_identity_guard();

-- Stage records: drafts are editable; once signed, everything that was
-- signed is frozen. Allowed status moves: draft -> signed | voided,
-- signed -> sent | superseded | voided, sent -> superseded. Signed and
-- later records are never deleted.
CREATE OR REPLACE FUNCTION public.billing_stage_record_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  required_roles TEXT[];
  has_claims BOOLEAN;
  has_unresolved BOOLEAN;
  accepted_roles TEXT[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'a signed billing stage record cannot be deleted' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.case_id IS DISTINCT FROM OLD.case_id OR NEW.stage IS DISTINCT FROM OLD.stage
     OR NEW.version IS DISTINCT FROM OLD.version OR NEW.document_number IS DISTINCT FROM OLD.document_number
     OR NEW.supersedes_record_id IS DISTINCT FROM OLD.supersedes_record_id
     OR NEW.created_by_subject_id IS DISTINCT FROM OLD.created_by_subject_id THEN
    RAISE EXCEPTION 'billing stage record identity is immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'draft' AND NEW.status IN ('signed', 'voided'))
    OR (OLD.status = 'signed' AND NEW.status IN ('sent', 'superseded', 'voided'))
    OR (OLD.status = 'sent' AND NEW.status = 'superseded')) THEN
    RAISE EXCEPTION 'billing stage status cannot move from % to %', OLD.status, NEW.status USING ERRCODE = '23514';
  END IF;
  IF OLD.status IN ('superseded', 'voided') THEN
    RAISE EXCEPTION 'a closed billing stage record is immutable' USING ERRCODE = '23514';
  END IF;
  -- The sent proof (sent_at, send_receipt) is written only by the genuine
  -- signed -> sent transition, which billing_stage_record_rules() validates
  -- against the per-role accepted copies. A signed record that is superseded
  -- or voided without being sent keeps both NULL; a sent record that is later
  -- superseded keeps its proof unchanged.
  IF (NEW.sent_at IS DISTINCT FROM OLD.sent_at OR NEW.send_receipt IS DISTINCT FROM OLD.send_receipt)
     AND NOT (OLD.status = 'signed' AND NEW.status = 'sent') THEN
    RAISE EXCEPTION 'sent_at and send_receipt are set only by the signed -> sent transition' USING ERRCODE = '23514';
  END IF;
  -- Closure (-> superseded | voided). A signed record with ANY send claim
  -- (accepted or not) is closed only after it completes signed -> sent, or
  -- through the audited partial-send cancellation: every claim resolved, at
  -- least one role still without an accepted copy (otherwise it must be sent),
  -- and who + why recorded. The roles that received this version are recorded
  -- in accepted_roles_at_close so the next version can show them. The row lock
  -- taken by this UPDATE serializes with claim inserts and claim status moves
  -- (both lock the record FOR SHARE).
  IF NEW.status IN ('superseded', 'voided') AND NEW.status IS DISTINCT FROM OLD.status THEN
    required_roles := CASE NEW.stage WHEN 'j5' THEN ARRAY['counselor', 'student'] ELSE ARRAY['counselor', 'finance', 'student'] END;
    SELECT count(*) > 0, coalesce(bool_or(s.status IN ('pending', 'ambiguous', 'needs_reconciliation')), false)
      INTO has_claims, has_unresolved
      FROM public.billing_stage_sends s WHERE s.stage_record_id = NEW.id;
    SELECT coalesce(array_agg(DISTINCT s.recipient_role ORDER BY s.recipient_role), ARRAY[]::TEXT[]) INTO accepted_roles
      FROM public.billing_stage_sends s
      WHERE s.stage_record_id = NEW.id AND s.status IN ('provider_accepted', 'reconciled_delivered');
    IF OLD.status = 'signed' AND has_claims THEN
      IF has_unresolved THEN
        RAISE EXCEPTION 'resolve every send claim (accepted, failed or reconciled) before closing this signed record' USING ERRCODE = '23514';
      END IF;
      IF accepted_roles @> required_roles THEN
        RAISE EXCEPTION 'every recipient has this version: complete signed -> sent, then supersede it' USING ERRCODE = '23514';
      END IF;
      IF btrim(coalesce(NEW.send_cancelled_by_subject_id, '')) = '' OR btrim(coalesce(NEW.send_cancel_reason, '')) = '' THEN
        RAISE EXCEPTION 'closing a partly sent record needs the audited partial-send cancellation (who and why)' USING ERRCODE = '23514';
      END IF;
      NEW.send_cancelled_at := now();
    ELSIF num_nonnulls(NEW.send_cancelled_at, NEW.send_cancelled_by_subject_id, NEW.send_cancel_reason) > 0 THEN
      RAISE EXCEPTION 'a partial-send cancellation applies only to a signed record with send claims' USING ERRCODE = '23514';
    END IF;
    NEW.accepted_roles_at_close := accepted_roles;
  ELSIF NEW.accepted_roles_at_close IS DISTINCT FROM OLD.accepted_roles_at_close
     OR NEW.send_cancelled_at IS DISTINCT FROM OLD.send_cancelled_at
     OR NEW.send_cancelled_by_subject_id IS DISTINCT FROM OLD.send_cancelled_by_subject_id
     OR NEW.send_cancel_reason IS DISTINCT FROM OLD.send_cancel_reason THEN
    RAISE EXCEPTION 'closure audit columns are written only when the record is closed' USING ERRCODE = '23514';
  END IF;
  IF OLD.status <> 'draft' AND (
       NEW.content_version IS DISTINCT FROM OLD.content_version OR NEW.content IS DISTINCT FROM OLD.content
    OR NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256 OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
    OR NEW.contact_hours IS DISTINCT FROM OLD.contact_hours OR NEW.class_start_date IS DISTINCT FROM OLD.class_start_date
    OR NEW.class_end_date IS DISTINCT FROM OLD.class_end_date OR NEW.prior_j5_source IS DISTINCT FROM OLD.prior_j5_source
    OR NEW.prior_j5_record_id IS DISTINCT FROM OLD.prior_j5_record_id
    OR NEW.external_j5_attestation_id IS DISTINCT FROM OLD.external_j5_attestation_id
    OR NEW.review_required IS DISTINCT FROM OLD.review_required OR NEW.review_reasons IS DISTINCT FROM OLD.review_reasons
    OR NEW.review_cleared_by_subject_id IS DISTINCT FROM OLD.review_cleared_by_subject_id
    OR NEW.review_cleared_at IS DISTINCT FROM OLD.review_cleared_at OR NEW.review_note IS DISTINCT FROM OLD.review_note
    OR NEW.class_name IS DISTINCT FROM OLD.class_name
    OR NEW.readiness_attestation_id IS DISTINCT FROM OLD.readiness_attestation_id
    OR NEW.class_start_attestation_id IS DISTINCT FROM OLD.class_start_attestation_id
    OR NEW.voucher_artifact_id IS DISTINCT FROM OLD.voucher_artifact_id
    OR NEW.voucher_attestation_id IS DISTINCT FROM OLD.voucher_attestation_id
    OR NEW.board_invoice_artifact_id IS DISTINCT FROM OLD.board_invoice_artifact_id
    OR NEW.signed_at IS DISTINCT FROM OLD.signed_at OR NEW.signed_by_subject_id IS DISTINCT FROM OLD.signed_by_subject_id
    OR NEW.signature_method IS DISTINCT FROM OLD.signature_method OR NEW.signer_intent IS DISTINCT FROM OLD.signer_intent
    OR NEW.signed_via_delegation_id IS DISTINCT FROM OLD.signed_via_delegation_id
    OR NEW.signed_artifact_id IS DISTINCT FROM OLD.signed_artifact_id) THEN
    RAISE EXCEPTION 'a signed billing stage record is immutable; supersede it with a new version' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS billing_stage_record_guard ON public.billing_stage_records;
CREATE TRIGGER billing_stage_record_guard
  BEFORE UPDATE OR DELETE ON public.billing_stage_records
  FOR EACH ROW EXECUTE FUNCTION public.billing_stage_record_guard();

-- Send rows: identity is fixed, settled rows are final, rows are never deleted.
-- Send claims are per recipient role of one signed record version:
--  * a claim starts `pending`, carries the record's frozen content hash and the
--    canonical idempotency key for its (stage, record, version, attempt, role);
--  * attempt 1 is the first claim for a role; attempt n + 1 (a fresh key) only
--    after that role's latest claim definitively failed (failed / reconciled_failed);
--    an accepted or unresolved role gets no new claim;
--  * an ambiguous claim is retried with the SAME key (ambiguous -> pending, with a
--    new claim token), or settled by audited reconciliation;
--  * identity is fixed, settled claims are final, rows are never deleted.
CREATE OR REPLACE FUNCTION public.billing_stage_send_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  rec_version INTEGER;
  rec_content TEXT;
  rec_status TEXT;
  latest_attempt INTEGER;
  mutable TEXT[];
  latest_status TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'billing send rows are never deleted' USING ERRCODE = '23514';
  END IF;
  -- Reconciliation evidence is a file of the same case (and organization).
  IF NEW.reconcile_evidence_artifact_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.billing_artifacts a
      JOIN public.billing_stage_records r ON r.case_id = a.case_id AND r.organization_id = a.organization_id
      WHERE a.id = NEW.reconcile_evidence_artifact_id AND r.id = NEW.stage_record_id) THEN
    RAISE EXCEPTION 'reconciliation evidence must be a file of the same case' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending' THEN
      RAISE EXCEPTION 'a billing send starts as pending' USING ERRCODE = '23514';
    END IF;
    -- Serialize with the record's own transitions (sign / sent).
    SELECT r.version, r.content_sha256, r.status INTO rec_version, rec_content, rec_status
      FROM public.billing_stage_records r WHERE r.id = NEW.stage_record_id FOR SHARE;
    -- New claims only while the record is signed and not yet sent. Once the
    -- stage is sent (or closed) no copy is added; delivery evidence for the
    -- existing copies still goes to billing_delivery_events.
    IF rec_status IS DISTINCT FROM 'signed' THEN
      RAISE EXCEPTION 'no new send claim for a % stage record', coalesce(rec_status, 'missing') USING ERRCODE = '23514';
    END IF;
    IF NEW.content_sha256 IS DISTINCT FROM rec_content THEN
      RAISE EXCEPTION 'a claim carries the frozen content hash of its record version' USING ERRCODE = '23514';
    END IF;
    IF NEW.idempotency_key IS DISTINCT FROM format('billing-two-stage:%s:%s:v%s:a%s:%s',
         NEW.stage, NEW.stage_record_id, rec_version, NEW.attempt_no, NEW.recipient_role) THEN
      RAISE EXCEPTION 'the idempotency key must be the canonical key for this stage, record version, attempt and role' USING ERRCODE = '23514';
    END IF;
    SELECT s.attempt_no, s.status INTO latest_attempt, latest_status FROM public.billing_stage_sends s
      WHERE s.stage_record_id = NEW.stage_record_id AND s.recipient_role = NEW.recipient_role
      ORDER BY s.attempt_no DESC LIMIT 1;
    IF latest_attempt IS NULL THEN
      IF NEW.attempt_no <> 1 THEN
        RAISE EXCEPTION 'the first claim for a role is attempt 1' USING ERRCODE = '23514';
      END IF;
    ELSIF latest_status NOT IN ('failed', 'reconciled_failed') THEN
      RAISE EXCEPTION 'the % copy is %: no new attempt (accepted copies are never re-sent; unresolved ones are retried with the same key or reconciled)', NEW.recipient_role, latest_status USING ERRCODE = '23514';
    ELSIF NEW.attempt_no <> latest_attempt + 1 THEN
      RAISE EXCEPTION 'the next attempt for % is %', NEW.recipient_role, latest_attempt + 1 USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.stage_record_id IS DISTINCT FROM OLD.stage_record_id OR NEW.stage IS DISTINCT FROM OLD.stage
     OR NEW.attempt_no IS DISTINCT FROM OLD.attempt_no OR NEW.recipient_role IS DISTINCT FROM OLD.recipient_role
     OR NEW.email IS DISTINCT FROM OLD.email OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256 THEN
    RAISE EXCEPTION 'billing send identity is immutable' USING ERRCODE = '23514';
  END IF;
  -- Every other column is frozen except the ones the status move itself
  -- writes: an update without a status move changes nothing but updated_at;
  -- recipient_name, claimed_at, created_at and attachment_sha256s never change.
  mutable := ARRAY['updated_at'];
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    mutable := mutable || ARRAY['status', 'provider_result', 'last_error'];
    IF OLD.status = 'ambiguous' AND NEW.status = 'pending' THEN
      mutable := mutable || ARRAY['claim_token', 'last_claimed_at'];
    END IF;
    IF NEW.status = 'provider_accepted' THEN
      mutable := mutable || ARRAY['accepted_at', 'provider_message_id'];
    END IF;
    IF NEW.status IN ('reconciled_delivered', 'reconciled_failed') THEN
      mutable := mutable || ARRAY['reconciled_by_subject_id', 'reconciled_at', 'reconcile_note', 'reconcile_evidence_artifact_id'];
    END IF;
  END IF;
  IF (to_jsonb(NEW) - mutable) IS DISTINCT FROM (to_jsonb(OLD) - mutable) THEN
    RAISE EXCEPTION 'billing send columns other than % are frozen for this update', array_to_string(mutable, ', ') USING ERRCODE = '23514';
  END IF;
  IF OLD.status IN ('provider_accepted', 'failed', 'reconciled_delivered', 'reconciled_failed') THEN
    RAISE EXCEPTION 'a settled billing send is final (delivery evidence goes to billing_delivery_events)' USING ERRCODE = '23514';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'pending' AND NEW.status IN ('provider_accepted', 'failed', 'ambiguous', 'needs_reconciliation'))
    OR (OLD.status = 'ambiguous' AND NEW.status IN ('pending', 'provider_accepted', 'failed', 'needs_reconciliation', 'reconciled_delivered', 'reconciled_failed'))
    OR (OLD.status = 'needs_reconciliation' AND NEW.status IN ('reconciled_delivered', 'reconciled_failed'))) THEN
    RAISE EXCEPTION 'billing send status cannot move from % to %', OLD.status, NEW.status USING ERRCODE = '23514';
  END IF;
  IF OLD.status = 'ambiguous' AND NEW.status = 'pending' AND NEW.claim_token IS NOT DISTINCT FROM OLD.claim_token THEN
    RAISE EXCEPTION 'a same-key retry re-claims with a new claim token' USING ERRCODE = '23514';
  END IF;
  -- A claim settles only while its record is signed (locked, so it serializes
  -- with closure and with signed -> sent). A closed record keeps no unresolved
  -- claim, and a sent one never had one, so a late acceptance after closure is
  -- refused; delivery evidence for accepted copies goes to billing_delivery_events.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT r.status INTO rec_status FROM public.billing_stage_records r WHERE r.id = NEW.stage_record_id FOR SHARE;
    IF rec_status IS DISTINCT FROM 'signed' THEN
      RAISE EXCEPTION 'a send claim of a % stage record cannot change status', coalesce(rec_status, 'missing') USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS billing_stage_send_guard ON public.billing_stage_sends;
CREATE TRIGGER billing_stage_send_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.billing_stage_sends
  FOR EACH ROW EXECUTE FUNCTION public.billing_stage_send_guard();

-- Delivery evidence attaches only to an accepted copy, including after the
-- stage is sent (nothing here touches the stage record).
CREATE OR REPLACE FUNCTION public.billing_delivery_event_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.billing_stage_sends s
                 WHERE s.id = NEW.send_id AND s.status IN ('provider_accepted', 'reconciled_delivered')) THEN
    RAISE EXCEPTION 'delivery evidence applies only to an accepted or reconciled-delivered copy' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS billing_delivery_event_guard ON public.billing_delivery_events;
CREATE TRIGGER billing_delivery_event_guard
  BEFORE INSERT ON public.billing_delivery_events
  FOR EACH ROW EXECUTE FUNCTION public.billing_delivery_event_guard();
DROP TRIGGER IF EXISTS billing_delivery_events_append_only ON public.billing_delivery_events;
CREATE TRIGGER billing_delivery_events_append_only
  BEFORE UPDATE OR DELETE ON public.billing_delivery_events
  FOR EACH ROW EXECUTE FUNCTION public.billing_append_only();

-- Attestation dates: nothing is attested as having happened after today
-- (America/Chicago).
CREATE OR REPLACE FUNCTION public.billing_attestation_dates_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  today DATE := public.billing_today();
BEGIN
  IF (NEW.kind = 'class_started' AND NEW.class_start_date > today)
     OR (NEW.kind = 'voucher_board_signed' AND NEW.received_on > today)
     OR (NEW.kind = 'j5_readiness' AND NEW.counselor_requested_on > today)
     OR (NEW.kind = 'external_j5_reference' AND NEW.external_quote_date > today) THEN
    RAISE EXCEPTION 'a % attestation cannot record a date after today (America/Chicago)', NEW.kind USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS billing_attestation_dates_guard ON public.billing_attestations;
CREATE TRIGGER billing_attestation_dates_guard
  BEFORE INSERT ON public.billing_attestations
  FOR EACH ROW EXECUTE FUNCTION public.billing_attestation_dates_guard();

-- The recipient snapshot changes only while its record is a draft.
CREATE OR REPLACE FUNCTION public.billing_stage_recipient_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  rec_id TEXT := CASE WHEN TG_OP = 'DELETE' THEN OLD.stage_record_id ELSE NEW.stage_record_id END;
  rec_status TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.stage_record_id IS DISTINCT FROM OLD.stage_record_id OR NEW.recipient_role IS DISTINCT FROM OLD.recipient_role) THEN
    RAISE EXCEPTION 'a recipient row cannot move' USING ERRCODE = '23514';
  END IF;
  -- Lock the parent record so a concurrent sign (an UPDATE of that row) is
  -- serialized with this change: either the sign sees the committed snapshot,
  -- or this change waits for the sign and then sees the record is no longer a draft.
  SELECT r.status INTO rec_status FROM public.billing_stage_records r WHERE r.id = rec_id FOR UPDATE;
  IF rec_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'recipients are frozen once the document is signed' USING ERRCODE = '23514';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
DROP TRIGGER IF EXISTS billing_stage_recipient_guard ON public.billing_stage_recipients;
CREATE TRIGGER billing_stage_recipient_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.billing_stage_recipients
  FOR EACH ROW EXECUTE FUNCTION public.billing_stage_recipient_guard();

-- Every link on a stage record points at the right kind of row in the same case.
CREATE OR REPLACE FUNCTION public.billing_stage_record_links_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  -- Links are checked when set; a later status move of a linked row (e.g. the
  -- J5 being superseded) does not retroactively invalidate this record.
  IF TG_OP = 'UPDATE' AND ROW(NEW.readiness_attestation_id, NEW.class_start_attestation_id, NEW.voucher_artifact_id,
        NEW.voucher_attestation_id, NEW.board_invoice_artifact_id, NEW.signed_artifact_id, NEW.prior_j5_record_id,
        NEW.external_j5_attestation_id)
      IS NOT DISTINCT FROM ROW(OLD.readiness_attestation_id, OLD.class_start_attestation_id, OLD.voucher_artifact_id,
        OLD.voucher_attestation_id, OLD.board_invoice_artifact_id, OLD.signed_artifact_id, OLD.prior_j5_record_id,
        OLD.external_j5_attestation_id) THEN
    RETURN NEW;
  END IF;
  IF NEW.readiness_attestation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.billing_attestations a
      WHERE a.id = NEW.readiness_attestation_id AND a.case_id = NEW.case_id AND a.kind = 'j5_readiness') THEN
    RAISE EXCEPTION 'readiness_attestation_id must be a j5_readiness attestation' USING ERRCODE = '23514';
  END IF;
  IF NEW.class_start_attestation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.billing_attestations a
      WHERE a.id = NEW.class_start_attestation_id AND a.case_id = NEW.case_id AND a.kind = 'class_started') THEN
    RAISE EXCEPTION 'class_start_attestation_id must be a class_started attestation' USING ERRCODE = '23514';
  END IF;
  IF NEW.voucher_artifact_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.billing_artifacts f
      WHERE f.id = NEW.voucher_artifact_id AND f.case_id = NEW.case_id AND f.kind = 'board_signed_voucher') THEN
    RAISE EXCEPTION 'voucher_artifact_id must be an uploaded board-signed voucher' USING ERRCODE = '23514';
  END IF;
  IF NEW.voucher_attestation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.billing_attestations a
      WHERE a.id = NEW.voucher_attestation_id AND a.case_id = NEW.case_id AND a.kind = 'voucher_board_signed' AND a.artifact_id = NEW.voucher_artifact_id) THEN
    RAISE EXCEPTION 'voucher_attestation_id must attest this voucher artifact' USING ERRCODE = '23514';
  END IF;
  IF NEW.board_invoice_artifact_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.billing_artifacts f
      WHERE f.id = NEW.board_invoice_artifact_id AND f.case_id = NEW.case_id AND f.kind = 'board_invoice') THEN
    RAISE EXCEPTION 'board_invoice_artifact_id must be an uploaded board invoice' USING ERRCODE = '23514';
  END IF;
  IF NEW.signed_artifact_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.billing_artifacts f
      WHERE f.id = NEW.signed_artifact_id AND f.case_id = NEW.case_id AND f.kind = NEW.stage || '_signed_pdf'
        AND f.stage_record_id = NEW.id AND f.stage_version = NEW.version AND f.rendered_content_sha256 = NEW.content_sha256) THEN
    RAISE EXCEPTION 'signed_artifact_id must be the PDF rendered from this exact record version and content' USING ERRCODE = '23514';
  END IF;
  IF NEW.prior_j5_record_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.billing_stage_records r
      WHERE r.id = NEW.prior_j5_record_id AND r.case_id = NEW.case_id AND r.stage = 'j5' AND r.status = 'sent') THEN
    RAISE EXCEPTION 'prior_j5_record_id must be this case''s sent J5' USING ERRCODE = '23514';
  END IF;
  IF NEW.external_j5_attestation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.billing_attestations a
      WHERE a.id = NEW.external_j5_attestation_id AND a.case_id = NEW.case_id AND a.kind = 'external_j5_reference') THEN
    RAISE EXCEPTION 'external_j5_attestation_id must be an external_j5_reference attestation' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS billing_stage_record_links_guard ON public.billing_stage_records;
CREATE TRIGGER billing_stage_record_links_guard
  BEFORE INSERT OR UPDATE ON public.billing_stage_records
  FOR EACH ROW EXECUTE FUNCTION public.billing_stage_record_links_guard();

-- Contract hours by canonical program slug. The same rule as
-- lib/billing/twoStage/hours.ts (expectedContractHours); the PG16 proof checks
-- that both agree for every approved syllabus.
CREATE OR REPLACE FUNCTION public.billing_contract_hours(program_slug TEXT)
RETURNS INTEGER LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE program_slug WHEN 'software-developer-professional-certificate-ibm' THEN 200 ELSE 160 END
$$;

-- Stage rules the database derives itself rather than trusting the app:
--  * new records start as drafts; supersede lineage is version + 1 of a closed
--    record in the same case and stage (the composite FK keeps case/stage);
--  * printed program, hours (billing_contract_hours) and dates come from the
--    case and the attestations;
--  * a J6 is signed only once its class has actually started (start <= today
--    in America/Chicago, the business time zone);
--  * J6 review_reasons are computed from the voucher attestation, the class
--    dates and the prior quote, and must match exactly (never trusted);
--  * every reason is a hard hold with no bypass: no review note or exception
--    clears it; it clears only when corrected structured evidence (a corrected
--    voucher attestation or class_started attestation, or a corrected
--    document) makes it disappear:
--      voucher_amount_differs   (voucher amount is not 750000 cents)
--      voucher_class_differs    (the voucher authorizes another program/class)
--      voucher_period_conflict  (class dates outside the voucher period)
--      end_date_not_contract    (actual end is not start + 5 calendar months)
--      class_differs_from_quote (J6 program/class/hours differ from the quote)
--  * signing needs the frozen recipient snapshot for exactly the stage's roles;
--  * status 'sent' requires, per required role, exactly one accepted copy
--    (provider_accepted or reconciled_delivered) matching this version, and no
--    copy of any role still pending, ambiguous or awaiting reconciliation.
CREATE OR REPLACE FUNCTION public.billing_stage_record_rules()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  case_program TEXT;
  prior_version INTEGER;
  prior_status TEXT;
  att_start DATE;
  att_end DATE;
  v_amount INTEGER;
  v_start DATE;
  v_end DATE;
  v_program TEXT;
  v_class TEXT;
  q_program TEXT;
  q_class TEXT;
  q_hours INTEGER;
  reasons TEXT[] := ARRAY[]::TEXT[];
  required_roles TEXT[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'a billing stage record starts as a draft' USING ERRCODE = '23514';
    END IF;
    IF NEW.supersedes_record_id IS NULL THEN
      IF NEW.version <> 1 THEN
        RAISE EXCEPTION 'version % must supersede version %', NEW.version, NEW.version - 1 USING ERRCODE = '23514';
      END IF;
    ELSE
      SELECT r.version, r.status INTO prior_version, prior_status FROM public.billing_stage_records r
        WHERE r.id = NEW.supersedes_record_id AND r.case_id = NEW.case_id AND r.stage = NEW.stage;
      IF prior_version IS NULL OR NEW.version <> prior_version + 1 OR prior_status NOT IN ('superseded', 'voided') THEN
        RAISE EXCEPTION 'a correction is the next version of a superseded or voided record in the same case and stage' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  SELECT c.program_slug INTO case_program FROM public.billing_cases c WHERE c.id = NEW.case_id;
  IF NEW.content #>> '{training,programSlug}' IS DISTINCT FROM case_program THEN
    RAISE EXCEPTION 'the document program must be the case program' USING ERRCODE = '23514';
  END IF;
  IF NEW.contact_hours IS DISTINCT FROM public.billing_contract_hours(case_program) THEN
    RAISE EXCEPTION 'contract hours for % are %', case_program, public.billing_contract_hours(case_program) USING ERRCODE = '23514';
  END IF;

  required_roles := CASE NEW.stage WHEN 'j5' THEN ARRAY['counselor', 'student'] ELSE ARRAY['finance', 'counselor', 'student'] END;

  IF NEW.stage = 'j5' THEN
    SELECT a.class_start_date INTO att_start FROM public.billing_attestations a WHERE a.id = NEW.readiness_attestation_id;
    IF NEW.class_start_date IS DISTINCT FROM att_start
       OR NEW.class_end_date IS DISTINCT FROM (NEW.class_start_date + interval '5 months')::date THEN
      RAISE EXCEPTION 'a J5 quotes the confirmed start and start + 5 calendar months' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT a.class_start_date, a.class_end_date INTO att_start, att_end FROM public.billing_attestations a WHERE a.id = NEW.class_start_attestation_id;
    IF NEW.class_start_date IS DISTINCT FROM att_start OR NEW.class_end_date IS DISTINCT FROM att_end THEN
      RAISE EXCEPTION 'a J6 prints the attested actual class dates' USING ERRCODE = '23514';
    END IF;
    SELECT a.authorized_amount_cents, a.authorized_start_date, a.authorized_end_date, a.authorized_program_slug, a.authorized_class_name
      INTO v_amount, v_start, v_end, v_program, v_class
      FROM public.billing_attestations a WHERE a.id = NEW.voucher_attestation_id;
    IF v_amount IS DISTINCT FROM NEW.amount_cents THEN
      reasons := reasons || 'voucher_amount_differs'::text;
    END IF;
    IF v_program IS DISTINCT FROM case_program OR v_class IS DISTINCT FROM NEW.class_name THEN
      reasons := reasons || 'voucher_class_differs'::text;
    END IF;
    IF v_start IS NULL OR v_end IS NULL OR NEW.class_start_date < v_start OR NEW.class_end_date > v_end THEN
      reasons := reasons || 'voucher_period_conflict'::text;
    END IF;
    IF NEW.class_end_date <> (NEW.class_start_date + interval '5 months')::date THEN
      reasons := reasons || 'end_date_not_contract'::text;
    END IF;
    IF NEW.prior_j5_source = 'system' THEN
      SELECT r.content #>> '{training,programSlug}', r.class_name, r.contact_hours INTO q_program, q_class, q_hours
        FROM public.billing_stage_records r WHERE r.id = NEW.prior_j5_record_id;
      IF q_class IS DISTINCT FROM NEW.class_name OR q_hours IS DISTINCT FROM NEW.contact_hours OR q_program IS DISTINCT FROM case_program THEN
        reasons := reasons || 'class_differs_from_quote'::text;
      END IF;
    ELSE
      SELECT a.quoted_program_slug, a.quoted_class_name INTO q_program, q_class FROM public.billing_attestations a WHERE a.id = NEW.external_j5_attestation_id;
      IF q_program IS DISTINCT FROM case_program OR q_class IS DISTINCT FROM NEW.class_name THEN
        reasons := reasons || 'class_differs_from_quote'::text;
      END IF;
    END IF;
  END IF;

  IF (SELECT coalesce(array_agg(x ORDER BY x), ARRAY[]::TEXT[]) FROM unnest(coalesce(NEW.review_reasons, ARRAY[]::TEXT[])) x)
     IS DISTINCT FROM (SELECT coalesce(array_agg(x ORDER BY x), ARRAY[]::TEXT[]) FROM unnest(reasons) x) THEN
    RAISE EXCEPTION 'review_reasons must be exactly %', reasons USING ERRCODE = '23514';
  END IF;

  IF NEW.status IN ('signed', 'sent') THEN
    IF cardinality(reasons) > 0 THEN
      RAISE EXCEPTION 'the J6 is held (%): record corrected voucher or class evidence; a review note cannot clear this', reasons USING ERRCODE = '23514';
    END IF;
    IF NEW.stage = 'j6' AND NEW.class_start_date > public.billing_today() THEN
      RAISE EXCEPTION 'a J6 is signed only after the class has started (America/Chicago date)' USING ERRCODE = '23514';
    END IF;
    IF (SELECT coalesce(array_agg(p.recipient_role ORDER BY p.recipient_role), ARRAY[]::TEXT[]) FROM public.billing_stage_recipients p
        WHERE p.stage_record_id = NEW.id)
       IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(required_roles) x) THEN
      RAISE EXCEPTION 'freeze exactly the % recipients before signing', array_to_string(required_roles, ', ') USING ERRCODE = '23514';
    END IF;
    -- The frozen snapshot is exactly the recipients printed in the signed
    -- content: same (role, normalized name, normalized email) set, no extra,
    -- missing or duplicated role.
    IF (SELECT coalesce(jsonb_agg(jsonb_build_array(p.recipient_role, public.billing_normalize_name(p.recipient_name), public.billing_normalize_email(p.email))
                                  ORDER BY p.recipient_role), '[]'::jsonb)
        FROM public.billing_stage_recipients p WHERE p.stage_record_id = NEW.id)
       IS DISTINCT FROM
       (SELECT coalesce(jsonb_agg(jsonb_build_array(x ->> 'role', public.billing_normalize_name(x ->> 'name'), public.billing_normalize_email(x ->> 'email'))
                                  ORDER BY x ->> 'role', x ->> 'email', x ->> 'name'), '[]'::jsonb)
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.content -> 'recipients') = 'array' THEN NEW.content -> 'recipients' ELSE '[]'::jsonb END) x) THEN
      RAISE EXCEPTION 'the frozen recipients must equal the recipients in the signed content (role, name, email)' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.status = 'sent' AND (TG_OP = 'INSERT' OR OLD.status <> 'sent') THEN
    -- Per role: exactly one accepted claim that matches this version's content
    -- hash, attachments and frozen address (attempt numbers may differ across
    -- roles); and no claim of any role still unresolved.
    IF EXISTS (
        SELECT 1 FROM unnest(required_roles) AS req(role)
        WHERE (SELECT count(*) FROM public.billing_stage_sends s
               JOIN public.billing_stage_recipients p ON p.stage_record_id = s.stage_record_id AND p.recipient_role = s.recipient_role
               WHERE s.stage_record_id = NEW.id AND s.recipient_role = req.role
                 AND s.status IN ('provider_accepted', 'reconciled_delivered')
                 AND s.content_sha256 = NEW.content_sha256 AND s.email = p.email
                 AND s.attachment_sha256s = public.billing_stage_expected_attachments(NEW.id)) <> 1)
       OR EXISTS (SELECT 1 FROM public.billing_stage_sends s
        WHERE s.stage_record_id = NEW.id AND s.status IN ('pending', 'ambiguous', 'needs_reconciliation')) THEN
      RAISE EXCEPTION 'a stage is sent only when every required recipient has one accepted copy of this version and no copy is unresolved' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS billing_stage_record_rules ON public.billing_stage_records;
CREATE TRIGGER billing_stage_record_rules
  BEFORE INSERT OR UPDATE ON public.billing_stage_records
  FOR EACH ROW EXECUTE FUNCTION public.billing_stage_record_rules();

-- The exact files every copy of a signed record carries, in order: the signed
-- PDF, then (J6) the board-signed voucher and the optional board invoice.
CREATE OR REPLACE FUNCTION public.billing_stage_expected_attachments(record_id TEXT)
RETURNS TEXT[] LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
  SELECT array_remove(ARRAY[s.sha256::text, v.sha256::text, i.sha256::text], NULL)
    FROM public.billing_stage_records r
    JOIN public.billing_artifacts s ON s.id = r.signed_artifact_id
    LEFT JOIN public.billing_artifacts v ON v.id = r.voucher_artifact_id
    LEFT JOIN public.billing_artifacts i ON i.id = r.board_invoice_artifact_id
    WHERE r.id = record_id
$$;

-- Each recipient's copy carries exactly the archived bytes of a signed record.
CREATE OR REPLACE FUNCTION public.billing_stage_send_attachments_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.billing_stage_records r WHERE r.id = NEW.stage_record_id AND r.status IN ('signed', 'sent')) THEN
    RAISE EXCEPTION 'only a signed stage record can be sent' USING ERRCODE = '23514';
  END IF;
  IF NEW.attachment_sha256s IS DISTINCT FROM public.billing_stage_expected_attachments(NEW.stage_record_id) THEN
    RAISE EXCEPTION 'a send must attach exactly the archived signed bytes' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS billing_stage_send_attachments_guard ON public.billing_stage_sends;
CREATE TRIGGER billing_stage_send_attachments_guard
  BEFORE INSERT OR UPDATE OF attachment_sha256s, stage_record_id ON public.billing_stage_sends
  FOR EACH ROW EXECUTE FUNCTION public.billing_stage_send_attachments_guard();

-- --------------------------------------------- RLS and browser privileges
ALTER TABLE public.billing_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_attestations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_signer_delegations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_stage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_stage_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_stage_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_delivery_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.billing_cases, public.billing_artifacts, public.billing_attestations,
  public.billing_signer_delegations, public.billing_stage_records, public.billing_stage_sends,
  public.billing_payment_events, public.billing_stage_recipients, public.billing_delivery_events FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_payment_event_j6_only(), public.billing_append_only(),
  public.billing_case_identity_guard(), public.billing_stage_record_guard(),
  public.billing_stage_send_guard(), public.billing_stage_record_links_guard(),
  public.billing_stage_send_attachments_guard(), public.billing_stage_record_rules(),
  public.billing_stage_recipient_guard(), public.billing_contract_hours(TEXT),
  public.billing_chicago_date(TIMESTAMPTZ), public.billing_today(), public.billing_send_statuses(),
  public.billing_delivery_event_kinds(), public.billing_delivery_event_guard(), public.billing_attestation_dates_guard(),
  public.billing_stage_expected_attachments(TEXT), public.billing_sent_on(TIMESTAMP),
  public.billing_normalize_email(TEXT), public.billing_normalize_name(TEXT) FROM PUBLIC;

DO $$
DECLARE
  browser_role TEXT;
BEGIN
  FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = browser_role) THEN
      EXECUTE format(
        'REVOKE ALL ON TABLE public.billing_cases, public.billing_artifacts, public.billing_attestations, '
        'public.billing_signer_delegations, public.billing_stage_records, public.billing_stage_sends, '
        'public.billing_payment_events, public.billing_stage_recipients, public.billing_delivery_events FROM %I', browser_role);
      EXECUTE format(
        'REVOKE ALL ON FUNCTION public.billing_payment_event_j6_only(), public.billing_append_only(), '
        'public.billing_case_identity_guard(), public.billing_stage_record_guard(), '
        'public.billing_stage_send_guard(), public.billing_stage_record_links_guard(), '
        'public.billing_stage_send_attachments_guard(), public.billing_stage_record_rules(), '
        'public.billing_stage_recipient_guard(), public.billing_contract_hours(TEXT), '
        'public.billing_chicago_date(TIMESTAMPTZ), public.billing_today(), public.billing_send_statuses(), '
        'public.billing_delivery_event_kinds(), public.billing_delivery_event_guard(), public.billing_attestation_dates_guard(), '
        'public.billing_stage_expected_attachments(TEXT), public.billing_sent_on(TIMESTAMP), '
        'public.billing_normalize_email(TEXT), public.billing_normalize_name(TEXT) FROM %I', browser_role);
    END IF;
  END LOOP;
END;
$$;

-- Server-side consumers: same convention as #2701 (training_billing_packets):
-- service_role gets SELECT/INSERT/UPDATE/DELETE (no TRUNCATE, REFERENCES or
-- TRIGGER; TRUNCATE would bypass the row triggers) and EXECUTE on the helpers
-- that CHECK constraints and trigger bodies call in the invoker's context.
-- The triggers still guard every row it writes. Prisma connects as the owner.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON TABLE public.billing_cases, public.billing_artifacts, public.billing_attestations,
      public.billing_signer_delegations, public.billing_stage_records, public.billing_stage_sends,
      public.billing_payment_events, public.billing_stage_recipients, public.billing_delivery_events FROM service_role;
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.billing_cases, public.billing_artifacts, public.billing_attestations,
      public.billing_signer_delegations, public.billing_stage_records, public.billing_stage_sends,
      public.billing_payment_events, public.billing_stage_recipients, public.billing_delivery_events TO service_role;
    GRANT EXECUTE ON FUNCTION public.billing_contract_hours(TEXT), public.billing_chicago_date(TIMESTAMPTZ),
      public.billing_today(), public.billing_send_statuses(), public.billing_delivery_event_kinds(),
      public.billing_stage_expected_attachments(TEXT), public.billing_sent_on(TIMESTAMP),
      public.billing_normalize_email(TEXT), public.billing_normalize_name(TEXT) TO service_role;
  END IF;
END;
$$;

COMMIT;
