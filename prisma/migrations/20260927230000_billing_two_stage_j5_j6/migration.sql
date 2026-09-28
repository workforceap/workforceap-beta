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
    -- Bytes live in the private finance bucket (BILLING_FINANCE_BUCKET, default
    -- billing-finance; provisioned separately) under a server-generated,
    -- content-addressed key; never a member or public bucket, never a member prefix.
    CONSTRAINT "billing_artifacts_storage_check" CHECK (coalesce((
      "byte_length" BETWEEN 1 AND 10485760
      AND "sha256" ~ '^[0-9a-f]{64}$'
      AND btrim("storage_bucket") <> '' AND "storage_bucket" NOT IN ('member-resumes', 'member-files', 'employer-logos')
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

-- ------------------------------------------ amount exceptions (hook)
-- A higher-authority exception accepting a voucher whose authorized amount
-- differs from the $7,500.00 quote. Model hook only: disabled in code
-- (AMOUNT_EXCEPTION_ENABLED = false) and no UI creates one. A staff review
-- note can never clear a money mismatch; only a corrected voucher
-- attestation or one of these (approved by the J6 signer) can.
CREATE TABLE IF NOT EXISTS "billing_amount_exceptions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "voucher_attestation_id" TEXT NOT NULL,
    "accepted_amount_cents" INTEGER NOT NULL,
    "evidence_artifact_id" TEXT NOT NULL,
    "approval_reference" TEXT NOT NULL,
    "approved_by_subject_id" TEXT NOT NULL,
    "approved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_amount_exceptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "billing_amount_exceptions_case_id_organization_id_fkey" FOREIGN KEY ("case_id", "organization_id") REFERENCES "billing_cases"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "billing_amount_exceptions_voucher_attestation_id_case_id_fkey" FOREIGN KEY ("voucher_attestation_id", "case_id") REFERENCES "billing_attestations"("id", "case_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "billing_amount_exceptions_evidence_artifact_id_case_id_fkey" FOREIGN KEY ("evidence_artifact_id", "case_id") REFERENCES "billing_artifacts"("id", "case_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "billing_amount_exceptions_check" CHECK (coalesce((
      "accepted_amount_cents" > 0 AND btrim("approval_reference") <> '' AND btrim("approved_by_subject_id") <> ''
    ), false))
);
CREATE UNIQUE INDEX IF NOT EXISTS "billing_amount_exceptions_id_case_id_key" ON "billing_amount_exceptions"("id", "case_id");

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
    "amount_exception_id" TEXT,
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
    "created_by_subject_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_stage_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "billing_stage_records_case_id_organization_id_fkey" FOREIGN KEY ("case_id", "organization_id") REFERENCES "billing_cases"("id", "organization_id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "billing_stage_records_amount_exception_id_case_id_fkey" FOREIGN KEY ("amount_exception_id", "case_id") REFERENCES "billing_amount_exceptions"("id", "case_id") ON DELETE RESTRICT ON UPDATE NO ACTION,
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
    -- attestations and must match exactly. A recorded staff review is needed to
    -- sign with any reason; it never unlocks a money or class mismatch (see rules).
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
      OR ("status" = 'superseded' AND "superseded_at" IS NOT NULL AND "signed_at" IS NOT NULL AND "voided_at" IS NULL)
      OR ("status" = 'voided' AND "voided_at" IS NOT NULL AND "superseded_at" IS NULL)
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
    "sent_at" TIMESTAMP(3),
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
      AND "status" IN ('claimed', 'sent', 'rejected_definite', 'ambiguous', 'needs_reconciliation', 'reconciled_delivered', 'reconciled_not_delivered')
      -- sent = provider acceptance evidence; manual reconciliation is its own audited status.
      AND ("status" <> 'sent' OR ("sent_at" IS NOT NULL AND btrim(coalesce("provider_message_id", '')) <> ''))
      AND ("status" NOT IN ('reconciled_delivered', 'reconciled_not_delivered')
        OR ("reconciled_by_subject_id" IS NOT NULL AND "reconciled_at" IS NOT NULL AND btrim(coalesce("reconcile_note", '')) <> ''))
    ), false))
);
CREATE UNIQUE INDEX IF NOT EXISTS "billing_stage_sends_idempotency_key_key" ON "billing_stage_sends"("idempotency_key");
CREATE UNIQUE INDEX IF NOT EXISTS "billing_stage_sends_stage_record_id_stage_attempt_no_recipi_key" ON "billing_stage_sends"("stage_record_id", "stage", "attempt_no", "recipient_role");

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
-- evidence (sent_at plus a delivered copy for finance, counselor and student),
-- not by its current status: a sent J6 later superseded by a corrected cover
-- letter still reconciles a payment that arrives afterwards.
CREATE OR REPLACE FUNCTION public.billing_payment_event_j6_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.billing_stage_records r
    WHERE r.id = NEW.j6_record_id AND r.case_id = NEW.case_id AND r.stage = 'j6'
      AND r.sent_at IS NOT NULL AND r.status IN ('sent', 'superseded')
      AND (SELECT count(DISTINCT s.recipient_role) FROM public.billing_stage_sends s
           WHERE s.stage_record_id = r.id AND s.status IN ('sent', 'reconciled_delivered')
             AND s.recipient_role IN ('finance', 'counselor', 'student')) = 3
  ) THEN
    RAISE EXCEPTION 'payment status is tracked only for a J6 that was sent to finance, counselor and student' USING ERRCODE = '23514';
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
DROP TRIGGER IF EXISTS billing_amount_exceptions_append_only ON public.billing_amount_exceptions;
CREATE TRIGGER billing_amount_exceptions_append_only
  BEFORE UPDATE OR DELETE ON public.billing_amount_exceptions
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
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.subject_member_id IS DISTINCT FROM OLD.subject_member_id
     OR NEW.program_slug IS DISTINCT FROM OLD.program_slug
     OR NEW.created_by_subject_id IS DISTINCT FROM OLD.created_by_subject_id THEN
    RAISE EXCEPTION 'billing case identity is immutable' USING ERRCODE = '23514';
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
    OR NEW.class_name IS DISTINCT FROM OLD.class_name OR NEW.amount_exception_id IS DISTINCT FROM OLD.amount_exception_id
    OR NEW.readiness_attestation_id IS DISTINCT FROM OLD.readiness_attestation_id
    OR NEW.class_start_attestation_id IS DISTINCT FROM OLD.class_start_attestation_id
    OR NEW.voucher_artifact_id IS DISTINCT FROM OLD.voucher_artifact_id
    OR NEW.voucher_attestation_id IS DISTINCT FROM OLD.voucher_attestation_id
    OR NEW.board_invoice_artifact_id IS DISTINCT FROM OLD.board_invoice_artifact_id
    OR NEW.signed_at IS DISTINCT FROM OLD.signed_at OR NEW.signed_by_subject_id IS DISTINCT FROM OLD.signed_by_subject_id
    OR NEW.signature_method IS DISTINCT FROM OLD.signature_method OR NEW.signer_intent IS DISTINCT FROM OLD.signer_intent
    OR NEW.signed_via_delegation_id IS DISTINCT FROM OLD.signed_via_delegation_id
    OR NEW.signed_artifact_id IS DISTINCT FROM OLD.signed_artifact_id
    OR (OLD.sent_at IS NOT NULL AND NEW.sent_at IS DISTINCT FROM OLD.sent_at)
    OR (OLD.send_receipt IS NOT NULL AND NEW.send_receipt IS DISTINCT FROM OLD.send_receipt)) THEN
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
-- Send rows: a copy starts as `claimed`; identity is fixed; settled rows are
-- final; rows are never deleted. Manual reconciliation is a distinct audited
-- path, allowed only from an unknown outcome (ambiguous / needs_reconciliation).
CREATE OR REPLACE FUNCTION public.billing_stage_send_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'billing send rows are never deleted' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'claimed' THEN
      RAISE EXCEPTION 'a billing send starts as claimed' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.stage_record_id IS DISTINCT FROM OLD.stage_record_id OR NEW.stage IS DISTINCT FROM OLD.stage
     OR NEW.attempt_no IS DISTINCT FROM OLD.attempt_no OR NEW.recipient_role IS DISTINCT FROM OLD.recipient_role
     OR NEW.email IS DISTINCT FROM OLD.email OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key THEN
    RAISE EXCEPTION 'billing send identity is immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD.status IN ('sent', 'rejected_definite', 'reconciled_delivered', 'reconciled_not_delivered') THEN
    RAISE EXCEPTION 'a settled billing send is final' USING ERRCODE = '23514';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'claimed' AND NEW.status IN ('sent', 'rejected_definite', 'ambiguous', 'needs_reconciliation'))
    OR (OLD.status = 'ambiguous' AND NEW.status IN ('claimed', 'sent', 'rejected_definite', 'needs_reconciliation', 'reconciled_delivered', 'reconciled_not_delivered'))
    OR (OLD.status = 'needs_reconciliation' AND NEW.status IN ('reconciled_delivered', 'reconciled_not_delivered'))) THEN
    RAISE EXCEPTION 'billing send status cannot move from % to %', OLD.status, NEW.status USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS billing_stage_send_guard ON public.billing_stage_sends;
CREATE TRIGGER billing_stage_send_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.billing_stage_sends
  FOR EACH ROW EXECUTE FUNCTION public.billing_stage_send_guard();

-- The recipient snapshot changes only while its record is a draft.
CREATE OR REPLACE FUNCTION public.billing_stage_recipient_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  rec_id TEXT := CASE WHEN TG_OP = 'DELETE' THEN OLD.stage_record_id ELSE NEW.stage_record_id END;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.stage_record_id IS DISTINCT FROM OLD.stage_record_id OR NEW.recipient_role IS DISTINCT FROM OLD.recipient_role) THEN
    RAISE EXCEPTION 'a recipient row cannot move' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.billing_stage_records r WHERE r.id = rec_id AND r.status = 'draft') THEN
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

-- Stage rules the database derives itself rather than trusting the app:
--  * new records start as drafts; supersede lineage is version + 1 of a closed
--    record in the same case and stage (the composite FK keeps case/stage);
--  * printed program and dates come from the case and the attestations;
--  * J6 review_reasons are computed from the voucher attestation, the class
--    dates and the prior quote, and must match exactly (never trusted);
--  * blocking reasons can never be cleared by a review note:
--      voucher_amount_differs   (only a corrected voucher attestation, or the
--                                disabled signer-approved amount exception)
--      voucher_class_differs    (the voucher authorizes another program/class)
--      class_differs_from_quote (J6 program/class/hours differ from the quote)
--    clearable by an audited review: voucher_period_conflict, end_date_not_contract;
--  * signing needs the frozen recipient snapshot for exactly the stage's roles;
--  * status 'sent' requires a delivered copy (sent or reconciled_delivered) for
--    every required role and no copy still claimed, ambiguous or unreconciled.
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
  IF NEW.amount_exception_id IS NOT NULL AND NOT ('voucher_amount_differs' = ANY(reasons)) THEN
    RAISE EXCEPTION 'an amount exception applies only to a voucher amount mismatch' USING ERRCODE = '23514';
  END IF;

  IF NEW.status IN ('signed', 'sent') THEN
    IF 'class_differs_from_quote' = ANY(reasons) OR 'voucher_class_differs' = ANY(reasons) THEN
      RAISE EXCEPTION 'the J6 program or class differs from the quote or the voucher; issue a corrected document instead' USING ERRCODE = '23514';
    END IF;
    IF 'voucher_amount_differs' = ANY(reasons) AND NOT EXISTS (
        SELECT 1 FROM public.billing_amount_exceptions e
        WHERE e.id = NEW.amount_exception_id AND e.case_id = NEW.case_id
          AND e.voucher_attestation_id = NEW.voucher_attestation_id
          AND e.accepted_amount_cents = v_amount
          AND e.approved_by_subject_id = NEW.signed_by_subject_id) THEN
      RAISE EXCEPTION 'the voucher amount differs from the quote: record a corrected voucher attestation (a review note cannot clear this)' USING ERRCODE = '23514';
    END IF;
    IF (SELECT coalesce(array_agg(p.recipient_role ORDER BY p.recipient_role), ARRAY[]::TEXT[]) FROM public.billing_stage_recipients p
        WHERE p.stage_record_id = NEW.id)
       IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(required_roles) x) THEN
      RAISE EXCEPTION 'freeze exactly the % recipients before signing', array_to_string(required_roles, ', ') USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.status = 'sent' AND (TG_OP = 'INSERT' OR OLD.status <> 'sent') THEN
    IF (SELECT count(DISTINCT s.recipient_role) FROM public.billing_stage_sends s
        WHERE s.stage_record_id = NEW.id AND s.status IN ('sent', 'reconciled_delivered')
          AND s.recipient_role = ANY(required_roles)) <> cardinality(required_roles)
       OR EXISTS (SELECT 1 FROM public.billing_stage_sends s
        WHERE s.stage_record_id = NEW.id AND s.status IN ('claimed', 'ambiguous', 'needs_reconciliation')) THEN
      RAISE EXCEPTION 'a stage is sent only when every required recipient has a delivered copy and none is unsettled' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS billing_stage_record_rules ON public.billing_stage_records;
CREATE TRIGGER billing_stage_record_rules
  BEFORE INSERT OR UPDATE ON public.billing_stage_records
  FOR EACH ROW EXECUTE FUNCTION public.billing_stage_record_rules();

-- Each recipient's copy carries exactly the archived bytes: the signed PDF,
-- then (J6) the board-signed voucher and the optional board invoice.
CREATE OR REPLACE FUNCTION public.billing_stage_send_attachments_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  expected TEXT[];
BEGIN
  SELECT array_remove(ARRAY[s.sha256::text, v.sha256::text, i.sha256::text], NULL) INTO expected
    FROM public.billing_stage_records r
    JOIN public.billing_artifacts s ON s.id = r.signed_artifact_id
    LEFT JOIN public.billing_artifacts v ON v.id = r.voucher_artifact_id
    LEFT JOIN public.billing_artifacts i ON i.id = r.board_invoice_artifact_id
    WHERE r.id = NEW.stage_record_id AND r.status IN ('signed', 'sent');
  IF expected IS NULL THEN
    RAISE EXCEPTION 'only a signed stage record can be sent' USING ERRCODE = '23514';
  END IF;
  IF NEW.attachment_sha256s IS DISTINCT FROM expected THEN
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
ALTER TABLE public.billing_amount_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_stage_recipients ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.billing_cases, public.billing_artifacts, public.billing_attestations,
  public.billing_signer_delegations, public.billing_stage_records, public.billing_stage_sends,
  public.billing_payment_events, public.billing_amount_exceptions, public.billing_stage_recipients FROM PUBLIC;
REVOKE ALL ON FUNCTION public.billing_payment_event_j6_only(), public.billing_append_only(),
  public.billing_case_identity_guard(), public.billing_stage_record_guard(),
  public.billing_stage_send_guard(), public.billing_stage_record_links_guard(),
  public.billing_stage_send_attachments_guard(), public.billing_stage_record_rules(),
  public.billing_stage_recipient_guard() FROM PUBLIC;

DO $$
DECLARE
  browser_role TEXT;
BEGIN
  FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = browser_role) THEN
      EXECUTE format(
        'REVOKE ALL ON TABLE public.billing_cases, public.billing_artifacts, public.billing_attestations, '
        'public.billing_signer_delegations, public.billing_stage_records, public.billing_stage_sends, '
        'public.billing_payment_events, public.billing_amount_exceptions, public.billing_stage_recipients FROM %I', browser_role);
      EXECUTE format(
        'REVOKE ALL ON FUNCTION public.billing_payment_event_j6_only(), public.billing_append_only(), '
        'public.billing_case_identity_guard(), public.billing_stage_record_guard(), '
        'public.billing_stage_send_guard(), public.billing_stage_record_links_guard(), '
        'public.billing_stage_send_attachments_guard(), public.billing_stage_record_rules(), '
        'public.billing_stage_recipient_guard() FROM %I', browser_role);
    END IF;
  END LOOP;
END;
$$;

COMMIT;
