-- The legacy billing packet table contains signed financial records. It is
-- still used by server-side code while the two-stage J5/J6 flow is built, but
-- neither anonymous nor signed-in browser roles need direct Data API access.
-- Keep the table and every existing row; change only its access boundary.
BEGIN;

ALTER TABLE public.training_billing_packets ENABLE ROW LEVEL SECURITY;

-- The current Prisma application connects as database owner postgres. Preserve
-- explicit CRUD for server-side service_role consumers before removing any
-- rights that were inherited from PUBLIC.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.training_billing_packets TO service_role;

REVOKE ALL PRIVILEGES
  ON TABLE public.training_billing_packets FROM PUBLIC, anon, authenticated;

-- Table-level REVOKE does not remove column grants. Revoke every browser
-- column privilege, including grants inherited through PUBLIC.
DO $migration$
DECLARE
  columns text;
BEGIN
  SELECT string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum)
    INTO columns
    FROM pg_attribute AS a
   WHERE a.attrelid = 'public.training_billing_packets'::regclass
     AND a.attnum > 0
     AND NOT a.attisdropped;

  IF columns IS NULL THEN
    RAISE EXCEPTION 'training_billing_packets has no columns; access change rolled back';
  END IF;

  EXECUTE format(
    'REVOKE ALL PRIVILEGES (%s) ON TABLE public.training_billing_packets FROM PUBLIC, anon, authenticated',
    columns
  );
END
$migration$;

-- A role inherited by anon/authenticated can reintroduce effective access
-- despite the direct REVOKEs. Abort atomically if that is the live topology.
DO $migration$
DECLARE
  browser_role text;
BEGIN
  IF NOT (SELECT c.relrowsecurity FROM pg_class AS c
          WHERE c.oid = 'public.training_billing_packets'::regclass) THEN
    RAISE EXCEPTION 'training_billing_packets RLS is not enabled';
  END IF;

  FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_table_privilege(browser_role, 'public.training_billing_packets',
      'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
      OR has_any_column_privilege(browser_role, 'public.training_billing_packets',
      'SELECT, INSERT, UPDATE, REFERENCES') THEN
      RAISE EXCEPTION 'effective training_billing_packets privilege remains for %; access change rolled back', browser_role;
    END IF;
  END LOOP;

  IF NOT (
    has_table_privilege('service_role', 'public.training_billing_packets', 'SELECT')
    AND has_table_privilege('service_role', 'public.training_billing_packets', 'INSERT')
    AND has_table_privilege('service_role', 'public.training_billing_packets', 'UPDATE')
    AND has_table_privilege('service_role', 'public.training_billing_packets', 'DELETE')
  ) THEN
    RAISE EXCEPTION 'training_billing_packets service role access is missing';
  END IF;
END
$migration$;

COMMIT;
