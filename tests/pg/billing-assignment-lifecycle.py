"""Disposable PG16 proof: pg_virtualenv python3 tests/pg/billing-assignment-lifecycle.py.

Exercises both lock orders with separate database sessions. This is intentionally
restricted to pg_virtualenv so it cannot write to a configured application DB.
"""

import os
import subprocess
import threading
import time


if os.environ.get("PGVERSION") != "16" or not os.environ.get("PG_CLUSTER_CONF_ROOT", "").startswith("/tmp/pg_virtualenv."):
    raise SystemExit("Run only under pg_virtualenv with PostgreSQL 16")


def run(sql: str) -> str:
    result = subprocess.run(
        ["psql", "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-c", sql],
        check=True, capture_output=True, text=True, timeout=15,
    )
    return result.stdout.strip()


class Session:
    def __init__(self):
        self.proc = subprocess.Popen(
            ["psql", "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1"],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, bufsize=1,
        )

    def send(self, sql: str) -> str:
        assert self.proc.stdin and self.proc.stdout
        self.proc.stdin.write(sql.rstrip(";\n") + ";\n\\echo __DONE__\n")
        self.proc.stdin.flush()
        lines = []
        for line in self.proc.stdout:
            if line.strip() == "__DONE__":
                break
            lines.append(line.strip())
        else:
            raise AssertionError(f"psql exited while executing {sql[:50]}: {lines}")
        if any(line.startswith("ERROR:") for line in lines):
            raise AssertionError("; ".join(lines))
        return "\n".join(line for line in lines if line)

    def close(self):
        self.proc.terminate()
        self.proc.wait(timeout=5)


run("""
CREATE TABLE users (id text PRIMARY KEY, organization_id text NOT NULL, deleted_at timestamptz);
CREATE TABLE counselors (id text PRIMARY KEY, user_id text NOT NULL, active boolean NOT NULL);
CREATE TABLE counselor_assignments (id text PRIMARY KEY, counselor_id text NOT NULL, member_id text NOT NULL, active boolean NOT NULL, assigned_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE training_billing_packets (id text PRIMARY KEY, member_id text NOT NULL, signed_snapshot jsonb NOT NULL);
CREATE TABLE training_billing_packet_sends (id text PRIMARY KEY, packet_id text NOT NULL, recipient text NOT NULL, status text NOT NULL);
INSERT INTO users VALUES ('member-1', 'org-1', NULL), ('staff-1', 'org-1', NULL), ('staff-2', 'org-1', NULL);
INSERT INTO counselors VALUES ('c1', 'staff-1', true), ('c2', 'staff-2', true);
INSERT INTO counselor_assignments VALUES ('a1', 'c1', 'member-1', true, now());
INSERT INTO training_billing_packets VALUES ('p1', 'member-1', '{"counselor":{"userId":"staff-1"}}');
INSERT INTO training_billing_packet_sends VALUES ('s1', 'p1', 'counselor', 'pending');
""")

lock = "SELECT pg_advisory_xact_lock(hashtext('billing-member-lifecycle:member-1'))"
unresolved = """SELECT EXISTS(
  SELECT s.id FROM training_billing_packet_sends AS s
  JOIN training_billing_packets AS p ON p.id = s.packet_id
  WHERE s.status IN ('claimed', 'ambiguous', 'needs_reconciliation')
    AND (p.member_id = 'member-1'
      OR (s.recipient = 'counselor' AND p.signed_snapshot #>> '{counselor,userId}' = 'member-1'))
  LIMIT 1)"""


def competing(session: Session, result: dict, query: str):
    try:
        session.send("BEGIN")
        started = time.monotonic()
        session.send(lock)
        result["wait_seconds"] = time.monotonic() - started
        result["value"] = session.send(query)
        session.send("COMMIT")
    except Exception as exc:
        result["error"] = exc


# Claim wins: assignment must wait for claim commit, then see claimed status.
claim, assignment = Session(), Session()
try:
    claim.send("BEGIN")
    claim.send(lock)
    claim.send("UPDATE training_billing_packet_sends SET status = 'claimed' WHERE id = 's1'")
    outcome = {}
    contender = threading.Thread(target=competing, args=(assignment, outcome, unresolved))
    contender.start()
    time.sleep(0.3)
    assert contender.is_alive(), "assignment did not wait on the claim lock"
    claim.send("COMMIT")
    contender.join(timeout=5)
    assert not contender.is_alive() and "error" not in outcome, outcome
    assert outcome["value"] == "t" and outcome["wait_seconds"] >= 0.25, outcome
    print("claim-first: assignment waited and refused an unresolved send")
finally:
    claim.close()
    assignment.close()


# Assignment wins: claim waits, then sees the new counselor and refuses the
# frozen packet's former recipient.
run("UPDATE training_billing_packet_sends SET status = 'pending' WHERE id = 's1'")
assignment, claim = Session(), Session()
try:
    assignment.send("BEGIN")
    assignment.send(lock)
    assert assignment.send(unresolved) == "f"
    assert assignment.send("""SELECT u.id,
      EXISTS(SELECT 1 FROM counselor_assignments AS ca WHERE ca.member_id = u.id AND ca.active = TRUE) AS "alreadyAssigned"
      FROM users AS u WHERE u.id = 'member-1' AND u.organization_id = 'org-1' AND u.deleted_at IS NULL
      FOR UPDATE OF u""") == "member-1|t"
    assignment.send("UPDATE counselor_assignments SET active = false WHERE id = 'a1'")
    assignment.send("INSERT INTO counselor_assignments (id, counselor_id, member_id, active) VALUES ('a2', 'c2', 'member-1', true)")
    outcome = {}
    live_counselor = """SELECT c.user_id FROM counselor_assignments AS ca
      JOIN counselors AS c ON c.id = ca.counselor_id
      WHERE ca.member_id = 'member-1' AND ca.active = true
      ORDER BY ca.assigned_at DESC LIMIT 1"""
    contender = threading.Thread(target=competing, args=(claim, outcome, live_counselor))
    contender.start()
    time.sleep(0.3)
    assert contender.is_alive(), "claim did not wait on the assignment lock"
    assignment.send("COMMIT")
    contender.join(timeout=5)
    assert not contender.is_alive() and "error" not in outcome, outcome
    assert outcome["value"] == "staff-2" and outcome["wait_seconds"] >= 0.25, outcome
    print("assignment-first: claim waited and detected counselor drift")
finally:
    assignment.close()
    claim.close()
