-- Persist actor.account info + full raw payload so xAPI replay can reconstruct
-- the exact statement (object.definition.type, context.extensions, etc.)
-- instead of guessing from a few flat columns. All additive + nullable so the
-- old write path (which doesn't populate these) keeps working.

ALTER TABLE xapi_statements
  ADD COLUMN IF NOT EXISTS actor_account_name TEXT,
  ADD COLUMN IF NOT EXISTS actor_home_page TEXT,
  ADD COLUMN IF NOT EXISTS payload JSONB;

CREATE INDEX IF NOT EXISTS xapi_statements_actor_account_idx
  ON xapi_statements (actor_account_name, actor_home_page)
  WHERE actor_account_name IS NOT NULL;