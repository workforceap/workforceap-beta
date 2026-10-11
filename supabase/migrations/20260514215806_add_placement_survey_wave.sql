DO $$ BEGIN
    CREATE TYPE "placement_survey_wave" AS ENUM ('thirty_day', 'sixty_day', 'ninety_day');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "placement_surveys" ADD COLUMN IF NOT EXISTS "wave" "placement_survey_wave" NOT NULL DEFAULT 'thirty_day';

ALTER TABLE "placement_surveys" DROP CONSTRAINT IF EXISTS "placement_surveys_user_id_key";

CREATE UNIQUE INDEX IF NOT EXISTS "placement_surveys_user_id_wave_key" ON "placement_surveys"("user_id", "wave");

CREATE INDEX IF NOT EXISTS "placement_surveys_user_id_idx" ON "placement_surveys"("user_id");