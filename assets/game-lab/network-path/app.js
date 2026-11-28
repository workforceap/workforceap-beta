(function () {
  "use strict";
  var P = window.WapPractice;
  var state = P.freshState();
  var storageNote = "Not saved yet.";
  var memoryOnly = false;

  var $ = function (id) { return document.getElementById(id); };

  function work() { return state.work[state.activeVariant]; }

  function say(id, message, kind) {
    var node = $(id);
    node.hidden = !message;
    node.textContent = message || "";
    node.className = "status" + (kind ? " " + kind : "");
  }

  function renderPath(which) {
    var list = which === "dns" ? work().dnsPath : work().appPath;
    var host = $(which + "-path");
    if (!list.length) {
      host.innerHTML = "<p>No devices yet.</p>";
      return;
    }
    var html = "<ol>";
    list.forEach(function (id, index) {
      html += "<li>" + (index + 1) + ". " + P.NODES[id] + "</li>";
    });
    html += "</ol>";
    host.innerHTML = html;
  }

  function renderEvidence() {
    var log = $("evidence-log");
    log.innerHTML = "";
    work().evidenceLog.forEach(function (row) {
      var item = document.createElement("li");
      item.textContent = row.id + ": " + row.text;
      log.appendChild(item);
    });
    var box = $("evidence-buttons");
    box.innerHTML = "";
    P.EVIDENCE[state.activeVariant].forEach(function (row) {
      var button = document.createElement("button");
      button.type = "button";
      button.textContent = "Check " + row.id;
      button.addEventListener("click", function () {
        var result = P.inspect(state, row.id);
        say("evidence-live", result.text, result.repeat ? "warn" : "");
        renderEvidence();
        persist();
      });
      box.appendChild(button);
    });
  }

  function renderVariant() {
    var variant = P.VARIANTS[state.activeVariant];
    $("variant-blurb").textContent = "You are on case " + variant.id + ". " + variant.ticket;
    $("ticket-text").textContent = "Ticket: " + variant.ticket;
    $("diagnosis").value = work().diagnosis || "";
    $("dns-separate").checked = work().dnsSeparate === true;
    renderPath("dns");
    renderPath("app");
    renderEvidence();
    P.ROLE_SUBJECTS.forEach(function (subject) {
      $("role-" + subject.id).value = work().roles[subject.id] || "";
    });
    P.VERIFICATIONS.forEach(function (item) {
      $("verify-" + item.id).checked = work().verifications[item.id] === true;
    });
    $("prose-rationale").value = work().prose.rationale;
    $("prose-limits").value = work().prose.limits;
    $("prose-customer").value = work().prose.customer;
    renderAttempts();
  }

  function renderScore(snapshot) {
    if (!snapshot) {
      $("score").innerHTML = "";
      return;
    }
    var html = "<p class='score'><strong>" + snapshot.total + " / 10</strong>. Automated checks " +
      (snapshot.automatedChecksPassed ? "passed" : "did not all pass") +
      ". Review status: not-reviewed. This is not course credit.</p><ul>";
    snapshot.criterionScores.forEach(function (row) {
      html += "<li>" + row.id + ": " + row.score + " / 2</li>";
    });
    html += "</ul>";
    if (snapshot.hintIds.length) {
      html += "<div class='note warn'><p><strong>Hints</strong> (no point cost)</p><ul>";
      snapshot.hintIds.forEach(function (id) {
        html += "<li>" + P.HINTS[id] + "</li>";
      });
      html += "</ul></div>";
    }
    $("score").innerHTML = html;
  }

  function renderAttempts() {
    var host = $("attempts");
    if (!state.attempts.length) {
      host.innerHTML = "<p>No submitted attempts yet.</p>";
      return;
    }
    var html = "<h3>Submitted snapshots</h3><ol>";
    state.attempts.forEach(function (attempt) {
      html += "<li>Case " + attempt.variantId + ", attempt " + attempt.attemptId +
        ", revision " + attempt.revision + ", " + attempt.total + "/10, " +
        attempt.submittedAt + ", not-reviewed.</li>";
    });
    html += "</ol>";
    host.innerHTML = html;
  }

  function persist() {
    var payload = P.savePayload(state);
    try {
      localStorage.setItem(P.META.storageKey, payload);
      var readback = localStorage.getItem(P.META.storageKey);
      if (readback !== payload) throw new Error("readback mismatch");
      memoryOnly = false;
      storageNote = "Saved on this device only.";
    } catch (error) {
      memoryOnly = true;
      storageNote = "Could not save on this device. Your work is still in this tab. Download a packet before you close it.";
    }
    $("save-status").textContent = storageNote;
  }

  function showProseErrors(errors) {
    ["rationale", "limits", "customer"].forEach(function (key) {
      var node = $("err-" + key);
      var field = $("prose-" + key);
      if (errors && errors[key]) {
        node.hidden = false;
        node.textContent = errors[key];
        field.setAttribute("aria-invalid", "true");
        field.setAttribute("aria-describedby", "err-" + key);
      } else {
        node.hidden = true;
        node.textContent = "";
        field.removeAttribute("aria-invalid");
      }
    });
  }

  function latestSnapshot() {
    return state.attempts.length ? state.attempts[state.attempts.length - 1] : null;
  }

  function download(filename, text, type) {
    var blob = new Blob([text], { type: type });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function wireStatic() {
    ["dns", "app"].forEach(function (which) {
      var host = $(which + "-adders");
      Object.keys(P.NODES).forEach(function (id) {
        var button = document.createElement("button");
        button.type = "button";
        button.textContent = "Add " + P.NODES[id];
        button.addEventListener("click", function () {
          P.setPath(state, which, id);
          renderPath(which);
          persist();
        });
        host.appendChild(button);
      });
      $(which + "-undo").addEventListener("click", function () {
        P.undoPath(state, which);
        renderPath(which);
        persist();
      });
      $(which + "-clear").addEventListener("click", function () {
        P.clearPath(state, which);
        renderPath(which);
        persist();
      });
    });

    var roles = $("roles");
    P.ROLE_SUBJECTS.forEach(function (subject) {
      var label = document.createElement("label");
      label.setAttribute("for", "role-" + subject.id);
      label.textContent = subject.label;
      var select = document.createElement("select");
      select.id = "role-" + subject.id;
      var empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "Choose a job";
      select.appendChild(empty);
      P.ROLES.forEach(function (role) {
        var option = document.createElement("option");
        option.value = role.id;
        option.textContent = role.label;
        select.appendChild(option);
      });
      select.addEventListener("change", function () {
        work().roles[subject.id] = select.value;
        persist();
      });
      roles.appendChild(label);
      roles.appendChild(select);
    });

    P.DIAGNOSES.forEach(function (item) {
      var option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.label;
      $("diagnosis").appendChild(option);
    });
    $("diagnosis").addEventListener("change", function () {
      work().diagnosis = $("diagnosis").value;
      persist();
    });
    $("dns-separate").addEventListener("change", function () {
      work().dnsSeparate = $("dns-separate").checked;
      persist();
    });

    var actions = $("action-buttons");
    P.ACTIONS.forEach(function (item) {
      var button = document.createElement("button");
      button.type = "button";
      button.textContent = item.label;
      button.addEventListener("click", function () {
        var result = P.chooseAction(state, item.id);
        say("action-live", result.message, result.ok && result.changed ? "" : "warn");
        persist();
      });
      actions.appendChild(button);
    });

    var checks = $("verifications");
    P.VERIFICATIONS.forEach(function (item) {
      var label = document.createElement("label");
      label.className = "choice";
      var box = document.createElement("input");
      box.type = "checkbox";
      box.id = "verify-" + item.id;
      box.addEventListener("change", function () {
        work().verifications[item.id] = box.checked;
        persist();
      });
      var text = document.createElement("span");
      text.textContent = item.label;
      label.appendChild(box);
      label.appendChild(text);
      checks.appendChild(label);
    });
    var separateLabel = $("dns-separate").parentElement;
    if (separateLabel && separateLabel.tagName === "LABEL") separateLabel.classList.add("choice");

    ["rationale", "limits", "customer"].forEach(function (key) {
      $("prose-" + key).addEventListener("input", function (event) {
        work().prose[key] = event.target.value;
        persist();
      });
    });

    $("ask-scope").addEventListener("click", function () {
      var node = $("ask-result");
      node.hidden = false;
      node.textContent = P.VARIANTS[state.activeVariant].askScope;
    });
    $("ask-change").addEventListener("click", function () {
      var node = $("ask-result");
      node.hidden = false;
      node.textContent = P.VARIANTS[state.activeVariant].askChange;
    });

    $("submit").addEventListener("click", function () {
      var result = P.submit(state, new Date().toISOString());
      if (!result.ok) {
        showProseErrors(result.errors);
        var first = document.querySelector("[aria-invalid='true']");
        if (first) first.focus();
        return;
      }
      showProseErrors(null);
      renderScore(result.snapshot);
      renderAttempts();
      persist();
    });

    $("changed-case").addEventListener("click", function () {
      P.startChangedCase(state);
      renderVariant();
      renderScore(null);
      say("action-live", "", "");
      say("evidence-live", "Case B is ready. Case A was not copied into it.", "");
      persist();
    });

    $("download-json").addEventListener("click", function () {
      var snapshot = latestSnapshot();
      if (!snapshot) {
        say("evidence-live", "Submit an attempt before downloading.", "warn");
        return;
      }
      download("wap-practice-review.json", JSON.stringify(snapshot, null, 2), "application/json");
    });
    $("download-text").addEventListener("click", function () {
      var snapshot = latestSnapshot();
      if (!snapshot) {
        say("evidence-live", "Submit an attempt before downloading.", "warn");
        return;
      }
      download("wap-practice-review.txt", P.textExport(snapshot), "text/plain");
    });
    $("print").addEventListener("click", function () { window.print(); });

    $("reset").addEventListener("click", function () { $("reset-dialog").showModal(); });
    $("reset-cancel").addEventListener("click", function () { $("reset-dialog").close(); });
    $("reset-confirm").addEventListener("click", function () {
      P.resetLesson(state);
      try { localStorage.removeItem(P.META.storageKey); } catch (error) { memoryOnly = true; }
      $("reset-dialog").close();
      renderVariant();
      renderScore(null);
      showProseErrors(null);
      persist();
    });
  }

  function restore() {
    var raw = null;
    try { raw = localStorage.getItem(P.META.storageKey); } catch (error) {
      memoryOnly = true;
      storageNote = "Local storage is unavailable. Work stays in this tab until you download it.";
      $("save-status").textContent = storageNote;
      return;
    }
    if (!raw) return;
    var loaded = P.loadState(raw);
    if (!loaded.ok) {
      memoryOnly = true;
      storageNote = "Saved practice data was unreadable. Starting fresh in this tab. Download a packet if you need a copy.";
      $("save-status").textContent = storageNote;
      return;
    }
    state = loaded.state;
  }

  wireStatic();
  restore();
  renderVariant();
  if (!memoryOnly) persist();
  else $("save-status").textContent = storageNote;
})();
