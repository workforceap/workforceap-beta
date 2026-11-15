"use strict";

var assert = require("assert");
var P = require("./lesson.js");

var passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log("ok " + passed + " " + name);
}

function stateWith(variantId, mutate) {
  var state = P.freshState();
  state.activeVariant = variantId;
  if (mutate) mutate(state.work[variantId], state);
  return state;
}

check("case A perfect score is 10 and not reviewed", function () {
  var state = P.freshState();
  state.work.A = P.perfectWork("A");
  var result = P.score(state, "A");
  assert.strictEqual(result.total, 10);
  assert.strictEqual(result.automatedChecksPassed, true);
  assert.strictEqual(result.reviewStatus, "not-reviewed");
  assert.strictEqual(result.comparisonRetained, true);
});

check("case B perfect score rejects the case A DNS answer", function () {
  var state = P.freshState();
  state.work.B = P.perfectWork("B");
  state.work.B.diagnosis = "client-dns";
  var wrong = P.score(state, "B");
  assert.strictEqual(wrong.criteria[2].score, 1);
  assert.strictEqual(wrong.automatedChecksPassed, false);
  state.work.B.diagnosis = "gateway";
  var right = P.score(state, "B");
  assert.strictEqual(right.total, 10);
  assert.strictEqual(right.automatedChecksPassed, true);
});

check("each wrong diagnosis on A scores the cause check at 0", function () {
  ["shared-lan", "remote-outage", "gateway", "unknown", ""].forEach(function (choice) {
    var state = stateWith("A", function (work) {
      work.diagnosis = choice;
      work.evidenceLog = [
        { id: "A4", text: "x" },
        { id: "A5", text: "y" },
      ];
    });
    var result = P.score(state, "A");
    assert.strictEqual(result.criteria[2].score, 1, choice || "(blank)");
  });
});

check("diagnosis pair is worth one point and a missing pair is zero of that half", function () {
  var one = stateWith("A", function (work) {
    work.diagnosis = "client-dns";
    work.evidenceLog = [{ id: "A4", text: "x" }];
  });
  assert.strictEqual(P.score(one, "A").criteria[2].score, 1);
  var none = stateWith("A", function (work) {
    work.evidenceLog = [{ id: "A2", text: "x" }];
  });
  assert.strictEqual(P.score(none, "A").criteria[2].score, 0);
});

check("B diagnosis evidence is B1 plus B2, not the A pair", function () {
  var state = stateWith("B", function (work) {
    work.diagnosis = "gateway";
    work.evidenceLog = [{ id: "A4", text: "x" }, { id: "A5", text: "y" }, { id: "B1", text: "z" }];
  });
  assert.strictEqual(P.score(state, "B").criteria[2].score, 1);
});

check("path and role halves score 0, 1, and 2", function () {
  var state = stateWith("A", function (work) {
    work.dnsPath = P.DNS_PATH.slice();
    work.roles.client = "endpoint";
    work.roles.switch = "switch";
    work.roles.router = "router";
    work.roles.dns = "dns";
    work.roles.remote = "remote";
  });
  var mid = P.score(state, "A");
  assert.strictEqual(mid.criteria[0].score, 1);
  assert.strictEqual(mid.criteria[1].score, 1);
  workPath(state);
  assert.strictEqual(P.score(state, "A").criteria[0].score, 2);
  state.work.A.dnsSeparate = true;
  assert.strictEqual(P.score(state, "A").criteria[1].score, 2);
  state.work.A.dnsPath = [];
  state.work.A.appPath = [];
  state.work.A.roles = {};
  state.work.A.dnsSeparate = false;
  var zero = P.score(state, "A");
  assert.strictEqual(zero.criteria[0].score, 0);
  assert.strictEqual(zero.criteria[1].score, 0);
});

function workPath(state) {
  state.work.A.appPath = P.APP_PATH.slice();
}

check("safety needs approval plus both rollback choices", function () {
  var state = stateWith("A", function (work) {
    work.approvalRequested = true;
    work.applied = true;
    work.actions["apply-correction"] = true;
    work.actions["preserve-old"] = true;
  });
  assert.strictEqual(P.score(state, "A").criteria[3].score, 1);
  state.work.A.actions["stop-escalate"] = true;
  assert.strictEqual(P.score(state, "A").criteria[3].score, 2);
  state.work.A.applied = false;
  assert.strictEqual(P.score(state, "A").criteria[3].score, 1);
});

check("verification fails when ping-alone is selected", function () {
  var state = stateWith("A", function (work) {
    work.verifications = {
      config: true, lookup: true, portal: true,
      "unknown-followup": true, persistence: true, "ping-alone": true,
    };
  });
  assert.strictEqual(P.score(state, "A").criteria[4].score, 1);
  delete state.work.A.verifications["ping-alone"];
  assert.strictEqual(P.score(state, "A").criteria[4].score, 2);
});

check("repeat evidence does not duplicate the log", function () {
  var state = P.freshState();
  var first = P.inspect(state, "A4");
  var second = P.inspect(state, "A4");
  assert.strictEqual(first.repeat, false);
  assert.strictEqual(second.repeat, true);
  assert.strictEqual(state.work.A.evidenceLog.length, 1);
});

check("apply is blocked until approval and explicit lookup does not apply", function () {
  var state = P.freshState();
  var blocked = P.chooseAction(state, "apply-correction");
  assert.strictEqual(blocked.blocked, true);
  assert.strictEqual(state.work.A.applied, false);
  var lookup = P.chooseAction(state, "explicit-lookup-only");
  assert.strictEqual(lookup.changed, false);
  assert.strictEqual(state.work.A.applied, false);
  P.chooseAction(state, "request-approval");
  var applied = P.chooseAction(state, "apply-correction");
  assert.strictEqual(applied.changed, true);
  assert.ok(applied.message.indexOf("A7") === 0);
});

check("out of scope actions change nothing", function () {
  var state = P.freshState();
  ["disable-security", "public-dns", "reset-router"].forEach(function (id) {
    var result = P.chooseAction(state, id);
    assert.strictEqual(result.changed, false);
  });
  assert.strictEqual(state.work.A.applied, false);
  assert.strictEqual(state.work.A.approvalRequested, false);
});

check("changed case starts clean and does not keep A repair", function () {
  var state = P.freshState();
  state.work.A = P.perfectWork("A");
  P.startChangedCase(state);
  assert.strictEqual(state.activeVariant, "B");
  assert.strictEqual(state.work.B.applied, false);
  assert.deepStrictEqual(state.work.B.dnsPath, []);
  assert.strictEqual(state.work.A.applied, true);
});

check("submit is idempotent in stored evidence and keeps earlier revisions", function () {
  var state = P.freshState();
  state.work.A = P.perfectWork("A");
  var first = P.submit(state, "2026-11-10T12:00:00.000Z");
  var again = P.submit(state, "2026-11-10T12:05:00.000Z");
  assert.strictEqual(first.ok, true);
  assert.strictEqual(again.ok, true);
  assert.strictEqual(state.attempts.length, 2);
  assert.strictEqual(state.attempts[0].revision, 1);
  assert.strictEqual(state.attempts[1].revision, 2);
  assert.strictEqual(state.attempts[0].attemptId, 1);
  assert.notStrictEqual(state.attempts[0].submittedAt, state.attempts[1].submittedAt);
  assert.deepStrictEqual(state.attempts[0].evidence.map(function (row) { return row.id; }),
    state.attempts[1].evidence.map(function (row) { return row.id; }));
});

check("empty prose blocks submit and missing answers score zero", function () {
  var state = P.freshState();
  var blocked = P.submit(state, "2026-11-10T12:00:00.000Z");
  assert.strictEqual(blocked.ok, false);
  assert.ok(blocked.errors.rationale);
  var result = P.score(state, "A");
  result.criteria.forEach(function (row) { assert.strictEqual(row.score, 0); });
});

check("text export and JSON snapshot agree on scores and review status", function () {
  var state = P.freshState();
  state.work.A = P.perfectWork("A");
  var submitted = P.submit(state, "2026-11-10T12:00:00.000Z");
  var text = P.textExport(submitted.snapshot);
  assert.ok(text.indexOf("10/10") > -1);
  assert.ok(text.indexOf("not-reviewed") > -1);
  assert.ok(text.indexOf("Provider lesson ID: none") > -1);
  assert.strictEqual(submitted.snapshot.providerLessonId, null);
  assert.strictEqual(submitted.snapshot.automatedChecksPassed, true);
  assert.strictEqual(submitted.snapshot.schemaVersion, 1);
  assert.deepStrictEqual(submitted.snapshot.orderedPaths.dns, ["A", "S1", "D1"]);
  assert.deepStrictEqual(submitted.snapshot.orderedPaths.application, ["A", "S1", "R1", "UP", "REMOTE"]);
});

check("corrupt storage is rejected and reset clears only this lesson state", function () {
  var bad = P.loadState("{");
  assert.strictEqual(bad.corrupt, true);
  var other = P.loadState(JSON.stringify({ lessonId: "other", state: {} }));
  assert.strictEqual(other.ok, false);
  var state = P.freshState();
  state.work.A = P.perfectWork("A");
  P.submit(state, "2026-11-10T12:00:00.000Z");
  var raw = P.savePayload(state);
  var loaded = P.loadState(raw);
  assert.strictEqual(loaded.ok, true);
  assert.strictEqual(loaded.state.attempts.length, 1);
  P.resetLesson(loaded.state);
  assert.strictEqual(loaded.state.attempts.length, 0);
  assert.strictEqual(loaded.state.activeVariant, "A");
  assert.strictEqual(loaded.state.work.A.applied, false);
});

check("hints name the failed half and are not duplicated", function () {
  var state = P.freshState();
  var once = P.score(state, "A");
  var twice = P.score(state, "A");
  assert.deepStrictEqual(once.criteria[0].hintIds, ["path-dns", "path-app"]);
  assert.strictEqual(state.work.A.hints.length, 10);
  assert.strictEqual(twice.criteria.length, 5);
  assert.ok(state.work.A.hints.indexOf("path-dns") === state.work.A.hints.lastIndexOf("path-dns"));
});

check("valid-JSON but malformed nested state is rejected as corrupt, never loaded", function () {
  var id = P.META.lessonId;
  var bad = [
    { lessonId: id, state: {} },
    { lessonId: id, state: [] },
    { lessonId: id, state: "x" },
    { lessonId: id, state: { activeVariant: "A", work: {}, attempts: [], nextAttempt: 1 } },
    { lessonId: id, state: { activeVariant: "C", work: P.freshState().work, attempts: [], nextAttempt: 1 } },
    { lessonId: id, state: { activeVariant: "A", work: P.freshState().work, attempts: {}, nextAttempt: 1 } },
    { lessonId: id, state: { activeVariant: "A", work: P.freshState().work, attempts: [null], nextAttempt: 1 } },
    { lessonId: id, state: { activeVariant: "A", work: P.freshState().work, attempts: [], nextAttempt: "1" } },
  ];
  var broken = P.freshState(); broken.work.A.prose = null;
  bad.push({ lessonId: id, state: broken });
  bad.forEach(function (payload, i) {
    var r = P.loadState(JSON.stringify(payload));
    assert.strictEqual(r.ok, false, "case " + i);
    assert.strictEqual(r.corrupt, true, "case " + i);
    assert.strictEqual(r.state, undefined, "case " + i);
  });
  var good = P.freshState();
  assert.strictEqual(P.loadState(P.savePayload(good)).ok, true);
});

console.log(passed + " tests passed");
