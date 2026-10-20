/*
 * app.js - UI, scoring, timer and storage for the CTF simulator.
 * Plain ES5-ish JavaScript, no framework, no build step.
 *
 * Page behaviour is selected with <body data-page="...">:
 *   home | challenges | scoreboard | writeups
 */
(function () {
  "use strict";

  var CFG = window.CTF_CONFIG || {};
  var ALL = window.CTF_CHALLENGES || [];
  var KEY = CFG.storageKey || "itso26.cybersecurity.state.v1";
  var state = null;
  var timerHandle = null;
  var lastFocused = null;
  var pendingHint = null;

  /* ================================================================== */
  /* helpers                                                            */
  /* ================================================================== */

  function byId(id) { return document.getElementById(id); }
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function esc(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function pad(value) { return (value < 10 ? "0" : "") + value; }

  function closest(node, selector) {
    while (node && node.nodeType === 1) {
      if (node.matches ? node.matches(selector) : false) return node;
      node = node.parentNode;
    }
    return null;
  }

  function formatClock(ms) {
    var total = Math.floor(Math.max(0, ms) / 1000);
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    return (h > 0 ? h + ":" : "") + pad(m) + ":" + pad(s);
  }

  function formatDate(ts) {
    if (!ts) return "-";
    try {
      return new Date(ts).toLocaleString();
    } catch (e) {
      return new Date(ts).toISOString();
    }
  }

  function slug(text) {
    return String(text || "team").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "team";
  }

  function flash(message, tone) {
    var box = byId("page-status");
    if (!box) return;
    box.textContent = message;
    box.className = "page-status" + (tone ? " page-status--" + tone : "");
    box.setAttribute("data-visible", "true");
    if (tone === "ok" || tone === "error") {
      window.setTimeout(function () {
        if (box.textContent === message) box.setAttribute("data-visible", "false");
      }, 6000);
    }
  }

  /* ================================================================== */
  /* state                                                              */
  /* ================================================================== */

  function blankState() {
    return {
      version: CFG.storageVersion || 1,
      team: null,
      startedAt: null,
      endAt: null,
      solved: {},
      hints: {},
      attempts: {},
      locked: [],
      lastSolveAt: null
    };
  }

  function loadState() {
    var base = blankState();
    try {
      var raw = window.localStorage.getItem(KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          Object.keys(base).forEach(function (key) {
            if (parsed[key] !== undefined && parsed[key] !== null) base[key] = parsed[key];
          });
        }
      }
    } catch (e) {
      /* storage disabled or corrupted - keep the in-memory state */
    }
    state = base;
    return state;
  }

  function saveState() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      flash("Progress could not be saved: browser storage is unavailable.", "error");
    }
  }

  function resetEverything() {
    try { window.localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    state = blankState();
  }

  /* ================================================================== */
  /* challenge helpers                                                  */
  /* ================================================================== */

  function findChallenge(id) {
    for (var i = 0; i < ALL.length; i++) {
      if (ALL[i].id === id) return ALL[i];
    }
    return null;
  }

  function visibleChallenges() {
    return ALL.filter(function (ch) {
      if (ch.id === CFG.tiebreakerId && !CFG.showTiebreaker) return false;
      return true;
    });
  }

  function basePoints(ch) {
    return typeof ch.points === "number" ? ch.points : (CFG.points[ch.difficulty] || 0);
  }

  function hintCost(ch, index) {
    var hint = (ch.hints || [])[index];
    if (hint && typeof hint.cost === "number") return hint.cost;
    return (CFG.hintCost && CFG.hintCost[ch.difficulty]) || 0;
  }

  function hintsFor(ch) { return state.hints[ch.id] || []; }

  function hintDeduction(ch) {
    return hintsFor(ch).reduce(function (sum, index) {
      return sum + hintCost(ch, index);
    }, 0);
  }

  function awardFor(ch) {
    return Math.max(CFG.minAward || 0, basePoints(ch) - hintDeduction(ch));
  }

  function isSolved(ch) { return !!state.solved[ch.id]; }
  function isLocked(ch) { return (state.locked || []).indexOf(ch.id) !== -1; }
  function attemptsUsed(ch) { return state.attempts[ch.id] || 0; }
  function attemptsLeft(ch) { return Math.max(0, (CFG.maxAttempts || 3) - attemptsUsed(ch)); }

  function totalScore() {
    return Object.keys(state.solved).reduce(function (total, id) {
      var ch = findChallenge(id);
      if (!ch) return total;
      if (id === CFG.tiebreakerId && !CFG.tiebreakerCountsForTotal) return total;
      var record = state.solved[id];
      return total + (typeof record.points === "number" ? record.points : awardFor(ch));
    }, 0);
  }

  function solvedCount() { return Object.keys(state.solved).length; }

  function lastSolveTimestamp() {
    if (state.lastSolveAt) return state.lastSolveAt;
    var latest = 0;
    Object.keys(state.solved).forEach(function (id) {
      var at = state.solved[id] && state.solved[id].at;
      if (at && at > latest) latest = at;
    });
    return latest || null;
  }

  /* ================================================================== */
  /* competition clock                                                  */
  /* ================================================================== */

  function started() { return !!state.startedAt && !!state.endAt; }

  function over() { return started() && Date.now() >= state.endAt; }

  function msLeft() {
    if (!started()) return (CFG.durationMinutes || 90) * 60000;
    return Math.max(0, state.endAt - Date.now());
  }

  function renderTimer() {
    var nodes = qsa("[data-timer]");
    var left = msLeft();
    var text = started() ? formatClock(left) : "--:--";
    var urgent = started() && left < 10 * 60000;
    nodes.forEach(function (node) {
      node.textContent = text;
      node.classList.toggle("is-urgent", urgent);
      node.classList.toggle("is-idle", !started());
      node.setAttribute("title", started()
        ? "Time left in the competition"
        : "The competition has not been started yet");
    });
    var status = byId("competition-status");
    if (status) {
      if (!started()) {
        status.textContent = "Not started";
        status.className = "pill pill--status";
      } else if (over()) {
        status.textContent = "Finished";
        status.className = "pill pill--status is-over";
      } else {
        status.textContent = "Running";
        status.className = "pill pill--status is-live";
      }
    }
  }

  function startTimer() {
    if (timerHandle) window.clearInterval(timerHandle);
    renderTimer();
    timerHandle = window.setInterval(function () {
      renderTimer();
      if (over()) {
        window.clearInterval(timerHandle);
        timerHandle = null;
        renderPage();
        flash("Time is up - the board is now read only.", "error");
      }
    }, 1000);
  }

  function startCompetition() {
    var nowTs = Date.now();
    state.startedAt = nowTs;
    state.endAt = nowTs + (CFG.durationMinutes || 90) * 60000;
    saveState();
    renderPage();
    flash("Competition started - good luck, team!", "ok");
  }

  function restartCompetition() {
    if (!window.confirm("Restart the competition clock? Your solved challenges and points are kept.")) {
      return;
    }
    var nowTs = Date.now();
    state.startedAt = nowTs;
    state.endAt = nowTs + (CFG.durationMinutes || 90) * 60000;
    saveState();
    renderPage();
    flash("Competition restarted - the clock runs again from 90 minutes.", "ok");
  }

  /* ================================================================== */
  /* hashing                                                            */
  /* ================================================================== */

  function normalize(answer, caseSensitive) {
    var text = String(answer == null ? "" : answer).replace(/\s+/g, " ").trim();
    if (!caseSensitive) {
      text = text.toLowerCase().replace(/[,.;:!?]/g, " ").replace(/\s+/g, " ").trim();
    }
    return text;
  }

  function toHex(buffer) {
    var bytes = new Uint8Array(buffer);
    var out = "";
    for (var i = 0; i < bytes.length; i++) {
      out += ("0" + bytes[i].toString(16)).slice(-2);
    }
    return out;
  }

  function utf8(text) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text);
    return window.sha256Utf8Bytes(text);
  }

  /* crypto.subtle only exists in secure contexts - plain HTTP on a LAN is not
     one, therefore the pure JavaScript fallback in js/sha256.js. */
  function hashText(text) {
    if (window.crypto && window.crypto.subtle && window.crypto.subtle.digest) {
      try {
        return window.crypto.subtle.digest("SHA-256", utf8(text)).then(toHex);
      } catch (e) {
        /* fall through to the JS implementation */
      }
    }
    if (typeof window.sha256Hex === "function") {
      return Promise.resolve(window.sha256Hex(text));
    }
    return Promise.reject(new Error("no SHA-256 implementation available"));
  }

  function hashAnswer(answer, caseSensitive) {
    return hashText(CFG.salt + "::" + normalize(answer, caseSensitive));
  }

  function candidateAnswers(input, ch) {
    var caseSensitive = ch.caseSensitive !== false;
    var out = [];
    var plain = normalize(input, caseSensitive);
    if (plain) out.push(plain);
    if (!caseSensitive) {
      var match = /^ctf\{([\s\S]*)\}$/i.exec(plain);
      if (match) {
        var inner = normalize(match[1], caseSensitive);
        if (inner && out.indexOf(inner) === -1) out.push(inner);
      }
    }
    return out;
  }

  function checkAnswer(ch, input) {
    var candidates = candidateAnswers(input, ch);
    if (!candidates.length) return Promise.resolve(false);
    return Promise.all(candidates.map(function (candidate) {
      return hashAnswer(candidate, ch.caseSensitive !== false);
    })).then(function (hashes) {
      var accepted = [String(ch.flagHash || "").toLowerCase()]
        .concat((ch.altHashes || []).map(function (h) { return String(h).toLowerCase(); }));
      return hashes.some(function (hash) {
        return accepted.indexOf(String(hash).toLowerCase()) !== -1;
      });
    });
  }

  /* ================================================================== */
  /* header                                                             */
  /* ================================================================== */

  function renderHeader() {
    var team = byId("hdr-team");
    if (team) {
      team.textContent = state.team ? state.team.name : "not registered";
    }
    var score = byId("hdr-score");
    if (score) score.textContent = String(totalScore());
    var solved = byId("hdr-solved");
    if (solved) solved.textContent = String(solvedCount());
    renderTimer();
  }

  /* ================================================================== */
  /* home page                                                          */
  /* ================================================================== */

  function renderHome() {
    var form = byId("registration-form");
    var teamCard = byId("team-card");
    var startButton = byId("start-button");
    var resetButton = byId("reset-button");

    if (form && state.team) {
      form.elements.teamName.value = state.team.name || "";
      form.elements.school.value = state.team.school || "";
      (state.team.members || []).forEach(function (member, index) {
        if (form.elements["member" + (index + 1)]) {
          form.elements["member" + (index + 1)].value = member;
        }
      });
    }

    if (teamCard) {
      if (state.team) {
        teamCard.hidden = false;
        var nameEl = byId("team-name");
        var schoolEl = byId("team-school");
        var membersEl = byId("team-members");
        if (nameEl) nameEl.textContent = state.team.name;
        if (schoolEl) schoolEl.textContent = state.team.school || "-";
        if (membersEl) {
          membersEl.innerHTML = "";
          (state.team.members || []).forEach(function (member, index) {
            var li = document.createElement("li");
            li.textContent = (index + 1) + ". " + member;
            membersEl.appendChild(li);
          });
        }
        var teamScore = byId("team-score");
        if (teamScore) teamScore.textContent = String(totalScore());
      } else {
        teamCard.hidden = true;
      }
    }

    if (startButton) {
      if (!started()) {
        startButton.textContent = "Start Competition";
        startButton.disabled = !state.team;
        startButton.setAttribute("data-action", "start");
      } else if (CFG.practiceMode) {
        startButton.textContent = "Restart competition";
        startButton.disabled = false;
        startButton.setAttribute("data-action", "restart");
      } else if (over()) {
        startButton.textContent = "Competition finished";
        startButton.disabled = true;
        startButton.removeAttribute("data-action");
      } else {
        startButton.textContent = "Competition running - " + formatClock(msLeft());
        startButton.disabled = true;
        startButton.removeAttribute("data-action");
      }
    }

    if (resetButton) {
      resetButton.hidden = !CFG.practiceMode;
    }

    var lockNote = byId("writeups-lock-note");
    if (lockNote) {
      lockNote.textContent = writeupsUnlocked()
        ? "The writeups are open."
        : "The writeups stay locked until the competition is over (or until you solve a challenge in practice mode).";
    }
  }

  function submitRegistration(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var teamName = String(form.elements.teamName.value || "").trim();
    var school = String(form.elements.school.value || "").trim();
    var members = [];
    for (var i = 1; i <= 3; i++) {
      var value = String(form.elements["member" + i].value || "").trim();
      if (!value) {
        flash("All three team members are required.", "error");
        form.elements["member" + i].focus();
        return;
      }
      members.push(value);
    }
    if (!teamName) {
      flash("Please enter a team name.", "error");
      form.elements.teamName.focus();
      return;
    }
    state.team = { name: teamName, school: school, members: members };
    saveState();
    renderPage();
    flash("Team registered. Start the competition when you are ready.", "ok");
  }

  /* ================================================================== */
  /* challenge board                                                    */
  /* ================================================================== */

  var boardFilter = { difficulty: "all", topic: "all", search: "" };

  function renderBoard() {
    var board = byId("board");
    var lock = byId("board-lock");
    if (!board) return;

    if (!started()) {
      board.hidden = true;
      if (lock) {
        lock.hidden = false;
        var msg = byId("board-lock-message");
        if (msg) {
          msg.textContent = state.team
            ? "Your team is registered. Start the competition on the home page to unlock the challenge board."
            : "Register your team and start the competition on the home page to unlock the challenge board.";
        }
      }
      renderHeader();
      return;
    }
    board.hidden = false;
    if (lock) lock.hidden = true;

    var challenges = visibleChallenges().filter(function (ch) {
      if (boardFilter.difficulty !== "all" && ch.difficulty !== boardFilter.difficulty) return false;
      if (boardFilter.topic !== "all" && ch.category !== boardFilter.topic) return false;
      if (boardFilter.search) {
        var haystack = (ch.title + " " + ch.description + " " + ch.topic + " " +
          (ch.tools || []).join(" ")).toLowerCase();
        if (haystack.indexOf(boardFilter.search.toLowerCase()) === -1) return false;
      }
      return true;
    });

    var html = "";
    var categories = CFG.categories || [];
    categories.forEach(function (category) {
      var list = challenges.filter(function (ch) { return ch.category === category.name; });
      if (!list.length) return;
      var solvedHere = list.filter(isSolved).length;
      html += '<section class="topic-group" aria-labelledby="cat-' + esc(category.short) + '">' +
        '<h2 class="topic-group__title" id="cat-' + esc(category.short) + '">' +
        '<span class="topic-group__name">' + esc(category.name) + "</span>" +
        '<span class="topic-group__count">' + solvedHere + " / " + list.length + " solved</span>" +
        "</h2>" +
        '<div class="card-grid">';
      list.forEach(function (ch) { html += cardHtml(ch); });
      html += "</div></section>";
    });

    if (!html) {
      html = '<p class="empty-state">No challenge matches the current filter.</p>';
    }
    board.innerHTML = html;

    var summary = byId("board-summary");
    if (summary) {
      summary.textContent = solvedCount() + " / " + visibleChallenges().length +
        " solved - " + totalScore() + " points - " +
        (over() ? "competition finished" : formatClock(msLeft()) + " left");
    }

    var notice = byId("board-notice");
    if (notice) {
      if (over()) {
        notice.textContent = "Time is up - the board is read only and every submission is closed.";
        notice.hidden = false;
      } else {
        notice.hidden = true;
      }
    }
    board.classList.toggle("is-readonly", over());
    renderHeader();
  }

  function cardHtml(ch) {
    var solved = isSolved(ch);
    var locked = isLocked(ch);
    var classes = ["card"];
    if (solved) classes.push("is-solved");
    if (locked) classes.push("is-locked");
    var statusText = solved ? "Solved" : (locked ? "Locked" : "Open");
    var statusIcon = solved ? "&#10003;" : (locked ? "&#128274;" : "&#9679;");
    var left = attemptsLeft(ch);
    var award = solved && state.solved[ch.id] && typeof state.solved[ch.id].points === "number"
      ? state.solved[ch.id].points : awardFor(ch);
    var label = ch.title + " - " + (CFG.difficultyLabels[ch.difficulty] || ch.difficulty) +
      " - " + basePoints(ch) + " points - " + statusText;
    return '<article class="' + classes.join(" ") + '" tabindex="0" role="button" data-challenge="' +
      esc(ch.id) + '" aria-label="' + esc(label) + '">' +
      '<div class="card__top">' +
      '<span class="badge badge--' + esc(ch.difficulty) + '">' +
      esc(CFG.difficultyLabels[ch.difficulty] || ch.difficulty) + "</span>" +
      '<span class="card__points">' + basePoints(ch) + " pts</span>" +
      "</div>" +
      '<h3 class="card__title">' + esc(ch.title) + "</h3>" +
      '<p class="card__topic">' + esc(ch.topic || "") + "</p>" +
      '<p class="card__meta">' +
      (solved ? "Awarded " + award + " pts" : basePoints(ch) + " pts" + (hintDeduction(ch) ? " (" + hintDeduction(ch) + " pts lost on hints)" : "")) +
      "</p>" +
      '<p class="card__attempts">' + left + "/" + (CFG.maxAttempts || 3) + " attempts left</p>" +
      '<p class="card__status card__status--' + (solved ? "solved" : (locked ? "locked" : "open")) + '">' +
      statusIcon + " " + statusText + "</p>" +
      "</article>";
  }

  /* ================================================================== */
  /* challenge modal                                                    */
  /* ================================================================== */

  function openModal(ch) {
    var modal = byId("challenge-modal");
    if (!modal) return;
    lastFocused = document.activeElement;
    pendingHint = null;
    modal.dataset.challenge = ch.id;

    var solved = isSolved(ch);
    var locked = isLocked(ch);
    var readOnly = !started() || over();

    byId("modal-title").textContent = ch.title;
    var category = byId("modal-category");
    if (category) category.textContent = ch.category + (ch.topic ? " - " + ch.topic : "");
    byId("modal-badges").innerHTML =
      '<span class="badge badge--' + esc(ch.difficulty) + '">' +
      esc(CFG.difficultyLabels[ch.difficulty] || ch.difficulty) + "</span>" +
      '<span class="badge badge--points">' + basePoints(ch) + " pts</span>" +
      (solved ? '<span class="badge badge--solved">&#10003; Solved</span>' : "") +
      (locked ? '<span class="badge badge--locked">&#128274; Locked</span>' : "");

    byId("modal-description").textContent = ch.description;

    var toolsEl = byId("modal-tools");
    if (toolsEl) {
      toolsEl.innerHTML = "";
      if (ch.tools && ch.tools.length) {
        toolsEl.hidden = false;
        var strong = document.createElement("strong");
        strong.textContent = "Recommended Kali tools: ";
        toolsEl.appendChild(strong);
        ch.tools.forEach(function (tool, index) {
          if (index) toolsEl.appendChild(document.createTextNode(", "));
          var code = document.createElement("code");
          code.textContent = tool;
          toolsEl.appendChild(code);
        });
      } else {
        toolsEl.hidden = true;
      }
    }

    var refEl = byId("modal-reference");
    if (refEl) {
      refEl.innerHTML = "";
      if (ch.link) {
        var refLink = document.createElement("a");
        refLink.href = ch.link;
        refLink.target = "_blank";
        refLink.rel = "noopener";
        refLink.className = "modal__link";
        refLink.textContent = "Reference: " + ch.category + " tool guide";
        refEl.appendChild(refLink);
        refEl.hidden = false;
      } else {
        refEl.hidden = true;
      }
    }

    var filesEl = byId("modal-files");
    if (filesEl) {
      filesEl.innerHTML = "";
      if (ch.files && ch.files.length) {
        var fileList = document.createElement("ul");
        fileList.className = "file-list";
        ch.files.forEach(function (file) {
          var li = document.createElement("li");
          var link = document.createElement("a");
          link.href = file;
          link.download = file.split("/").pop();
          link.textContent = "download " + file.split("/").pop();
          li.appendChild(link);
          fileList.appendChild(li);
        });
        filesEl.appendChild(fileList);
      } else {
        var none = document.createElement("p");
        none.className = "muted";
        none.textContent = "No files for this challenge - the question is in the description.";
        filesEl.appendChild(none);
      }
    }

    renderHints(ch);
    renderModalFooter(ch, solved, locked, readOnly);
    clearFeedback();

    modal.hidden = false;
    document.body.classList.add("modal-open");
    var input = byId("flag-input");
    if (input && !readOnly && !solved && !locked) {
      window.setTimeout(function () { input.focus(); }, 30);
    } else {
      var close = byId("modal-close");
      if (close) close.focus();
    }
  }

  function renderHints(ch) {
    var box = byId("modal-hints");
    if (!box) return;
    box.innerHTML = "";
    var hints = ch.hints || [];
    var used = hintsFor(ch);
    var heading = document.createElement("h3");
    heading.textContent = "Hints";
    box.appendChild(heading);

    if (!hints.length) {
      var none = document.createElement("p");
      none.className = "muted";
      none.textContent = "This challenge has no hints.";
      box.appendChild(none);
      return;
    }

    var list = document.createElement("ol");
    list.className = "hint-list";
    hints.forEach(function (hint, index) {
      var li = document.createElement("li");
      var revealed = used.indexOf(index) !== -1;
      if (revealed) {
        li.className = "hint hint--open";
        var text = document.createElement("p");
        text.textContent = hint.text;
        li.appendChild(text);
      } else {
        li.className = "hint";
        var lockedText = document.createElement("p");
        lockedText.className = "muted";
        lockedText.textContent = index > 0
          ? "Unlock the previous hint first."
          : "Revealing this hint costs " + hintCost(ch, index) + " points.";
        li.appendChild(lockedText);
        var button = document.createElement("button");
        button.type = "button";
        button.className = "btn btn--ghost btn--small";
        button.setAttribute("data-hint-index", String(index));
        var confirming = pendingHint && pendingHint.challengeId === ch.id &&
          pendingHint.index === index;
        if (confirming) {
          button.textContent = "Confirm: spend " + hintCost(ch, index) + " pts";
          button.classList.add("btn--danger");
        } else {
          button.textContent = "Reveal hint (-" + hintCost(ch, index) + " pts)";
        }
        button.disabled = !(index === 0 || used.indexOf(index - 1) !== -1);
        button.addEventListener("click", function () {
          if (confirming) {
            unlockHint();
            return;
          }
          pendingHint = { challengeId: ch.id, index: index };
          renderHints(ch);
          var next = qs('[data-hint-index="' + index + '"]', box);
          if (next) next.focus();
        });
        li.appendChild(button);
      }
      list.appendChild(li);
    });
    box.appendChild(list);
  }

  function renderModalFooter(ch, solved, locked, readOnly) {
    var meta = byId("modal-meta");
    if (meta) {
      var parts = [];
      parts.push(attemptsLeft(ch) + " of " + (CFG.maxAttempts || 3) + " attempts left");
      if (hintsFor(ch).length) {
        parts.push(hintsFor(ch).length + " hint(s) used (-" + hintDeduction(ch) + " pts)");
      }
      parts.push("Award if solved now: " + awardFor(ch) + " pts");
      if (solved && state.solved[ch.id]) {
        parts.push("solved at " + formatDate(state.solved[ch.id].at));
      }
      meta.textContent = parts.join(" - ");
    }

    var feedback = byId("modal-feedback");
    if (feedback) {
      feedback.className = "feedback";
    }

    var submit = byId("submit-flag");
    var input = byId("flag-input");
    var note = byId("modal-note");

    if (solved) {
      if (input) { input.disabled = true; input.value = ""; }
      if (submit) { submit.disabled = true; submit.textContent = "Already solved"; }
      if (note) note.textContent = "This challenge is solved. Points were already added to your score.";
      return;
    }
    if (locked) {
      if (input) { input.disabled = true; input.value = ""; }
      if (submit) { submit.disabled = true; submit.textContent = "Locked"; }
      if (note) {
        note.textContent = "All " + (CFG.maxAttempts || 3) + " attempts were used - this challenge is locked for good.";
      }
      return;
    }
    if (readOnly) {
      if (input) { input.disabled = true; input.value = ""; }
      if (submit) { submit.disabled = true; submit.textContent = "Submissions closed"; }
      if (note) {
        note.textContent = over()
          ? "The competition is over - submissions are blocked."
          : "The competition has not started yet.";
      }
      return;
    }
    if (input) { input.disabled = false; }
    if (submit) { submit.disabled = false; submit.textContent = "Submit flag"; }
    if (note) {
      note.textContent = ch.caseSensitive === false
        ? "Answer only - case and punctuation do not matter."
        : "Flags are case sensitive.";
    }
  }

  function closeModal() {
    var modal = byId("challenge-modal");
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove("modal-open");
    pendingHint = null;
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  function setFeedback(message, tone) {
    var box = byId("modal-feedback");
    if (!box) return;
    box.textContent = message;
    box.className = "feedback feedback--" + (tone || "info");
  }

  function clearFeedback() {
    var box = byId("modal-feedback");
    if (!box) return;
    box.textContent = "";
    box.className = "feedback";
  }

  function submitFlag() {
    var modal = byId("challenge-modal");
    var ch = modal && modal.dataset.challenge ? findChallenge(modal.dataset.challenge) : null;
    if (!ch) return;
    if (!started() || over()) {
      setFeedback("Submissions are closed.", "error");
      return;
    }
    if (isSolved(ch)) { setFeedback("Already solved.", "info"); return; }
    if (isLocked(ch)) { setFeedback("This challenge is locked.", "error"); return; }

    var input = byId("flag-input");
    var value = input ? input.value : "";
    if (!String(value).trim()) {
      setFeedback("Enter a flag first.", "error");
      if (input) input.focus();
      return;
    }

    var submit = byId("submit-flag");
    if (submit) submit.disabled = true;

    checkAnswer(ch, value).then(function (correct) {
      if (submit) submit.disabled = false;
      if (correct) {
        var award = awardFor(ch);
        state.solved[ch.id] = {
          at: Date.now(),
          points: award,
          hints: hintsFor(ch).slice()
        };
        state.lastSolveAt = Date.now();
        saveState();
        setFeedback("Correct! +" + award + " points added to your score.", "ok");
        var card = qs('[data-challenge="' + ch.id + '"]');
        if (card) {
          card.classList.add("is-solved");
          card.classList.add("just-solved");
          window.setTimeout(function () { card.classList.remove("just-solved"); }, 1200);
        }
        renderHints(ch);
        renderModalFooter(ch, true, isLocked(ch), over());
        renderHeader();
        renderBoard();
        if (input) input.value = "";
      } else {
        state.attempts[ch.id] = attemptsUsed(ch) + 1;
        var left = attemptsLeft(ch);
        if (left <= 0) {
          if (state.locked.indexOf(ch.id) === -1) state.locked.push(ch.id);
          saveState();
          setFeedback("Wrong flag - no attempts left. This challenge is now locked.", "error");
        } else {
          saveState();
          setFeedback("Wrong flag - " + left + " attempt(s) left.", "error");
        }
        renderModalFooter(ch, isSolved(ch), isLocked(ch), over());
        renderBoard();
      }
    }).catch(function (error) {
      if (submit) submit.disabled = false;
      setFeedback("Hashing failed: " + error.message, "error");
    });
  }

  function unlockHint() {
    if (!pendingHint) return;
    var modal = byId("challenge-modal");
    var ch = findChallenge(pendingHint.challengeId);
    if (!ch) return;
    if (isSolved(ch)) { pendingHint = null; renderHints(ch); return; }
    var index = pendingHint.index;
    var used = hintsFor(ch);
    if (used.indexOf(index) !== -1) { pendingHint = null; renderHints(ch); return; }
    if (index > 0 && used.indexOf(index - 1) === -1) { pendingHint = null; renderHints(ch); return; }
    used.push(index);
    state.hints[ch.id] = used;
    saveState();
    pendingHint = null;
    renderHints(ch);
    renderModalFooter(ch, isSolved(ch), isLocked(ch), over());
    renderBoard();
    setFeedback("Hint " + (index + 1) + " revealed (-" + hintCost(ch, index) + " points).", "info");
  }

  /* ================================================================== */
  /* scoreboard                                                         */
  /* ================================================================== */

  function loadRivals() {
    var fallback = window.CTF_RIVAL_TEAMS || [];
    var url = CFG.rivalScoreboardUrl;
    if (!url || typeof window.fetch !== "function") return Promise.resolve(fallback);
    return window.fetch(url, { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("status " + response.status);
        return response.json();
      })
      .then(function (data) {
        var teams = (data && data.teams) ? data.teams : data;
        if (!teams || !teams.length) throw new Error("empty scoreboard");
        return teams;
      })
      .catch(function () {
        /* file:// blocks fetch(), or the file is missing - use the JS copy */
        return fallback;
      });
  }

  function myTeamEntry() {
    return {
      name: state.team ? state.team.name : "Your team",
      school: state.team ? (state.team.school || "") : "not registered",
      score: totalScore(),
      solved: solvedCount(),
      lastSolve: lastSolveTimestamp(),
      mine: true
    };
  }

  function renderScoreboard() {
    var tbody = byId("standings-body");
    if (!tbody) return;

    loadRivals().then(function (rivals) {
      var entries = rivals.map(function (team) {
        return {
          name: team.name || "Team",
          school: team.school || "",
          score: Number(team.score || 0),
          solved: Number(team.solved || 0),
          lastSolve: team.lastSolve ? Date.parse(team.lastSolve) : null,
          mine: false
        };
      });
      entries.push(myTeamEntry());

      entries.sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        var aTime = a.lastSolve || Number.MAX_SAFE_INTEGER;
        var bTime = b.lastSolve || Number.MAX_SAFE_INTEGER;
        if (aTime !== bTime) return aTime - bTime;
        return a.name.localeCompare(b.name);
      });

      var ended = over();
      var html = "";
      entries.forEach(function (entry, index) {
        var rank = index + 1;
        var medal = "";
        if (ended && rank === 1) medal = '<span class="medal medal--champion">Champion</span>';
        else if (ended && rank === 2) medal = '<span class="medal medal--first">1st Runner-up</span>';
        else if (ended && rank === 3) medal = '<span class="medal medal--second">2nd Runner-up</span>';
        html += "<tr" + (entry.mine ? ' class="is-mine"' : "") + ">" +
          "<td class=\"cell-rank\">" + rank + "</td>" +
          "<td class=\"cell-team\">" + esc(entry.name) + (entry.mine ? " <span class=\"tag\">you</span>" : "") +
          (medal ? " " + medal : "") + '<br><span class="muted">' + esc(entry.school) + "</span></td>" +
          "<td class=\"cell-score\">" + entry.score + "</td>" +
          "<td>" + entry.solved + "</td>" +
          "<td class=\"muted\">" + (entry.lastSolve ? formatDate(entry.lastSolve) : "-") + "</td>" +
          "</tr>";
      });
      tbody.innerHTML = html;

      var myRank = entries.findIndex(function (entry) { return entry.mine; }) + 1;
      var rankEl = byId("my-rank");
      if (rankEl) rankEl.textContent = myRank ? "#" + myRank : "-";
      var myScore = byId("my-score");
      if (myScore) myScore.textContent = String(totalScore());
      var mySolved = byId("my-solved");
      if (mySolved) mySolved.textContent = String(solvedCount());
      var myTime = byId("my-time");
      if (myTime) {
        myTime.textContent = started()
          ? (over() ? "finished" : formatClock(msLeft()) + " left")
          : "not started";
      }
      var hintsUsed = byId("my-hints");
      if (hintsUsed) {
        var totalHints = Object.keys(state.hints).reduce(function (sum, id) {
          return sum + (state.hints[id] || []).length;
        }, 0);
        hintsUsed.textContent = String(totalHints);
      }
      var attemptsUsedEl = byId("my-attempts");
      if (attemptsUsedEl) {
        var totalAttempts = Object.keys(state.attempts).reduce(function (sum, id) {
          return sum + (state.attempts[id] || 0);
        }, 0);
        attemptsUsedEl.textContent = String(totalAttempts);
      }
      renderTopicBars();
      renderHeader();
      var resetButton = byId("reset-button");
      if (resetButton) resetButton.hidden = !CFG.practiceMode;
    });
  }

  function renderTopicBars() {
    var box = byId("topic-breakdown");
    if (!box) return;
    box.innerHTML = "";
    (CFG.categories || []).forEach(function (category) {
      var list = visibleChallenges().filter(function (ch) { return ch.category === category.name; });
      var solved = list.filter(isSolved).length;
      var row = document.createElement("div");
      row.className = "progress-row";
      var label = document.createElement("span");
      label.className = "progress-row__label";
      label.textContent = category.short || category.name;
      var bar = document.createElement("span");
      bar.className = "progress";
      var fill = document.createElement("span");
      fill.className = "progress__fill";
      fill.style.width = (list.length ? Math.round((solved / list.length) * 100) : 0) + "%";
      bar.appendChild(fill);
      var value = document.createElement("span");
      value.className = "progress-row__value";
      value.textContent = solved + "/" + list.length;
      row.appendChild(label);
      row.appendChild(bar);
      row.appendChild(value);
      box.appendChild(row);
    });
  }

  function exportProgress() {
    var payload = {
      format: "itso26-ctf-progress",
      version: CFG.storageVersion || 1,
      exportedAt: new Date().toISOString(),
      event: CFG.eventName + " - " + CFG.categoryName,
      team: state.team,
      startedAt: state.startedAt,
      endAt: state.endAt,
      solved: state.solved,
      hints: state.hints,
      attempts: state.attempts,
      locked: state.locked,
      score: totalScore(),
      solvedCount: solvedCount()
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "itso26-progress-" + slug(state.team && state.team.name) + ".json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    flash("Progress exported as JSON.", "ok");
  }

  function importProgress(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(String(reader.result));
        if (!data || typeof data !== "object") throw new Error("not a progress file");
        if (!data.solved && !data.team) throw new Error("unrecognised progress file");
        state.team = data.team || state.team;
        state.startedAt = data.startedAt || state.startedAt;
        state.endAt = data.endAt || state.endAt;
        state.solved = data.solved || {};
        state.hints = data.hints || {};
        state.attempts = data.attempts || {};
        state.locked = data.locked || [];
        state.lastSolveAt = null;
        saveState();
        renderPage();
        flash("Progress imported (" + solvedCount() + " solved, " + totalScore() + " points).", "ok");
      } catch (error) {
        flash("Import failed: " + error.message, "error");
      }
    };
    reader.onerror = function () { flash("Import failed: could not read the file.", "error"); };
    reader.readAsText(file);
  }

  /* ================================================================== */
  /* writeups                                                           */
  /* ================================================================== */

  function writeupsUnlocked() {
    if (CFG.practiceMode) return true;
    if (over()) return true;
    return solvedCount() > 0;
  }

  function renderWriteups() {
    var box = byId("writeup-list");
    if (!box) return;
    var lock = byId("writeups-lock");
    var unlocked = writeupsUnlocked();

    if (lock) lock.hidden = unlocked;
    if (box) box.hidden = !unlocked;
    if (!unlocked) {
      renderHeader();
      return;
    }

    var html = "";
    visibleChallenges().forEach(function (ch) {
      html += '<article class="writeup" id="writeup-' + esc(ch.id) + '">' +
        '<h3 class="writeup__title">' +
        '<span class="badge badge--' + esc(ch.difficulty) + '">' +
        esc(CFG.difficultyLabels[ch.difficulty] || ch.difficulty) + "</span> " +
        esc(ch.title) +
        (ch.id === CFG.tiebreakerId ? ' <span class="tag">tiebreaker</span>' : "") +
        "</h3>" +
        '<pre class="writeup__body">' + esc(ch.writeup || "No writeup yet.") + "</pre>" +
        "</article>";
    });
    box.innerHTML = html;
    renderHeader();
  }

  /* ================================================================== */
  /* page wiring                                                        */
  /* ================================================================== */

  function renderPage() {
    var page = document.body.getAttribute("data-page");
    if (page === "home") renderHome();
    else if (page === "challenges") renderBoard();
    else if (page === "scoreboard") renderScoreboard();
    else if (page === "writeups") renderWriteups();
    renderHeader();
  }

  function trapFocus(event) {
    var modal = byId("challenge-modal");
    if (!modal || modal.hidden) return;
    if (event.key === "Escape") {
      closeModal();
      return;
    }
    if (event.key !== "Tab") return;
    var focusable = qsa('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])', modal)
      .filter(function (node) { return node.offsetParent !== null || node === document.activeElement; });
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function bindGlobalEvents() {
    document.addEventListener("keydown", trapFocus);

    var modal = byId("challenge-modal");
    if (modal) {
      modal.addEventListener("click", function (event) {
        if (event.target === modal) closeModal();
      });
    }
    var closeButton = byId("modal-close");
    if (closeButton) closeButton.addEventListener("click", closeModal);

    var submit = byId("submit-flag");
    if (submit) {
      submit.addEventListener("click", submitFlag);
      submit.addEventListener("click", function () { pendingHint = null; });
    }
    var input = byId("flag-input");
    if (input) {
      input.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          submitFlag();
        }
      });
    }
    var hintConfirm = byId("hint-confirm");
    if (hintConfirm) hintConfirm.addEventListener("click", unlockHint);

    var board = byId("board");    if (board) {
      board.addEventListener("click", function (event) {
        var card = closest(event.target, "[data-challenge]");
        if (!card) return;
        var ch = findChallenge(card.getAttribute("data-challenge"));
        if (ch) openModal(ch);
      });
      board.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        var card = closest(event.target, "[data-challenge]");
        if (!card) return;
        event.preventDefault();
        var ch = findChallenge(card.getAttribute("data-challenge"));
        if (ch) openModal(ch);
      });
    }

    var filterButtons = qsa("[data-filter-difficulty]");
    filterButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        boardFilter.difficulty = button.getAttribute("data-filter-difficulty");
        filterButtons.forEach(function (other) {
          other.setAttribute("aria-pressed", other === button ? "true" : "false");
        });
        renderBoard();
      });
    });

    var topicSelect = byId("filter-topic");
    if (topicSelect) {
      topicSelect.addEventListener("change", function () {
        boardFilter.topic = topicSelect.value;
        renderBoard();
      });
    }

    var searchInput = byId("filter-search");
    if (searchInput) {
      searchInput.addEventListener("input", function () {
        boardFilter.search = searchInput.value;
        renderBoard();
      });
    }

    var registration = byId("registration-form");
    if (registration) registration.addEventListener("submit", submitRegistration);

    var startButton = byId("start-button");
    if (startButton) {
      startButton.addEventListener("click", function () {
        var action = startButton.getAttribute("data-action");
        if (action === "start") startCompetition();
        else if (action === "restart") restartCompetition();
      });
    }

    var resetButton = byId("reset-button");
    if (resetButton) {
      resetButton.addEventListener("click", function () {
        if (window.confirm("Reset everything? Team, timer, hints and all solved challenges will be deleted from this browser.")) {
          resetEverything();
          renderPage();
          flash("Everything has been reset.", "ok");
        }
      });
    }

    var exportButton = byId("export-button");
    if (exportButton) exportButton.addEventListener("click", exportProgress);

    var importButton = byId("import-button");
    var importInput = byId("import-input");
    if (importButton && importInput) {
      importButton.addEventListener("click", function () { importInput.click(); });
      importInput.addEventListener("change", function () {
        importProgress(importInput.files && importInput.files[0]);
        importInput.value = "";
      });
    }
  }

  function init() {
    loadState();
    bindGlobalEvents();
    renderPage();
    startTimer();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  /* expose a small API for debugging in the browser console */
  window.CTF = {
    getState: function () { return state; },
    getScore: totalScore,
    getChallenges: ALL,
    reset: resetEverything
  };
})();
