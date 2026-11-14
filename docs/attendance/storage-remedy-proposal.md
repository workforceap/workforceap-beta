# Attendance storage remedy — UNAPPLIED design for Rigel

Owner Lin; acceptance Ada. Assignment 36001f1e-0c71-497a-b3f5-4c746fb20034. Existing record `projects/workforceap/attendance-sheets-spec-20261109`, revision 3d22dc42. Inspected source base a6eebc575374c0bbd7ed19343a17a70cf9264d39, partial head 8fb1182cdab4a2ee760302b7f065d0814864a278, plus this isolated continuation. No target database inspected. This is NOT a migration or authority to execute it. Existing policies/configuration remain unchanged.

## Exact proposed restriction

Reserve only canonical `attendance/{organization UUID}/{member UUID}/{sheet UUID}/{revision UUID}.pdf` in private `member-files`. Keys must be generated on server from independently scoped records, lower-case UUIDs only, no client path, overwrite/upsert, signed URL or public URL. Include bare root `attendance` in protection to prevent a future root object from escaping the namespace rule.

```sql
-- REVIEW ONLY. Do not place in a migration directory until separately approved.
BEGIN;
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_class
                    WHERE oid = 'storage.objects'::regclass AND relrowsecurity)
     OR (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated')) <> 2
     OR NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'member-files' AND public = false)
  THEN RAISE EXCEPTION 'Attendance storage prerequisites not established'; END IF;
END $$;
CREATE POLICY attendance_server_only
ON storage.objects AS RESTRICTIVE FOR ALL TO anon, authenticated
USING (bucket_id <> 'member-files' OR (name <> 'attendance' AND name NOT LIKE 'attendance/%'))
WITH CHECK (bucket_id <> 'member-files' OR (name <> 'attendance' AND name NOT LIKE 'attendance/%'));
COMMIT;
```

RESTRICTIVE is essential: an additional permissive policy would OR with any broad existing permission. USING denies select/delete/update of existing attendance objects; WITH CHECK denies insert/update/move of new objects into attendance. PostgreSQL RLS plus table privileges must actually apply to the requesting roles; require both roles NOBYPASSRLS and not owner/superuser in test. No policy for service_role is added: verify its exact behavior separately. Policy creation must fail rather than silently skip if roles/storage prerequisites are absent. Duplicate policy name must fail pending catalog inspection, never replace unknown policy automatically. Establish policy-management authority with the same evidence standard as `scripts/enrollment-agreements-storage-preflight.sql` (owner/superuser or registered loaded Supautils policy grant, never arbitrary custom GUC). Do not run that script or this SQL on any target under this assignment.

Pre-release read-only audit must record exact `pg_policies`, storage table owner/RLS, role inheritance/bypass, bucket private flag, SDK/API versions, previously minted tokens, and application signing consumers. Source migration is not proof of deployed policy. No live exploit claimed.

## Every source-discovered member-files consumer

Inventory search: literal `member-files`, constants `MEMBER_FILES_BUCKET`, `PROFILE_PHOTO_BUCKET`, `AGREEMENT_BUCKET`, all `.storage` call sites in app/lib, and transitive helper callers. No external repository or live consumer inventory available; this is the complete source-discovered scope, not a claim about all deployed clients.

| Consumer / literal paths | Current behavior and proposed impact |
|---|---|
| `lib/enrollmentAgreements/storage.ts`, `service.ts`; `app/api/enrollment-agreements/[id]/download/route.ts`, `archive/[id]/download/route.ts` | Immutable upload/read/cleanup under `enrollment-agreements/{member}/{submission}.pdf`; existing restrictive policy untouched. Distinct prefix; no billing/enrollment authorization reuse. |
| `app/api/member/certifications/upload/route.ts`; `app/admin/certifications/page.tsx` | Writes `cert-files/{user}/{cert}[timestamp].ext`; admin mints signed URLs from stored `proofUrl`. Normal prefix unaffected. Stored-path signing is privileged and must reject attendance paths before attendance is enabled. |
| `lib/portal/memberProfilePhoto.ts`, `memberProfilePhotoUrl.ts`; `app/api/member/profile-photo/upload/route.ts`, `app/api/member/profile-photo/route.ts`; `app/(portal)/dashboard/layout.tsx`, `dashboard/profile/page.tsx` | Upload/delete `profile-photos/{user}/photo.webp`; helper signs stored path, upload also removes previous stored path. Normal namespace unaffected; arbitrary stored-path service-role access needs attendance exclusion/canonical ownership validation before enabling archive. |
| `lib/gdpr/deleteUserStorage.ts`; `lib/retention/cleanup.ts`; `app/api/gdpr/delete/route.ts`, `app/api/member/delete-account/route.ts`, `app/api/admin/members/[id]/delete/route.ts`, `erase/route.ts`; `scripts/resume-demo-member.ts` | Enumerates cert/photo prefixes and validates extra paths; attendance not enumerated/accepted. This preserves new records rather than solving erasure/retention. Explicit retention/legal-hold and concurrent subject-erasure handling required before release. |
| `lib/billing/twoStage/financeStorage.ts` | Explicitly forbids member-files; remains forbidden. Billing signature/archive consumers use their own validated bucket; not affected, not a fallback. |
| `supabase/migrations/20260610033949_create_member_files_storage_bucket.sql`, `supabase/history/unapplied/20260610000000_create_member_files_storage_bucket.sql` | Private bucket creation only; unchanged, no browser-policy proof. |
| `prisma/migrations/20260918160000_add_profile_photo_path/migration.sql`, `20261001200042_enrollment_agreement_submissions/migration.sql`, `prisma/schema.prisma` | Photo key metadata, enrollment server-only protection/immutability; unchanged. |

Resume uploads/previews/counselor/admin resume reads and voice recordings use `member-resumes`; employer/org logos use distinct buckets. They were inspected via storage call-site search and are not affected by this bucket/prefix rule. Source inventory command output is retained at `/home/claw/attendance-member-files-consumers.txt`.

### Important second gate: service-role confused deputy

An attendance prefix restriction does not constrain a service-role signing/deletion helper. `memberProfilePhotoUrl.ts` signs a DB-provided path without canonical photo-prefix validation; certification admin queue similarly signs DB `proofUrl`. This is NOT proof those columns are currently attacker-writable. Nevertheless attendance must remain OFF until each writer of those fields and all privileged path consumers are verified and prevented from routing an attendance path around domain authorization. This task does not alter those shared consumers. Rigel must verify this audit and a scoped hardening patch before future archive enablement. A private bucket alone, proposed policy alone, or mocked `public:false` is never an archive capability.

## Synthetic isolation test plan — not executed here

Run only in separately approved disposable PostgreSQL/Supabase environment; no existing shared daemon/configuration. Seed fake storage schema/objects, non-owner non-bypass anon/authenticated roles, permissive FOR ALL policy modeling the dangerous broad grant, and service-role semantics. Create synthetic attendance A/B tenants, cert/photo, agreement and alternate-bucket objects. Apply proposed policy in test transaction only.

1. Under each browser role, SELECT/download/list and DELETE attendance return zero/denied; INSERT and UPDATE fail; UPDATE renaming other prefix into attendance or attendance into another prefix fails. Test root `attendance` and nested object, matching and different owner JWTs, tenant/member same/different, wildcard/URL encoded path attempts at API layer.
2. Assert non-attendance cert/photo CRUD is byte-for-byte unchanged relative to baseline; alternate bucket name `attendance/...` remains outside this policy. Existing enrollment restriction stays enforced. Require a permissive baseline test to first demonstrate attendance was reachable without the proposed restriction (test must fail when restriction is removed).
3. Exercise real Storage HTTP SDK with anon/authenticated JWTs: direct upload, download, signed URL creation, signed-upload, list, move/copy/update/delete. Verify DB denial maps to SDK denial; SQL-only fixture cannot establish Supabase behavior. Attempt old/new token replay where relevant; no reusable archive signed URLs permitted.
4. Service-role via attendance application boundary: student own tenant/own sheet, explicit scoped admin, wrong tenant/member, counselor, configured instructor, wrong signer, deleted subject. Direct browser path must never succeed. Require photo/cert privileged helpers to refuse attendance paths even if metadata fixture is poisoned.
5. Immutable write with unique generated revision, `upsert:false`, exact hash and length reread. Missing/public bucket, policy catalog mismatch, thrown preflight, failed/ambiguous upload, digest/size mismatch and failed DB commit must keep draft unsigned. Cleanup only request-owned staged UUID; ambiguous outcome held for reconciliation, no blind delete/retry. No existing artifact overwrite/deletion.
6. Atomic CAS transaction against exact revision/hash and subject-erasure fence; concurrent signing/request/import/supersession, idempotency payload mismatch, retry/replay, stale requests, re-sync immutability. Returned artifact must be exactly the frozen approved signed bytes; source update cannot replace history.
7. Rollback rehearsal only while feature OFF and no attendance objects written: `DROP POLICY attendance_server_only ON storage.objects;`. If any retained object exists, dropping the policy is unsafe: keep protection and disable application entry points; remediation needs separate owner-led decision.

No SQL, SDK, DB, concurrency or archive capability tests above have run. Actual tests in this continuation are pure synthetic domain/render tests only. Rigel independent review and Ada acceptance remain outstanding.
