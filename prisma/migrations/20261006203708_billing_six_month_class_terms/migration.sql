-- Six calendar months for new J5/J6 snapshots (content_version = 2).
-- Preserve v1 terms and all existing records. This replaces only the existing
-- trigger body; all authorization, signature, delivery and immutability guards
-- stay intact. Apply before deploying the app that writes content version 2.

CREATE OR REPLACE FUNCTION public.billing_stage_record_rules()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  class_months INTEGER;
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
  designated_signer TEXT;
  sig_asset_id TEXT;
  sig_asset_sha TEXT;
BEGIN
  -- V1 remains valid for historical snapshots and an old-app rollback.
  -- No stored content, dates, hashes, signatures or archive bytes are changed.
  IF NEW.content_version NOT IN (1, 2) THEN
    RAISE EXCEPTION 'unsupported billing content version' USING ERRCODE = '23514';
  END IF;
  IF NEW.content_version = 2 AND NEW.content ->> 'contentVersion' IS DISTINCT FROM '2' THEN
    RAISE EXCEPTION 'content version must match the frozen snapshot' USING ERRCODE = '23514';
  END IF;
  class_months := CASE NEW.content_version WHEN 1 THEN 5 ELSE 6 END;
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
  IF NEW.contact_hours IS DISTINCT FROM public.billing_contract_hours(case_program) THEN
    RAISE EXCEPTION 'contract hours for % are %', case_program, public.billing_contract_hours(case_program) USING ERRCODE = '23514';
  END IF;

  required_roles := CASE NEW.stage WHEN 'j5' THEN ARRAY['counselor', 'student'] ELSE ARRAY['finance', 'counselor', 'student'] END;

  IF NEW.stage = 'j5' THEN
    SELECT a.class_start_date INTO att_start FROM public.billing_attestations a WHERE a.id = NEW.readiness_attestation_id;
    IF NEW.class_start_date IS DISTINCT FROM att_start
       OR NEW.class_end_date IS DISTINCT FROM (NEW.class_start_date + make_interval(months => class_months))::date THEN
      RAISE EXCEPTION 'a J5 quotes the confirmed start and start + % calendar months', class_months USING ERRCODE = '23514';
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
    IF NEW.class_end_date <> (NEW.class_start_date + make_interval(months => class_months))::date THEN
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

  IF NEW.status IN ('signed', 'sent') THEN
    IF cardinality(reasons) > 0 THEN
      RAISE EXCEPTION 'the J6 is held (%): record corrected voucher or class evidence; a review note cannot clear this', reasons USING ERRCODE = '23514';
    END IF;
    -- J6 issue/sign date: the server date (America/Chicago) at signing, printed
    -- as content.issueDate (no caller backdating), on or after both the actual
    -- class start and the current voucher's receipt (its attested received_on
    -- and its DB-stamped upload date).
    -- Every sign (J5 and J6): the designated signer signs as himself, on the
    -- server date. Delegated signing is disabled in the database.
    IF TG_OP = 'UPDATE' AND OLD.status = 'draft' AND NEW.status = 'signed' THEN
      SELECT d.user_id INTO designated_signer FROM public.billing_designated_signers d WHERE d.organization_id = NEW.organization_id;
      IF designated_signer IS NULL THEN
        RAISE EXCEPTION 'SIGNER_PRINCIPAL_UNSET: no signer is designated for this organization; signing stays closed' USING ERRCODE = '23514';
      END IF;
      IF NEW.signed_by_subject_id IS DISTINCT FROM designated_signer THEN
        RAISE EXCEPTION 'SIGNER_NOT_DESIGNATED: only the designated signer signs' USING ERRCODE = '23514';
      END IF;
      IF NEW.signed_via_delegation_id IS NOT NULL THEN
        RAISE EXCEPTION 'SIGNER_DELEGATION_DISABLED: delegated signing is disabled' USING ERRCODE = '23514';
      END IF;
      -- The signed content freezes the designated signer's one active signature
      -- asset (id and sha256). FOR SHARE: a concurrent revoke waits for this sign,
      -- or (revoke first) this sign sees no active asset. A later revoke or
      -- replacement never alters this record: it keeps the frozen hash.
      SELECT s.id, s.sha256 INTO sig_asset_id, sig_asset_sha FROM public.billing_signer_signature_assets s
        WHERE s.organization_id = NEW.organization_id AND s.signer_user_id = designated_signer AND s.revoked_at IS NULL
        FOR SHARE;
      IF sig_asset_sha IS NULL THEN
        RAISE EXCEPTION 'SIGNATURE_ASSET_MISSING: the designated signer has no active approved signature image; signing stays closed' USING ERRCODE = '23514';
      END IF;
      IF NEW.content #>> '{signature,assetSha256}' IS DISTINCT FROM sig_asset_sha::text
         OR NEW.content #>> '{signature,assetId}' IS DISTINCT FROM sig_asset_id
         OR NEW.signature_method IS DISTINCT FROM 'approved_image' THEN
        RAISE EXCEPTION 'SIGNATURE_ASSET_MISMATCH: content.signature must freeze the active signature asset (assetId, assetSha256), signed with signature_method approved_image' USING ERRCODE = '23514';
      END IF;
      IF NEW.stage = 'j5' AND NEW.content ->> 'issueDate' IS DISTINCT FROM to_char(public.billing_today(), 'YYYY-MM-DD') THEN
        RAISE EXCEPTION 'J5_ISSUE_DATE_NOT_SERVER_DATE: a J5 is issued on the server date it is signed (America/Chicago)' USING ERRCODE = '23514';
      END IF;
    END IF;
    IF NEW.stage = 'j6' AND TG_OP = 'UPDATE' AND OLD.status = 'draft' AND NEW.status = 'signed' THEN
      IF NEW.content ->> 'issueDate' IS DISTINCT FROM to_char(public.billing_today(), 'YYYY-MM-DD') THEN
        RAISE EXCEPTION 'J6_ISSUE_DATE_NOT_SERVER_DATE: a J6 is issued on the server date it is signed (America/Chicago)' USING ERRCODE = '23514';
      END IF;
      -- Defence in depth: both receipt dates are already capped at today (the
      -- attestation dates guard and the DB-stamped upload time), so this only
      -- fires if those guards were bypassed; kept deliberately.
      IF EXISTS (SELECT 1 FROM public.billing_artifacts f JOIN public.billing_attestations a ON a.id = NEW.voucher_attestation_id
                 WHERE f.id = NEW.voucher_artifact_id
                   AND (public.billing_sent_on(f.created_at) > public.billing_today() OR a.received_on > public.billing_today())) THEN
        RAISE EXCEPTION 'J6_SIGNED_BEFORE_VOUCHER_RECEIPT: a J6 is signed only on or after the voucher was received' USING ERRCODE = '23514';
      END IF;
    END IF;
    IF NEW.stage = 'j6' AND NEW.class_start_date > public.billing_today() THEN
      RAISE EXCEPTION 'J6_SIGNED_BEFORE_CLASS_START: a J6 is signed only after the class has started (America/Chicago date)' USING ERRCODE = '23514';
    END IF;
    -- The frozen letterhead footer is exactly the confirmed WAP footer facts.
    IF jsonb_build_object('website', NEW.content #>> '{letterhead,footer,website}', 'phone', NEW.content #>> '{letterhead,footer,phone}',
                          'address', NEW.content #>> '{letterhead,footer,address}') IS DISTINCT FROM public.billing_letterhead_footer() THEN
      RAISE EXCEPTION 'LETTERHEAD_FOOTER_MISMATCH: the signed content must print the WAP footer (www.WorkforceAP.org, (512) 825-2896, 207 Settlers Valley Suite C, Pflugerville, TX 78660)' USING ERRCODE = '23514';
    END IF;
    -- J6 principal binding: the organization's designated signer (fail closed when
    -- unset) is the signer, and is the principal who attested this exact voucher.
    IF NEW.stage = 'j6' THEN
      SELECT d.user_id INTO designated_signer FROM public.billing_designated_signers d WHERE d.organization_id = NEW.organization_id;
      IF designated_signer IS NULL THEN
        RAISE EXCEPTION 'SIGNER_PRINCIPAL_UNSET: no signer is designated for this organization; J6 signing stays closed' USING ERRCODE = '23514';
      END IF;
      IF NEW.signed_by_subject_id IS DISTINCT FROM designated_signer THEN
        RAISE EXCEPTION 'SIGNER_NOT_DESIGNATED: only the designated signer signs a J6' USING ERRCODE = '23514';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.billing_attestations a
          WHERE a.id = NEW.voucher_attestation_id AND a.kind = 'voucher_board_signed' AND a.artifact_id = NEW.voucher_artifact_id
            AND a.attested_by_subject_id = designated_signer AND a.attested_by_subject_id = NEW.signed_by_subject_id) THEN
        RAISE EXCEPTION 'VOUCHER_ATTESTER_NOT_SIGNER: the voucher attestation must be by the designated signer who signs this J6' USING ERRCODE = '23514';
      END IF;
    END IF;
    IF NEW.stage = 'j6' AND NOT public.billing_voucher_receipt_signed(NEW.organization_id, NEW.voucher_artifact_id) THEN
      RAISE EXCEPTION 'VOUCHER_RECEIPT_SIGNATURE_UNATTESTED: the designated signer has not attested his receiving signature on this exact voucher' USING ERRCODE = '23514';
    END IF;
    IF (SELECT coalesce(array_agg(p.recipient_role ORDER BY p.recipient_role), ARRAY[]::TEXT[]) FROM public.billing_stage_recipients p
        WHERE p.stage_record_id = NEW.id)
       IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(required_roles) x) THEN
      RAISE EXCEPTION 'freeze exactly the % recipients before signing', array_to_string(required_roles, ', ') USING ERRCODE = '23514';
    END IF;
    -- The frozen snapshot is exactly the recipients printed in the signed
    -- content: same (role, normalized name, normalized email) set, no extra,
    -- missing or duplicated role.
    IF (SELECT coalesce(jsonb_agg(jsonb_build_array(p.recipient_role, public.billing_normalize_name(p.recipient_name), public.billing_normalize_email(p.email))
                                  ORDER BY p.recipient_role), '[]'::jsonb)
        FROM public.billing_stage_recipients p WHERE p.stage_record_id = NEW.id)
       IS DISTINCT FROM
       (SELECT coalesce(jsonb_agg(jsonb_build_array(x ->> 'role', public.billing_normalize_name(x ->> 'name'), public.billing_normalize_email(x ->> 'email'))
                                  ORDER BY x ->> 'role', x ->> 'email', x ->> 'name'), '[]'::jsonb)
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(NEW.content -> 'recipients') = 'array' THEN NEW.content -> 'recipients' ELSE '[]'::jsonb END) x) THEN
      RAISE EXCEPTION 'the frozen recipients must equal the recipients in the signed content (role, name, email)' USING ERRCODE = '23514';
    END IF;
    -- Every printed contact block (content.student / .counselor / .finance:
    -- name, email and phone) equals its frozen recipient row, with the same
    -- normalizers (phone uses the name normalizer). A J5 prints no finance block.
    IF EXISTS (
        SELECT 1 FROM unnest(required_roles) AS req(role)
        LEFT JOIN public.billing_stage_recipients p ON p.stage_record_id = NEW.id AND p.recipient_role = req.role
        WHERE p.stage_record_id IS NULL
           OR jsonb_typeof(NEW.content -> req.role) IS DISTINCT FROM 'object'
           OR public.billing_normalize_name(NEW.content -> req.role ->> 'name') IS DISTINCT FROM public.billing_normalize_name(p.recipient_name)
           OR public.billing_normalize_email(NEW.content -> req.role ->> 'email') IS DISTINCT FROM public.billing_normalize_email(p.email)
           OR public.billing_normalize_name(NEW.content -> req.role ->> 'phone') IS DISTINCT FROM public.billing_normalize_name(p.phone)
           -- The counselor phone is printed on J5 and J6: both sides must carry one.
           OR (req.role = 'counselor' AND (coalesce(public.billing_normalize_name(NEW.content -> 'counselor' ->> 'phone'), '') = ''
                                           OR coalesce(public.billing_normalize_name(p.phone), '') = '')))
       OR (NEW.stage = 'j5' AND NEW.content ? 'finance') THEN
      RAISE EXCEPTION 'every printed contact (student, counselor, finance: name, email, phone) must equal its frozen recipient' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.status = 'sent' AND (TG_OP = 'INSERT' OR OLD.status <> 'sent') THEN
    -- Per role: exactly one accepted claim that matches this version's content
    -- hash, attachments and frozen address (attempt numbers may differ across
    -- roles); and no claim of any role still unresolved.
    IF EXISTS (
        SELECT 1 FROM unnest(required_roles) AS req(role)
        WHERE (SELECT count(*) FROM public.billing_stage_sends s
               JOIN public.billing_stage_recipients p ON p.stage_record_id = s.stage_record_id AND p.recipient_role = s.recipient_role
               WHERE s.stage_record_id = NEW.id AND s.recipient_role = req.role
                 AND s.status IN ('provider_accepted', 'reconciled_delivered')
                 AND s.content_sha256 = NEW.content_sha256 AND s.email = p.email
                 AND s.attachment_sha256s = public.billing_stage_expected_attachments(NEW.id)) <> 1)
       OR EXISTS (SELECT 1 FROM public.billing_stage_sends s
        WHERE s.stage_record_id = NEW.id AND s.status IN ('pending', 'ambiguous', 'needs_reconciliation')) THEN
      RAISE EXCEPTION 'a stage is sent only when every required recipient has one accepted copy of this version and no copy is unresolved' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
