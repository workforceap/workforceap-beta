-- WAP-53: after "Are you receiving TANF, WIC, and/or SNAP?" = yes, capture which
-- programs and whether the applicant wants help applying. Both are additive and
-- separate from the existing snap_wic yes/no so historical rows and exports
-- keep their meaning. A help request is a staff signal, not verified enrollment.
ALTER TABLE apply_eligibility_screenings
  ADD COLUMN IF NOT EXISTS public_assistance_programs text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS public_assistance_help_requested text;
