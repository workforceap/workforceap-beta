/** Execute real SQL against an isolated local database, never customer records. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const target = new URL(process.env.SHADOW_DATABASE_URL ?? '');
assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname));
assert.equal(target.search, '');
assert.equal(target.pathname, '/wap_shadow');
const database = 'wap_application_report_proof';
const env = { ...process.env, PGHOST: target.hostname, PGPORT: target.port || '5432', PGUSER: decodeURIComponent(target.username), PGPASSWORD: decodeURIComponent(target.password), PGCONNECT_TIMEOUT: '5' };
function sql(input, db = database) {
  const result = spawnSync('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-d', db], { env, input, encoding: 'utf8', timeout: 20_000 });
  assert.equal(result.status, 0, `Migration proof failed: ${result.stderr}`);
  return result.stdout.trim();
}
sql(`CREATE DATABASE ${database}`, 'postgres');
try {
  sql(`CREATE TABLE users(id text PRIMARY KEY, deleted_at timestamp);
    CREATE TABLE applications(id text PRIMARY KEY, user_id text REFERENCES users(id) ON DELETE CASCADE, status text);
    INSERT INTO users(id) VALUES ('synthetic'), ('other-active');
    INSERT INTO applications VALUES ('existing', 'synthetic', 'pending');`);
  sql(readFileSync('prisma/migrations/20261022120000_application_report_snapshot/migration.sql', 'utf8'));
  assert.equal(sql('SELECT application_report_snapshot IS NULL FROM applications'), 't');
  sql(`UPDATE applications SET application_report_snapshot='{"version":1,"value":"original"}'; UPDATE applications SET status='approved';`);
  assert.equal(sql(`SELECT application_report_snapshot->>'value' FROM applications`), 'original');
  sql(`DO $$ BEGIN
    BEGIN UPDATE applications SET application_report_snapshot=NULL; RAISE EXCEPTION 'snapshot cleared'; EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN UPDATE applications SET application_report_snapshot='{}'; RAISE EXCEPTION 'snapshot replaced'; EXCEPTION WHEN check_violation THEN NULL; END;
    END $$;`);
  sql(`INSERT INTO applications VALUES ('other-app', 'other-active', 'pending', '{"version":1}');
    UPDATE users SET deleted_at=now() WHERE id='synthetic';`);
  assert.equal(sql(`SELECT application_report_snapshot IS NULL FROM applications WHERE id='existing'`), 't');
  assert.equal(sql(`SELECT application_report_snapshot IS NOT NULL FROM applications WHERE id='other-app'`), 't');
  sql(`DO $$ BEGIN
    BEGIN UPDATE applications SET application_report_snapshot='{}' WHERE id='existing'; RAISE EXCEPTION 'deleted report restored'; EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN INSERT INTO applications VALUES ('late', 'synthetic', 'pending', '{}'); RAISE EXCEPTION 'deleted report inserted'; EXCEPTION WHEN check_violation THEN NULL; END;
    END $$;`);
  // A restored account must not resurrect a filing copy erased on deletion.
  sql(`UPDATE users SET deleted_at=NULL WHERE id='synthetic';`);
  assert.equal(sql(`SELECT application_report_snapshot IS NULL FROM applications WHERE id='existing'`), 't');
  sql(`DELETE FROM users WHERE id='synthetic';`);
  assert.equal(sql(`SELECT count(*) FROM applications WHERE user_id='synthetic'`), '0');
  console.log('PASS nullable migration, initial capture, immutability, status update, scoped soft-delete scrubbing and hard-delete cascade');
} finally { sql(`DROP DATABASE ${database}`, 'postgres'); }
