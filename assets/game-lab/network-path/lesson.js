/**
 * Original WAP Practice demo rules (content/rubric 2026-11-10.v1).
 * Authored scenario only. No provider lesson, no completion credit.
 * Loaded by index.html and by node fixture tests.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.WapPractice = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var META = {
    schemaVersion: 1,
    lessonId: "wap-practice-local-network-v1",
    contentVersion: "2026-11-10.v1",
    rubricVersion: "2026-11-10.v1",
    title: "Follow a request through the local network",
    providerLessonId: null,
    assigned: false,
    storageKey: "wap-practice-local-network-v1",
    proseMin: 1,
    proseMax: 1000,
  };

  var NODES = {
    A: "Client A (10.24.8.47)",
    S1: "Switch S1",
    D1: "Approved DNS D1 (10.24.8.10)",
    R1: "Gateway/router R1 (10.24.8.1)",
    UP: "Upstream path",
    REMOTE: "Remote server portal.cedar.example (203.0.113.20)",
  };

  var ROLES = [
    { id: "endpoint", label: "Endpoint" },
    { id: "switch", label: "Switch" },
    { id: "router", label: "Router" },
    { id: "dns", label: "DNS" },
    { id: "remote", label: "Remote service" },
  ];

  var ROLE_SUBJECTS = [
    { id: "client", label: "Client A" },
    { id: "switch", label: "Switch S1" },
    { id: "router", label: "Router R1" },
    { id: "dns", label: "DNS D1" },
    { id: "remote", label: "Remote documentation server" },
  ];

  var ROLE_KEY = {
    client: "endpoint",
    switch: "switch",
    router: "router",
    dns: "dns",
    remote: "remote",
  };

  var DIAGNOSES = [
    { id: "client-dns", label: "Client DNS configuration" },
    { id: "shared-lan", label: "Shared LAN outage" },
    { id: "remote-outage", label: "Remote service outage" },
    { id: "gateway", label: "Client gateway configuration" },
    { id: "unknown", label: "Not enough evidence" },
  ];

  var ACTIONS = [
    { id: "request-approval", label: "Request owner approval to correct the setting" },
    { id: "apply-correction", label: "Apply the approved correction" },
    { id: "preserve-old", label: "Keep the old setting for authorized rollback" },
    { id: "stop-escalate", label: "Stop and escalate if the correction fails or approval is absent" },
    { id: "disable-security", label: "Disable security software" },
    { id: "public-dns", label: "Point the client at a public DNS server" },
    { id: "reset-router", label: "Reset the router" },
    { id: "explicit-lookup-only", label: "Run an explicit lookup and leave saved DNS unchanged" },
  ];

  var OUT_OF_SCOPE = { "disable-security": true, "public-dns": true, "reset-router": true };

  var VERIFICATIONS = [
    { id: "config", label: "Configuration shows the corrected setting" },
    { id: "lookup", label: "Default name lookup now succeeds" },
    { id: "portal", label: "Portal landing page opens" },
    { id: "unknown-followup", label: "Who or what changed the setting is still unknown" },
    { id: "persistence", label: "Whether the fix survives the next normal reconnect is still unchecked" },
    { id: "ping-alone", label: "Ping success alone proves the web page works" },
  ];

  var DNS_PATH = ["A", "S1", "D1"];
  var APP_PATH = ["A", "S1", "R1", "UP", "REMOTE"];

  var EVIDENCE = {
    A: [
      { id: "A1", text: "A DNS is 10.24.8.99. B and approved policy use 10.24.8.10. Both gateways are 10.24.8.1." },
      { id: "A2", text: "A ping to 10.24.8.1: 4 of 4 replies." },
      { id: "A3", text: "A ping to 203.0.113.20: 4 of 4 replies." },
      { id: "A4", text: "Default lookup uses 10.24.8.99 and times out." },
      { id: "A5", text: "Explicit lookup using 10.24.8.10 returns 203.0.113.20." },
      { id: "A6", text: "B opens the portal. A shows a name-resolution error." },
    ],
    B: [
      { id: "B1", text: "A DNS is 10.24.8.10 (approved). A gateway is 10.24.8.254. B gateway is 10.24.8.1." },
      { id: "B2", text: "A default lookup using 10.24.8.10 succeeds." },
      { id: "B3", text: "A ping to the real router 10.24.8.1: 4 of 4 replies (same LAN)." },
      { id: "B4", text: "A cannot reach 203.0.113.20 and the portal fails." },
      { id: "B5", text: "B opens the portal." },
    ],
  };

  var VARIANTS = {
    A: {
      id: "A",
      ticket: "A cannot open the portal; B can. It worked yesterday.",
      askScope: "Only client A is affected.",
      askChange: "What changed the setting is unknown.",
      correctDiagnosis: "client-dns",
      diagnosisEvidence: ["A4", "A5"],
      comparisonEvidence: "A6",
      wrongGateway: "10.24.8.99",
      approvedValue: "10.24.8.10",
      settingName: "DNS",
      repairEvidence: "A7",
      repairText: "Configuration is 10.24.8.10. Default lookup resolves. The portal landing page opens. Whether this survives the next normal reconnect is still unchecked.",
    },
    B: {
      id: "B",
      ticket: "A cannot open the portal; B can. Names still resolve on A.",
      askScope: "Only client A is affected.",
      askChange: "What changed the setting is unknown.",
      correctDiagnosis: "gateway",
      diagnosisEvidence: ["B1", "B2"],
      comparisonEvidence: "B5",
      wrongGateway: "10.24.8.254",
      approvedValue: "10.24.8.1",
      settingName: "gateway",
      repairEvidence: "B6",
      repairText: "Gateway is 10.24.8.1. Remote address is reachable. The portal landing page opens. Whether this survives the next normal reconnect is still unchecked.",
    },
  };

  var HINTS = {
    "path-dns": "The name lookup travels to the approved DNS server. It is not the same path as the page request.",
    "path-app": "After the name is known, the page request leaves through the gateway and the upstream path. DNS is not a hop on that path.",
    "roles-match": "Match each device to one job: the client starts the request, the switch stays on the LAN, the router crosses networks, DNS answers names, and the remote server sends the page.",
    "roles-separate": "A name lookup is its own request. DNS does not sit in the middle of the page request.",
    "diagnosis-cause": "Compare what works on A with what works on B. The failing setting is the one that differs from the healthy client and from approved policy.",
    "diagnosis-evidence": "Case A is decided by the failed default lookup and the successful explicit lookup. Case B is decided by the gateway in the configuration and the lookup that already succeeds.",
    "safety-approval": "Ask for approval first. The practice app only allows the correction after that request.",
    "safety-rollback": "Keep the old value so an authorized person can roll it back, and stop to escalate if approval is missing or the correction fails.",
    "verify-checks": "Confirm the saved setting, a normal lookup, and the landing page. A ping only shows that ICMP replies.",
    "verify-limits": "Leave the unknown cause and the next-reconnect check unresolved. Do not treat ping success as proof the page works.",
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function blankWork(variantId) {
    return {
      variantId: variantId,
      dnsPath: [],
      appPath: [],
      roles: {},
      dnsSeparate: false,
      evidenceLog: [],
      diagnosis: "",
      actions: {},
      approvalRequested: false,
      applied: false,
      verifications: {},
      prose: { rationale: "", limits: "", customer: "" },
      hints: [],
    };
  }

  function freshState() {
    return {
      activeVariant: "A",
      work: { A: blankWork("A"), B: blankWork("B") },
      attempts: [],
      nextAttempt: 1,
    };
  }

  function sameList(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
    return true;
  }

  function evidenceById(variantId, id) {
    var rows = EVIDENCE[variantId];
    for (var i = 0; i < rows.length; i += 1) if (rows[i].id === id) return rows[i];
    return null;
  }

  function inspect(state, evidenceId) {
    var work = state.work[state.activeVariant];
    var row = evidenceById(state.activeVariant, evidenceId);
    if (!row) return { ok: false, message: "That check is not part of this case." };
    var seen = false;
    for (var i = 0; i < work.evidenceLog.length; i += 1) {
      if (work.evidenceLog[i].id === evidenceId) seen = true;
    }
    if (!seen) {
      work.evidenceLog.push({ id: row.id, text: row.text, repeat: false });
      return { ok: true, repeat: false, text: row.text };
    }
    return { ok: true, repeat: true, text: row.text + " Same result as before. No extra credit." };
  }

  function setPath(state, which, nodeId) {
    var work = state.work[state.activeVariant];
    var key = which === "dns" ? "dnsPath" : "appPath";
    if (!NODES[nodeId]) return { ok: false, message: "Unknown device." };
    work[key].push(nodeId);
    return { ok: true };
  }

  function undoPath(state, which) {
    var work = state.work[state.activeVariant];
    var key = which === "dns" ? "dnsPath" : "appPath";
    work[key].pop();
    return { ok: true };
  }

  function clearPath(state, which) {
    var work = state.work[state.activeVariant];
    work[which === "dns" ? "dnsPath" : "appPath"] = [];
    return { ok: true };
  }

  function chooseAction(state, actionId) {
    var work = state.work[state.activeVariant];
    var variant = VARIANTS[state.activeVariant];
    if (OUT_OF_SCOPE[actionId]) {
      work.actions[actionId] = false;
      return {
        ok: true,
        changed: false,
        message: "Out of scope for this ticket. No setting was changed.",
      };
    }
    if (actionId === "explicit-lookup-only") {
      work.actions[actionId] = true;
      return {
        ok: true,
        changed: false,
        message: "The explicit lookup does not change the saved " + variant.settingName + ".",
      };
    }
    if (actionId === "request-approval") {
      work.approvalRequested = true;
      work.actions[actionId] = true;
      return { ok: true, changed: false, message: "Approval is simulated. You may apply the correction to " + variant.approvedValue + "." };
    }
    if (actionId === "apply-correction") {
      if (!work.approvalRequested) {
        work.actions[actionId] = false;
        return { ok: false, blocked: true, message: "Apply stays blocked until you request approval." };
      }
      work.applied = true;
      work.actions[actionId] = true;
      return { ok: true, changed: true, message: variant.repairEvidence + ": " + variant.repairText };
    }
    if (actionId === "preserve-old" || actionId === "stop-escalate") {
      work.actions[actionId] = true;
      return { ok: true, changed: false, message: "Recorded. No setting was changed by this choice." };
    }
    return { ok: false, message: "Unknown action." };
  }

  function addHint(work, id) {
    if (work.hints.indexOf(id) === -1) work.hints.push(id);
  }

  function hasEvidence(work, id) {
    for (var i = 0; i < work.evidenceLog.length; i += 1) {
      if (work.evidenceLog[i].id === id) return true;
    }
    return false;
  }

  function score(state, variantId) {
    var work = state.work[variantId];
    var variant = VARIANTS[variantId];
    var criteria = [];

    var dnsOk = sameList(work.dnsPath, DNS_PATH);
    var appOk = sameList(work.appPath, APP_PATH);
    if (!dnsOk) addHint(work, "path-dns");
    if (!appOk) addHint(work, "path-app");
    criteria.push(criterion("path", (dnsOk ? 1 : 0) + (appOk ? 1 : 0), ["path-dns", "path-app"], dnsOk, appOk));

    var rolesOk = true;
    ROLE_SUBJECTS.forEach(function (subject) {
      if (work.roles[subject.id] !== ROLE_KEY[subject.id]) rolesOk = false;
    });
    var separateOk = work.dnsSeparate === true;
    if (!rolesOk) addHint(work, "roles-match");
    if (!separateOk) addHint(work, "roles-separate");
    criteria.push(criterion("roles", (rolesOk ? 1 : 0) + (separateOk ? 1 : 0), ["roles-match", "roles-separate"], rolesOk, separateOk));

    var causeOk = work.diagnosis === variant.correctDiagnosis;
    var pairOk = hasEvidence(work, variant.diagnosisEvidence[0]) && hasEvidence(work, variant.diagnosisEvidence[1]);
    if (!causeOk) addHint(work, "diagnosis-cause");
    if (!pairOk) addHint(work, "diagnosis-evidence");
    criteria.push(criterion("diagnosis", (causeOk ? 1 : 0) + (pairOk ? 1 : 0), ["diagnosis-cause", "diagnosis-evidence"], causeOk, pairOk));

    var approvedOk = work.approvalRequested === true && work.applied === true && work.actions["apply-correction"] === true;
    var safetyOk = work.actions["preserve-old"] === true && work.actions["stop-escalate"] === true;
    if (!approvedOk) addHint(work, "safety-approval");
    if (!safetyOk) addHint(work, "safety-rollback");
    criteria.push(criterion("safety", (approvedOk ? 1 : 0) + (safetyOk ? 1 : 0), ["safety-approval", "safety-rollback"], approvedOk, safetyOk));

    var checksOk = work.verifications.config === true && work.verifications.lookup === true && work.verifications.portal === true;
    var limitsOk = work.verifications["unknown-followup"] === true && work.verifications.persistence === true && work.verifications["ping-alone"] !== true;
    if (!checksOk) addHint(work, "verify-checks");
    if (!limitsOk) addHint(work, "verify-limits");
    criteria.push(criterion("verification", (checksOk ? 1 : 0) + (limitsOk ? 1 : 0), ["verify-checks", "verify-limits"], checksOk, limitsOk));

    var total = 0;
    var passed = true;
    criteria.forEach(function (row) {
      total += row.score;
      if (row.score !== 2) passed = false;
    });
    return {
      criteria: criteria,
      total: total,
      maximum: 10,
      automatedChecksPassed: passed,
      reviewStatus: "not-reviewed",
      comparisonRetained: hasEvidence(work, variant.comparisonEvidence),
    };
  }

  function criterion(id, value, hintIds, first, second) {
    var failed = [];
    if (!first) failed.push(hintIds[0]);
    if (!second) failed.push(hintIds[1]);
    return { id: id, score: value, hintIds: failed };
  }

  function proseErrors(work) {
    var errors = {};
    ["rationale", "limits", "customer"].forEach(function (key) {
      var text = (work.prose[key] || "").trim();
      if (text.length < META.proseMin || text.length > META.proseMax) {
        errors[key] = "Enter 1 to 1000 characters. This field is saved for a person to read. It is not scored by the app.";
      }
    });
    return errors;
  }

  function buildSnapshot(state, variantId, revision, attemptId, submittedAt) {
    var work = state.work[variantId];
    var variant = VARIANTS[variantId];
    var result = score(state, variantId);
    var repair = null;
    if (work.applied) {
      repair = { id: variant.repairEvidence, text: variant.repairText };
    }
    return {
      schemaVersion: META.schemaVersion,
      lessonId: META.lessonId,
      contentVersion: META.contentVersion,
      rubricVersion: META.rubricVersion,
      providerLessonId: null,
      variantId: variantId,
      attemptId: attemptId,
      revision: revision,
      submittedAt: submittedAt,
      orderedPaths: { dns: work.dnsPath.slice(), application: work.appPath.slice() },
      roleChoices: clone(work.roles),
      dnsLookupSeparate: work.dnsSeparate === true,
      evidence: work.evidenceLog.map(function (row) { return { id: row.id, text: row.text }; }),
      diagnosis: work.diagnosis,
      safeActionSelections: clone(work.actions),
      approvalSimulationEvent: work.approvalRequested ? "requested" : "not-requested",
      correctionApplied: work.applied === true,
      verificationSelections: clone(work.verifications),
      prose: {
        rationale: work.prose.rationale,
        limits: work.prose.limits,
        customer: work.prose.customer,
      },
      hintIds: result.criteria.reduce(function (all, row) { return all.concat(row.hintIds); }, []),
      criterionScores: result.criteria.map(function (row) { return { id: row.id, score: row.score }; }),
      total: result.total,
      automatedChecksPassed: result.automatedChecksPassed,
      reviewStatus: "not-reviewed",
      repairEvidence: repair,
      comparisonEvidenceRetained: result.comparisonRetained,
    };
  }

  function submit(state, now) {
    var variantId = state.activeVariant;
    var work = state.work[variantId];
    var errors = proseErrors(work);
    if (Object.keys(errors).length) return { ok: false, errors: errors };
    var prior = 0;
    state.attempts.forEach(function (attempt) {
      if (attempt.variantId === variantId && attempt.revision > prior) prior = attempt.revision;
    });
    var snapshot = buildSnapshot(state, variantId, prior + 1, state.nextAttempt, now || new Date().toISOString());
    state.attempts.push(snapshot);
    state.nextAttempt += 1;
    return { ok: true, snapshot: snapshot };
  }

  function startChangedCase(state) {
    state.activeVariant = "B";
    state.work.B = blankWork("B");
    return { ok: true, message: "Case B starts from its own observations. Case A is not carried over." };
  }

  function resetLesson(state) {
    var cleared = freshState();
    state.activeVariant = cleared.activeVariant;
    state.work = cleared.work;
    state.attempts = cleared.attempts;
    state.nextAttempt = cleared.nextAttempt;
    return { ok: true };
  }

  function textExport(snapshot) {
    var lines = [];
    lines.push("WAP Practice review packet");
    lines.push("Original practice. Not a course lesson. Not reviewed. Not certified.");
    lines.push("Lesson: " + snapshot.lessonId + " (" + snapshot.contentVersion + ")");
    lines.push("Provider lesson ID: none");
    lines.push("Case: " + snapshot.variantId + "  Attempt: " + snapshot.attemptId + "  Revision: " + snapshot.revision);
    lines.push("Submitted: " + snapshot.submittedAt);
    lines.push("DNS path: " + snapshot.orderedPaths.dns.join(" -> "));
    lines.push("Application path: " + snapshot.orderedPaths.application.join(" -> "));
    lines.push("DNS lookup separate from application forwarding: " + (snapshot.dnsLookupSeparate ? "yes" : "no"));
    lines.push("Roles: " + JSON.stringify(snapshot.roleChoices));
    lines.push("Diagnosis: " + (snapshot.diagnosis || "(none)"));
    lines.push("Evidence:");
    snapshot.evidence.forEach(function (row) { lines.push("- " + row.id + ": " + row.text); });
    if (snapshot.repairEvidence) lines.push("After approved correction: " + snapshot.repairEvidence.id + ": " + snapshot.repairEvidence.text);
    lines.push("Approval simulation: " + snapshot.approvalSimulationEvent);
    lines.push("Correction applied: " + (snapshot.correctionApplied ? "yes" : "no"));
    lines.push("Safe-action selections: " + JSON.stringify(snapshot.safeActionSelections));
    lines.push("Verification selections: " + JSON.stringify(snapshot.verificationSelections));
    lines.push("Automated checks: " + snapshot.total + "/10; passed=" + snapshot.automatedChecksPassed);
    lines.push("Review status: not-reviewed");
    lines.push("Hints shown: " + (snapshot.hintIds.length ? snapshot.hintIds.join(", ") : "(none)"));
    lines.push("Diagnosis rationale: " + snapshot.prose.rationale);
    lines.push("Limits and unresolved question: " + snapshot.prose.limits);
    lines.push("Customer update: " + snapshot.prose.customer);
    lines.push("Saved on this device only when local storage succeeds. This file is the copy you keep.");
    return lines.join("\n");
  }

  function loadState(raw) {
    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return { ok: false, corrupt: true };
    }
    if (!parsed || parsed.lessonId !== META.lessonId || !validState(parsed.state)) return { ok: false, corrupt: true };
    return { ok: true, state: parsed.state };
  }

  function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
  function strList(v) { return Array.isArray(v) && v.every(function (x) { return typeof x === "string"; }); }
  function boolMap(v) { return isObj(v) && Object.keys(v).every(function (k) { return typeof v[k] === "boolean" || typeof v[k] === "string"; }); }

  function validWork(w, id) {
    return isObj(w) && w.variantId === id && strList(w.dnsPath) && strList(w.appPath) &&
      isObj(w.roles) && Object.keys(w.roles).every(function (k) { return typeof w.roles[k] === "string"; }) &&
      typeof w.dnsSeparate === "boolean" && typeof w.diagnosis === "string" &&
      Array.isArray(w.evidenceLog) && w.evidenceLog.every(function (r) { return isObj(r) && typeof r.id === "string" && typeof r.text === "string"; }) &&
      boolMap(w.actions) && boolMap(w.verifications) && strList(w.hints) &&
      typeof w.approvalRequested === "boolean" && typeof w.applied === "boolean" &&
      isObj(w.prose) && typeof w.prose.rationale === "string" && typeof w.prose.limits === "string" && typeof w.prose.customer === "string";
  }

  // Structural check of a saved state so a well-formed JSON wrapper with a bad inner state is treated as corrupt, not crashed on.
  function validState(s) {
    return isObj(s) && (s.activeVariant === "A" || s.activeVariant === "B") &&
      isObj(s.work) && validWork(s.work.A, "A") && validWork(s.work.B, "B") &&
      typeof s.nextAttempt === "number" && isFinite(s.nextAttempt) && s.nextAttempt >= 1 && Math.floor(s.nextAttempt) === s.nextAttempt &&
      Array.isArray(s.attempts) && s.attempts.every(function (a) {
        return isObj(a) && (a.variantId === "A" || a.variantId === "B") && typeof a.total === "number" &&
          typeof a.submittedAt === "string" && a.attemptId !== undefined && a.revision !== undefined &&
          isObj(a.prose) && Array.isArray(a.evidence) && Array.isArray(a.hintIds) && isObj(a.orderedPaths);
      });
  }

  function savePayload(state) {
    return JSON.stringify({ lessonId: META.lessonId, rubricVersion: META.rubricVersion, state: state });
  }

  function perfectWork(variantId) {
    var work = blankWork(variantId);
    var variant = VARIANTS[variantId];
    work.dnsPath = DNS_PATH.slice();
    work.appPath = APP_PATH.slice();
    ROLE_SUBJECTS.forEach(function (subject) { work.roles[subject.id] = ROLE_KEY[subject.id]; });
    work.dnsSeparate = true;
    EVIDENCE[variantId].forEach(function (row) { work.evidenceLog.push({ id: row.id, text: row.text, repeat: false }); });
    work.diagnosis = variant.correctDiagnosis;
    work.approvalRequested = true;
    work.applied = true;
    work.actions["request-approval"] = true;
    work.actions["apply-correction"] = true;
    work.actions["preserve-old"] = true;
    work.actions["stop-escalate"] = true;
    work.verifications = { config: true, lookup: true, portal: true, "unknown-followup": true, persistence: true };
    work.prose = {
      rationale: "The healthy client and the approved setting isolate one client configuration.",
      limits: "The person or process that changed the setting is still unknown.",
      customer: "We corrected the approved setting after approval and confirmed the landing page opens.",
    };
    return work;
  }

  return {
    META: META,
    NODES: NODES,
    ROLES: ROLES,
    ROLE_SUBJECTS: ROLE_SUBJECTS,
    ROLE_KEY: ROLE_KEY,
    DIAGNOSES: DIAGNOSES,
    ACTIONS: ACTIONS,
    VERIFICATIONS: VERIFICATIONS,
    DNS_PATH: DNS_PATH,
    APP_PATH: APP_PATH,
    EVIDENCE: EVIDENCE,
    VARIANTS: VARIANTS,
    HINTS: HINTS,
    freshState: freshState,
    blankWork: blankWork,
    inspect: inspect,
    setPath: setPath,
    undoPath: undoPath,
    clearPath: clearPath,
    chooseAction: chooseAction,
    score: score,
    submit: submit,
    startChangedCase: startChangedCase,
    resetLesson: resetLesson,
    buildSnapshot: buildSnapshot,
    textExport: textExport,
    loadState: loadState,
    validState: validState,
    savePayload: savePayload,
    perfectWork: perfectWork,
    proseErrors: proseErrors,
  };
});
