-- Recorded J6 differences are notes for the signer. They never block signing,
-- so a signed or sent row may keep review_required with no clearance fields.
-- The app never writes review_cleared_at. The other two clauses stay exactly
-- as 20260927230000 wrote them: clearance fields are all empty or all set, and
-- review_required matches whether review_reasons is non-empty.
-- Apply after 20261110194500_billing_j6_signed_j5_and_review_notes.

ALTER TABLE public.billing_stage_records DROP CONSTRAINT "billing_stage_records_review_check";

ALTER TABLE public.billing_stage_records ADD CONSTRAINT "billing_stage_records_review_check" CHECK (coalesce((
  (("review_cleared_at" IS NULL AND "review_cleared_by_subject_id" IS NULL AND "review_note" IS NULL)
    OR ("review_required" AND "review_cleared_at" IS NOT NULL AND "review_cleared_by_subject_id" IS NOT NULL
      AND btrim(coalesce("review_note", '')) <> ''))
  AND ("review_required" = (cardinality(coalesce("review_reasons", ARRAY[]::TEXT[])) > 0))
), false));

COMMENT ON CONSTRAINT "billing_stage_records_review_check" ON public.billing_stage_records IS
  'review_reasons are derived by billing_stage_record_rules() and must match review_required. Recorded reasons are notes for the signer and never block signing; clearance fields are all empty or all set.';

COMMENT ON CONSTRAINT "billing_stage_records_review_check" ON public.billing_stage_records IS
  'review_reasons are derived by billing_stage_record_rules() and must match review_required. Recorded reasons are notes for the signer and never block signing; clearance fields are all empty or all set.';
