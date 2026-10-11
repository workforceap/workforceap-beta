# WAP-280: DEMO schema preparation and controlled billing setup

This is a preparation receipt, not a verified database bootstrap. Routine
reversible nonproduction setup and three distinct controlled billing inboxes
were already authorized. The remaining work concerns schema/security review and
actual application capability; no further blanket setup or inbox approval is
needed.

## Captured source and generated artifact

Preparation used source `02021c3142ec0201d5ab3f87a89bf9a4f3480337`.
`prisma/schema.prisma` SHA-256 was
`325c68db4ebe4dfe95143e185413dc93aad42d65954895d555dbf5ec7505203a`.
The generated SQL was 158,105 bytes with 129 `CREATE TABLE` statements and
SHA-256 `82c6f9e6517f79cf2483e03a8085b00b97e8f34c97fcdeb4e1ea82b24c9447ec`.

The installed Prisma CLI generated empty-to-current-datamodel DDL without a
database connection or SQL execution. No local replay, remote schema/data write,
branch provisioning, identity creation, gate activation or email send occurred.

From the repository root, with its installed dependencies and configured local
runtime available, reproduce the generation into an untracked temporary directory:

```bash
set -e
baseline_dir=$(mktemp -d /tmp/wap-280-baseline.XXXXXX)
export WAP_BASELINE_DIR="$baseline_dir"
flock --close /tmp/workforceap-heavy.lock sh -c \
  'node node_modules/prisma/build/index.js migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > "$WAP_BASELINE_DIR/current-schema-unreviewed.sql"'
sha256sum prisma/schema.prisma "$baseline_dir/current-schema-unreviewed.sql"
wc -c "$baseline_dir/current-schema-unreviewed.sql"
```

The onboarding activation command is specific to the managed worker; use its
normal runtime activation before these commands when required. Generated hashes
refer to the captured source/CLI output and are evidence, not a promise that a
future Prisma version emits identical text. These commands do not apply SQL.

## Reproduce the security/platform candidate inventory

The generated DDL contains no RLS statements, policies, SQL functions, triggers,
grant/revoke statements, Storage bucket definitions or platform Auth references.
The enum value `GRANT` is not a SQL grant statement. A comment-stripped lexical
scan found 46 repository files containing security/platform candidate SQL.
It records candidates and hashes; it does not prove current policy equivalence,
complete dependencies or deployability.

Run from the same repository root after generating the DDL above:

```bash
python3 - <<'PY'
import hashlib, json, os, pathlib, re
root = pathlib.Path.cwd()
out = pathlib.Path(os.environ['WAP_BASELINE_DIR'])
patterns = {
    'rls': r'\b(?:ENABLE|FORCE|DISABLE)\s+ROW\s+LEVEL\s+SECURITY\b',
    'policies': r'\b(?:CREATE|ALTER|DROP)\s+POLICY\b',
    'functions': r'\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b',
    'triggers': r'\bCREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\b',
    'grants': r'\b(?:GRANT|REVOKE)\b',
    'storage_buckets': r'\bstorage\.buckets\b',
    'platform_auth_references': r'\bauth\.(?:users|uid|jwt|role)\b',
}
files = (list(root.glob('prisma/migrations/*/migration.sql'))
         + list(root.glob('supabase/migrations/*.sql'))
         + [root / 'supabase/policies.sql'])
entries = []
for path in sorted(files):
    raw = path.read_bytes()
    sql = re.sub(r'/\*.*?\*/|--[^\n]*', ' ', raw.decode(), flags=re.S)
    hits = {key: len(re.findall(pattern, sql, re.I))
            for key, pattern in patterns.items()}
    hits = {key: count for key, count in hits.items() if count}
    if hits:
        entries.append({'path': str(path.relative_to(root)),
                        'sha256': hashlib.sha256(raw).hexdigest(),
                        'pattern_occurrences': hits})
receipt = {'method': 'Lexical candidate inventory, not a complete SQL parser',
           'security_baseline_verified': False,
           'files': entries,
           'ddl_sha256': hashlib.sha256(
               (out / 'current-schema-unreviewed.sql').read_bytes()).hexdigest()}
(out / 'security-candidates.json').write_text(json.dumps(receipt, indent=2) + '\n')
print('Candidate files:', len(entries))
PY
```

Pattern hits can include quoted text and dynamic SQL. They are review pointers,
not counts of effective policies or privileged statements. Review the exact
candidate bodies and their application dependencies before constructing a
security-complete baseline; do not concatenate historical SQL onto the generated
DDL as an automatic recipe.

## Why native preview bootstrap remains incomplete

The 36 active native Supabase migration files reconcile the existing production
ledger, but do not create a complete initial application schema. The first native
migration alters `course_enrollments` and `users`; prior native fresh-preview
acceptance failed with `42P01` for `course_enrollments`, zero public tables and
zero applied native versions. Existing-production history reconciliation succeeded
separately. Neither outcome certifies a fresh application preview.

Historical Prisma clean replay is also unsupported: the documented duplicate
`partner_users` migration and references-before-creation remain. `db push` omits
migration-only security DDL. A current full-schema snapshot placed before the
historical native migrations can conflict with types/columns those migrations
create. A reviewed lineage must prove clean replay, security/platform parity and
compatibility with the unchanged existing-production ledger. Preserve recovered
applied file bytes and historical checksums; do not use ledger stamps to hide
missing execution. See [Supabase history guidance](../../supabase/README.md) and
[database recovery](../DATABASE-RECOVERY.md).

## Captured DEMO and application capability gaps

A fresh read-only WAP connector check identified the approved DEMO project
`esbdrgaonplpvzmtrdhw` as healthy with no native development branches. Metadata
SQL found no `billing_cases`, `billing_stage_records`,
`billing_designated_signers` or `billing_artifacts`, and zero private
`billing-finance` buckets. Its last completed Prisma migration was
`20260904020000_training_billing_packets`. This observation is dated evidence,
not a claim that later setup could not change the project.

The activated acceptance runtime had no `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`,
`POSTGRES_PRISMA_URL`, `RESEND_API_KEY` or `VERCEL_TOKEN` variables present. The
managed runtime reported zero configured secret/runtime bindings and outbound
identities; its enforced restricted network policy did not allow the application
or Resend hosts. This describes the acceptance worker, not the deployed
application's credentials or provider readiness. No credential value was read
or recorded. Management metadata SQL does not supply an application Auth session,
Storage byte API or email transport.

## Setup sequence still required

1. For a fresh native preview, review and prove the complete schema/security/
   platform baseline and compatible native lineage locally before applying it.
   Controlled billing acceptance may instead use an existing or separately
   reviewed DEMO deployment once its scoped current-schema/security prerequisites
   are verified. A native clean-bootstrap proof is not a prerequisite to that
   separate path; the captured DEMO still lacks its billing schema and archive.
2. Establish DEMO-scoped application credentials/network access and deployment.
   Use real Auth APIs for synthetic linked app/Auth admin, member and designated
   test signer identities plus a synthetic billable enrollment. The existing
   `scripts/resume-demo-member.ts` helper covers its scoped member fixture after
   DEMO service-key/database probes; it does not create a complete schema or
   billing signer setup. Do not insert fake sessions or impersonate an executive.
3. Verify designated-principal gates, an approved visibly synthetic test signature
   image, private archive Storage API readback and an enforced exact three-inbox
   test allowlist through the application delivery channel.
4. Execute the current J5/J6 routes and record archived artifact hashes, provider
   message/delivery receipts, mailbox attachment bytes and repeat-send idempotence.
   Use the full stage role sets; no manual Gmail substitution or production
   fallback establishes acceptance.

WAP-288's local proof now accepts the J5 counselor/student and J6
finance/counselor/student exact recipient snapshots, and rejects duplicate J6
addresses and outside-snapshot copies. The approved-inbox count is three; exact
addresses are intentionally absent. This resolves only the prior recipient-count
blocker. No controlled application packet, signed artifact, provider message,
inbox receipt or Storage byte readback was created in that acceptance pass.
WAP-280 bootstrap and WAP-288 end-to-end acceptance remain open.
