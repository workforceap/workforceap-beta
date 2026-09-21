-- WAP-76 / WAP-181: move stored course_progress rows onto the course keys that
-- #2421 and #2425 introduced in code without a data migration.
--
-- WHAT WENT WRONG
-- ---------------
-- `mkProgram` keys a syllabus course by the Coursera catalog slug it binds to,
-- and falls back to the synthetic `<program>-course-N` when nothing binds.
-- #2421 ("credit renamed IBM courses") and #2425 ("number audit batch 4") gave
-- thirteen syllabus rows an explicit Coursera id/slug so real completions would
-- credit. Both changed computation going forward -- which is correct and is not
-- revisited here -- but neither moved the rows already stored under the old
-- synthetic keys. `course_progress` is UNIQUE (user_id, program_slug,
-- course_slug), so each of those rows is now orphaned from its program's course
-- list: the member finished the course and the portal shows nothing.
--
-- The mapping below is generated from lib/content/coursera/courseSlugRemap.ts,
-- which lib/content/coursera/courseSlugRemap.test.ts re-derives from `PROGRAMS`
-- (position N in the regulated syllabus, the slug and name mkProgram produces
-- for it today). tests/migrations/wap76-course-slug-remap.mjs proves the
-- behaviour below on a disposable database, and
-- lib/content/coursera/courseSlugRemapSql.test.ts proves this file and the TS
-- table still agree.
--
-- IDEMPOTENT
-- ----------
-- After a successful run no rows remain on any source key, so a second run
-- matches nothing. The journal's unique key rejects a duplicate entry as well.
--
-- REVERSIBLE
-- ----------
-- Every change is journaled in wap_migration_backup.wap76_course_slug_remap
-- with the full pre-change row(s) as jsonb; `down.sql` in this directory
-- replays the journal and restores the exact preimage, including rows that were
-- merged into an existing destination. The backup schema is deliberately
-- outside `public` so Prisma neither manages nor drops it.
--
-- DELETES NOTHING that is not first copied into the journal.

CREATE SCHEMA IF NOT EXISTS wap_migration_backup;

CREATE TABLE IF NOT EXISTS wap_migration_backup.wap76_course_slug_remap (
  id               bigserial PRIMARY KEY,
  migrated_at      timestamptz NOT NULL DEFAULT now(),
  action           text NOT NULL CHECK (action IN ('renamed', 'merged')),
  user_id          text NOT NULL,
  program_slug     text NOT NULL,
  from_course_slug text NOT NULL,
  to_course_slug   text NOT NULL,
  -- Populated for 'merged' only: the verbatim pre-merge rows.
  source_row       jsonb,
  target_row       jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS wap76_course_slug_remap_row_key
  ON wap_migration_backup.wap76_course_slug_remap (user_id, program_slug, from_course_slug);

DO $wap76$
DECLARE
  mapping   record;
  src       public.course_progress%ROWTYPE;
  tgt       public.course_progress%ROWTYPE;
  merged_completed boolean;
BEGIN
  FOR mapping IN
    WITH remap(program_slug, from_course_slug, to_course_slug, course_name) AS (VALUES
      -- #2421 -- the two IBM rows whose regulated title never equalled Coursera's.
      ('software-developer-professional-certificate-ibm', 'software-developer-professional-certificate-ibm-course-2',  'introduction-to-ai',                                        'Introduction to Artificial Intelligence'),
      ('software-developer-professional-certificate-ibm', 'software-developer-professional-certificate-ibm-course-4',  'generative-ai-prompt-engineering-for-everyone',             'Generative AI: Prompt Engineering'),
      -- #2425 -- CompTIA A+ #5 and #9.
      ('comptia-a-professional-certificate',              'comptia-a-professional-certificate-course-5',               'packt-operating-systems-and-networking-fundamentals-bokjh', 'Operating Systems and Network Fundamentals'),
      ('comptia-a-professional-certificate',              'comptia-a-professional-certificate-course-9',               'practice-exam-for-comptia-a',                               'Practice Exams for CompTIA A+ Certification'),
      -- #2425 -- Digital Marketing #5.
      ('digital-marketing-e-commerce-google',             'digital-marketing-e-commerce-google-course-5',              'assess-for-success',                                        'Assess for Success: Market Analytics and Measurement'),
      -- #2425 -- the eight MCHIT publisher parentheticals.
      ('health-information-technology-mchit',             'health-information-technology-mchit-course-3',              'revenue-cycle-billing-and-coding',                          'Revenue Cycle, Billing, and Coding (Johns Hopkins)'),
      ('health-information-technology-mchit',             'health-information-technology-mchit-course-4',              'the-billing-and-collection-process',                        'The Billing and Collection Process (AAPC)'),
      ('health-information-technology-mchit',             'health-information-technology-mchit-course-5',              'medical-billing-coding-essentials',                         'Medical Billing and Coding Essentials (MedCerts)'),
      ('health-information-technology-mchit',             'health-information-technology-mchit-course-11',             'data-and-electronic-health-records',                        'Data and Electronic Health Records (Johns Hopkins)'),
      ('health-information-technology-mchit',             'health-information-technology-mchit-course-12',             'health-it-fundamentals',                                    'Health Information Technology Fundamentals (Johns Hopkins)'),
      ('health-information-technology-mchit',             'health-information-technology-mchit-course-13',             'telehealth',                                                'Foundations of Telehealth (Johns Hopkins)'),
      ('health-information-technology-mchit',             'health-information-technology-mchit-course-14',             'medical-administrative-assistants-and-office-procedures',   'Medical Administrative Assistants and Office Procedures (MedCerts)'),
      ('health-information-technology-mchit',             'health-information-technology-mchit-course-15',             'introduction-to-certified-professional-biller',             'Introduction to Certified Professional Biller (AAPC)')
    ),
    -- Stored rows may carry a legacy program key; PROGRAM_SLUG_ALIASES in
    -- lib/content/programSlug.ts is the same list, and the TS test pins it.
    program_alias(canonical, stored) AS (VALUES
      ('software-developer-professional-certificate-ibm', 'software-developer-professional-certificate-ibm'),
      ('software-developer-professional-certificate-ibm', 'ai-and-software-development-professional-certificate-ibm'),
      ('comptia-a-professional-certificate',              'comptia-a-professional-certificate'),
      ('comptia-a-professional-certificate',              'comptia-a-plus'),
      ('digital-marketing-e-commerce-google',             'digital-marketing-e-commerce-google'),
      ('health-information-technology-mchit',             'health-information-technology-mchit'),
      ('health-information-technology-mchit',             'medical-billing-coding-and-health-information-technology'),
      ('health-information-technology-mchit',             'medical-billing-and-coding-certificate')
    )
    SELECT a.stored AS stored_program_slug, r.from_course_slug, r.to_course_slug
    FROM remap r
    JOIN program_alias a ON a.canonical = r.program_slug
    ORDER BY a.stored, r.from_course_slug
  LOOP
    FOR src IN
      SELECT * FROM public.course_progress
      WHERE program_slug = mapping.stored_program_slug
        AND course_slug = mapping.from_course_slug
      ORDER BY id
    LOOP
      SELECT * INTO tgt FROM public.course_progress
      WHERE user_id = src.user_id
        AND program_slug = mapping.stored_program_slug
        AND course_slug = mapping.to_course_slug;

      IF NOT FOUND THEN
        -- Nothing on the destination key: the row simply moves.
        INSERT INTO wap_migration_backup.wap76_course_slug_remap
          (action, user_id, program_slug, from_course_slug, to_course_slug)
        VALUES ('renamed', src.user_id, mapping.stored_program_slug, mapping.from_course_slug, mapping.to_course_slug);

        UPDATE public.course_progress
        SET course_slug = mapping.to_course_slug
        WHERE id = src.id;
      ELSE
        -- Both keys hold a row: the member has pre-fix history on the synthetic
        -- key and post-fix activity on the real one. Merge on the same ladder
        -- scripts/canonicalize-course-progress-slugs.ts uses, keep the
        -- destination row's identity, and journal both preimages.
        INSERT INTO wap_migration_backup.wap76_course_slug_remap
          (action, user_id, program_slug, from_course_slug, to_course_slug, source_row, target_row)
        VALUES ('merged', src.user_id, mapping.stored_program_slug, mapping.from_course_slug, mapping.to_course_slug,
                to_jsonb(src), to_jsonb(tgt));

        merged_completed := (src.status = 'COMPLETED' OR tgt.status = 'COMPLETED');

        UPDATE public.course_progress SET
          status           = CASE WHEN merged_completed THEN 'COMPLETED'::public.course_progress_status
                                  WHEN src.status = 'IN_PROGRESS' OR tgt.status = 'IN_PROGRESS' THEN 'IN_PROGRESS'::public.course_progress_status
                                  ELSE 'NOT_STARTED'::public.course_progress_status END,
          percent_complete = CASE WHEN merged_completed THEN 100 ELSE GREATEST(src.percent_complete, tgt.percent_complete) END,
          progress_pct     = CASE WHEN merged_completed THEN 100 ELSE GREATEST(src.progress_pct, tgt.progress_pct) END,
          score_scaled     = GREATEST(src.score_scaled, tgt.score_scaled),
          score_raw        = GREATEST(src.score_raw, tgt.score_raw),
          started_at       = LEAST(src.started_at, tgt.started_at),
          completed_at     = CASE WHEN merged_completed THEN GREATEST(src.completed_at, tgt.completed_at) ELSE NULL END,
          last_activity_at = GREATEST(src.last_activity_at, tgt.last_activity_at),
          statement_count  = src.statement_count + tgt.statement_count,
          course_id        = COALESCE(tgt.course_id, src.course_id)
        WHERE id = tgt.id;

        DELETE FROM public.course_progress WHERE id = src.id;
      END IF;
    END LOOP;
  END LOOP;
END
$wap76$;
