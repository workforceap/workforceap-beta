-- WAP-170/172 follow-through: Application.notes no longer carries screening
-- answers, so the screening row is the only home for them. An applicant who
-- answers the WS4/WS5 questions (unemployment, layoff employer, SNAP/WIC,
-- benefit programs) without completing the yes/no triad used to have those
-- answers kept only in the notes; the row must now accept a partial triad.
-- q3 was already nullable. qualifies / yes_count stay NOT NULL (0 / false when
-- the triad is absent); readers treat q1 IS NULL as "triad not answered".
ALTER TABLE "apply_eligibility_screenings" ALTER COLUMN "q1" DROP NOT NULL;
ALTER TABLE "apply_eligibility_screenings" ALTER COLUMN "q2" DROP NOT NULL;

-- Down (manual; only safe when no rows have NULL q1/q2):
--   ALTER TABLE "apply_eligibility_screenings" ALTER COLUMN "q1" SET NOT NULL;
--   ALTER TABLE "apply_eligibility_screenings" ALTER COLUMN "q2" SET NOT NULL;
