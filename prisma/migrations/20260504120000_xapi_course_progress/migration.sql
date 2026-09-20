-- xAPI storage, per-course progress, and program-level rollup for training pipeline

CREATE TABLE "xapi_statements" (
    "id" TEXT NOT NULL,
    "statement_id" TEXT,
    "actor_email" TEXT,
    "verb" TEXT NOT NULL,
    "course_id" TEXT,
    "course_name" TEXT,
    "result_score_scaled" DOUBLE PRECISION,
    "result_score_raw" DOUBLE PRECISION,
    "result_completion" BOOLEAN,
    "result_success" BOOLEAN,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "xapi_statements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "xapi_statements_statement_id_key" ON "xapi_statements"("statement_id");

CREATE INDEX "xapi_statements_actor_email_idx" ON "xapi_statements"("actor_email");

CREATE INDEX "xapi_statements_created_at_idx" ON "xapi_statements"("created_at");

CREATE TYPE "course_progress_status" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

CREATE TABLE "course_progress" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "program_slug" TEXT NOT NULL,
    "course_id" TEXT,
    "course_slug" TEXT NOT NULL,
    "status" "course_progress_status" NOT NULL DEFAULT 'NOT_STARTED',
    "percent_complete" INTEGER NOT NULL DEFAULT 0,
    "score_scaled" DOUBLE PRECISION,
    "score_raw" DOUBLE PRECISION,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "last_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_progress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "course_progress_user_id_program_slug_course_slug_key" ON "course_progress"("user_id", "program_slug", "course_slug");

CREATE INDEX "course_progress_user_id_idx" ON "course_progress"("user_id");

CREATE INDEX "course_progress_program_slug_idx" ON "course_progress"("program_slug");

ALTER TABLE "course_progress" ADD CONSTRAINT "course_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "member_program_progress" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "program_slug" TEXT NOT NULL,
    "courses_completed" INTEGER NOT NULL DEFAULT 0,
    "average_percent" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_program_progress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "member_program_progress_user_id_program_slug_key" ON "member_program_progress"("user_id", "program_slug");

CREATE INDEX "member_program_progress_user_id_idx" ON "member_program_progress"("user_id");

ALTER TABLE "member_program_progress" ADD CONSTRAINT "member_program_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
