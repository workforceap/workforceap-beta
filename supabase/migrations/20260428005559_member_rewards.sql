-- CreateTable: member_points (one row per member, tracks total + level)
CREATE TABLE "member_points" (
    "id"           TEXT NOT NULL,
    "user_id"      TEXT NOT NULL,
    "total_points" INTEGER NOT NULL DEFAULT 0,
    "level"        TEXT NOT NULL DEFAULT 'starter',
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable: points_transactions (immutable log, idempotent per user+event+entity)
CREATE TABLE "points_transactions" (
    "id"          TEXT NOT NULL,
    "user_id"     TEXT NOT NULL,
    "event"       TEXT NOT NULL,
    "entity_id"   TEXT NOT NULL DEFAULT '',
    "points"      INTEGER NOT NULL,
    "note"        TEXT,
    "awarded_by"  TEXT,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "points_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "member_points_user_id_key" ON "member_points"("user_id");
CREATE UNIQUE INDEX "points_transactions_user_id_event_entity_id_key" ON "points_transactions"("user_id", "event", "entity_id");
CREATE INDEX "points_transactions_user_id_idx" ON "points_transactions"("user_id");
CREATE INDEX "points_transactions_created_at_idx" ON "points_transactions"("created_at");

-- AddForeignKey
ALTER TABLE "member_points" ADD CONSTRAINT "member_points_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "points_transactions" ADD CONSTRAINT "points_transactions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "points_transactions" ADD CONSTRAINT "points_transactions_awarded_by_fkey"
    FOREIGN KEY ("awarded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;