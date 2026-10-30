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
  var API = CFG.apiBase || "";
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

  function apiPath(path) { return API + path; }

  function apiFetch(path, opts) {
    var options = opts || {};
    options.headers = options.headers || {};
    if (options.body && typeof options.body !== "string") {
      options.body = JSON.stringify(options.body);
      options.headers["Content-Type"] = "application/json";
    }
    return window.fetch(apiPath(path), options).then(function (response) {
      if (!response.ok) {
        return response.text().then(function (text) {
          var err = new Error("HTTP " + response.status + (text ? ": " + text : ""));
          err.status = response.status;
          throw err;
        });
      }
      if (response.status === 204) return null;
      return response.json();
    });
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
      team: null,
      member: null,
      members: [],
      joinCode: null,
      solved: {},
      hints: {},
      attempts: {},
      locked: [],
      lastSolveAt: null
    };
  }

  function loadTeam() {
    return apiFetch("/api/me").then(function (data) {
      if (!data || !data.ok) {
        state = blankState();
        return state;
      }
      state = blankState();
      var team = data.team || null;
      var member = data.member || null;
      var members = data.members || [];

      // shape team for the lobby helpers (members/ready/mySlot indexed by slot)
      var teamMembers = ["", "", ""];
      var ready = [false, false, false];
      var mySlot = null;
      members.forEach(function (m) {
        teamMembers[m.slot] = m.name || "";
        ready[m.slot] = !!m.ready;
        if (member && m.id === member.id) mySlot = m.slot;
      });

      state.team = {
        id: team ? team.id : null,
        name: team ? team.name : null,
        school: team ? (team.school || "") : "",
        created_at: team ? team.created_at : null,
        started_at: team ? team.started_at : null,
        ended_at: team ? team.ended_at : null,
        members: teamMembers,
        ready: ready,
        mySlot: mySlot
      };
      state.member = member || null;
      state.members = members;
      state.solved = data.solved || {};
      state.hints = {};
      state.attempts = {};
      state.locked = [];
      state.lastSolveAt = null;

      Object.keys(state.solved).forEach(function (id) {
        var rec = state.solved[id];
        state.hints[id] = rec.hints || [];
        state.attempts[id] = rec.attempts || 0;
        if (rec.at && (!state.lastSolveAt || rec.at > state.lastSolveAt)) {
          state.lastSolveAt = rec.at;
        }
      });
      return state;
    }).catch(function () {
      state = blankState();
      return state;
    });
  }

  function saveState() {
    /* persisted server-side via /api/solutions and team APIs; nothing local */
  }

  function resetEverything() {
    /* handled by leaveTeam via API */
    return leaveTeam();
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

  function started() {
    return state.team && !!state.team.started_at && !!state.team.ended_at;
  }

  function over() {
    return started() && Date.now() >= state.team.ended_at;
  }

  function msLeft() {
    if (!started()) return (CFG.durationMinutes || 90) * 60000;
    return Math.max(0, state.team.ended_at - Date.now());
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

  function controlClock(action) {
    if (!state.team || !state.team.id) return Promise.reject(new Error("no team"));
    return apiFetch("/api/control", {
      method: "POST",
      body: { teamId: state.team.id, action: action }
    }).then(function (data) {
      if (state.team) {
        if (action === "start" || action === "restart") {
          state.team.started_at = data.startedAt;
          state.team.ended_at = data.endedAt;
        } else if (action === "end") {
          state.team.ended_at = data.endedAt;
        }
      }
      renderPage();
      return data;
    });
  }

  function startCompetition() {
    controlClock("start").then(function () {
      flash("Competition started - good luck, team!", "ok");
    }).catch(function (e) {
      flash(e.message || "Could not start competition.", "error");
    });
  }

  function restartCompetition() {
    if (!window.confirm("Restart the competition clock? Your solved challenges and points are kept.")) {
      return;
    }
    controlClock("restart").then(function () {
      flash("Competition restarted - the clock runs again from 90 minutes.", "ok");
    }).catch(function (e) {
      flash(e.message || "Could not restart competition.", "error");
    });
  }

  /* ================================================================== */
  /* team lobby (matchmaking)                                           */
  /* ================================================================== */

  function mySlotIndex() {
    return state.team && typeof state.team.mySlot === "number" ? state.team.mySlot : null;
  }

  function lobbyPlayers() {
    var team = state.team;
    if (!team) return [];
    var members = team.members || [];
    var ready = team.ready || [];
    var out = [];
    for (var i = 0; i < 3; i++) {
      out.push({
        index: i,
        name: String(members[i] || ""),
        ready: !!ready[i],
        isMe: i === mySlotIndex()
      });
    }
    return out;
  }

  function canStart() {
    if (!state.team || started() || over()) return false;
    var members = state.team.members || [];
    if (members.length < 3) return false;
    for (var i = 0; i < 3; i++) {
      if (!String(members[i] || "").trim()) return false;
    }
    var ready = state.team.ready || [];
    if (ready.length < 3) return false;
    for (var i = 0; i < 3; i++) {
      if (!ready[i]) return false;
    }
    return true;
  }

  function joinLobby(teamName, school, playerName) {
    if (!teamName || !playerName) return false;
    return apiFetch("/api/teams/create", {
      method: "POST",
      body: { name: teamName, school: school || "" }
    }).then(function (data) {
      state.joinCode = data.joinCode;
      return loadTeam().then(function () {
        state.joinCode = data.joinCode;
        renderPage();
        flash("Lobby created - you joined as player 1. Share the join code: " + data.joinCode, "ok");
        return true;
      });
    }).catch(function (e) {
      flash(e.message || "Could not create lobby.", "error");
      return false;
    });
  }

  function leaveTeam() {
    if (!state.team || !state.team.id) return Promise.resolve();
    if (!window.confirm("Leave your team? Your membership will be removed.")) return Promise.resolve();
    return apiFetch("/api/teams/leave", {
      method: "POST",
      body: { teamId: state.team.id }
    }).then(function () {
      return loadTeam().then(function () {
        renderPage();
        flash("You left the team.", "ok");
      });
    }).catch(function (e) {
      flash(e.message || "Could not leave team.", "error");
    });
  }

  function joinTeam(code, name) {
    if (!code || !name) return Promise.reject(new Error("join code and your name are required"));
    return apiFetch("/api/teams/join", {
      method: "POST",
      body: { code: code, name: name }
    }).then(function (data) {
      state.joinCode = null;
      return loadTeam().then(function () {
        renderPage();
        flash("Joined team " + esc(data.team.name) + " as player " + (data.member.slot + 1) + ".", "ok");
      });
    }).catch(function (e) {
      flash(e.message || "Could not join team - check the code.", "error");
    });
  }

  function setMyName(name) {
    if (!state.team) return false;
    var slot = mySlotIndex();
    if (slot === null) return false;
    name = String(name || "").trim();
    if (!name) return false;
    state.team.members[slot] = name;
    saveState();
    renderPage();
    return apiFetch("/api/teams/" + state.team.id, {
      method: "PATCH",
      body: { slot: slot, name: name }
    }).catch(function (e) {
      flash("Name saved locally but could not sync to server.", "warn");
    });
  }

  function toggleMyReady() {
    if (!state.team) return;
    var slot = mySlotIndex();
    if (slot === null) return;
    if (!String(state.team.members[slot] || "").trim()) return;
    var ready = state.team.ready || [];
    while (ready.length < 3) ready.push(false);
    ready[slot] = !ready[slot];
    state.team.ready = ready;
    saveState();
    renderPage();
    flash("You are now " + (ready[slot] ? "ready" : "not ready") + ".", "info");
    return apiFetch("/api/teams/" + state.team.id, {
      method: "PATCH",
      body: { slot: slot, ready: ready[slot] }
    }).catch(function (e) {
      flash("Ready state saved locally but could not sync to server.", "warn");
    });
  }

  function joinSlot(index, name) {
    if (!state.team) return false;
    if (index < 0 || index > 2) return false;
    name = String(name || "").trim();
    if (!name) return false;
    var members = state.team.members || [];
    while (members.length < 3) members.push("");
    var ready = state.team.ready || [];
    while (ready.length < 3) ready.push(false);
    members[index] = name;
    ready[index] = false;
    state.team.members = members;
    state.team.ready = ready;
    if (state.team.mySlot === null) {
      state.team.mySlot = index;
    }
    saveState();
    renderPage();
    flash(name + " joined as player " + (index + 1) + ".", "ok");
    return apiFetch("/api/teams/" + state.team.id, {
      method: "PATCH",
      body: { slot: index, name: name }
    }).catch(function (e) {
      flash("Slot saved locally but could not sync to server.", "warn");
    });
  }

  function toggleSlotReady(index) {
    if (!state.team) return;
    if (index < 0 || index > 2) return;
    if (!String(state.team.members[index] || "").trim()) return;
    var mySlot = mySlotIndex();
    // Only the creator can toggle another player's ready state
    if (index !== mySlot && mySlot !== 0) return;
    var ready = state.team.ready || [];
    while (ready.length < 3) ready.push(false);
    ready[index] = !ready[index];
    state.team.ready = ready;
    saveState();
    renderPage();
    flash("Player " + (index + 1) + " is now " + (ready[index] ? "ready" : "not ready") + ".", "info");
    return apiFetch("/api/teams/" + state.team.id, {
      method: "PATCH",
      body: { slot: index, ready: ready[index] }
    }).catch(function (e) {
      flash("Ready state saved locally but could not sync to server.", "warn");
    });
  }

  function endCompetition() {
    if (!started() || over()) return;
    if (!window.confirm("End the competition early? The board becomes read only and every submission is blocked.")) {
      return;
    }
    controlClock("end").then(function () {
      flash("Competition ended early - the board is now read only.", "error");
    }).catch(function (e) {
      flash(e.message || "Could not end competition.", "error");
    });
  }

  /* ================================================================== */
  /* hashing                                                            */
  /* ================================================================== */


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
    var joinForm = byId("join-form");
    var teamCard = byId("team-card");
    var joinCodeEl = byId("lobby-join-code");
    var joinCodeCopy = byId("lobby-join-code-copy");
    var startButton = byId("start-button");
    var endButton = byId("end-button");
    var playerGrid = byId("player-grid");
    var lobbyStatus = byId("lobby-status");
    var myNameInput = byId("my-name");
    var readyToggle = byId("ready-toggle");
    var creatorOnly = byId("lobby-creator-only");
    var memberOnly = byId("lobby-member-only");

    if (form) {
      if (state.team) {
        form.hidden = true;
      } else {
        form.hidden = false;
      }
    }

    if (joinForm) {
      joinForm.hidden = !!state.team;
    }

    if (teamCard) {
      if (state.team) {
        teamCard.hidden = false;
        var teamNameEl = byId("lobby-team-name");
        var schoolEl = byId("lobby-school");
        if (teamNameEl) teamNameEl.textContent = state.team.name;
        if (schoolEl) schoolEl.textContent = state.team.school || "-";

        var mySlot = mySlotIndex();
        var isCreator = mySlot === 0;

        // Join code visible only to the creator
        if (joinCodeEl) {
          joinCodeEl.textContent = isCreator ? (state.joinCode || "—") : "—";
        }
        if (joinCodeCopy) {
          joinCodeCopy.hidden = !isCreator;
        }

        // Creator vs member controls
        if (creatorOnly) creatorOnly.hidden = !isCreator;
        if (memberOnly) memberOnly.hidden = isCreator;

        var players = lobbyPlayers();
        var allNamed = players.every(function (p) { return !!p.name; });
        var allReady = allNamed && players.every(function (p) { return p.ready; });
        var waiting = allNamed ? 3 - players.filter(function (p) { return p.ready; }).length : null;
        var startedNow = started();

        if (playerGrid) {
          playerGrid.innerHTML = "";
          players.forEach(function (player) {
            var slot = document.createElement("div");
            slot.className = "player-slot" +
              (player.name ? "" : " is-empty") +
              (player.ready ? " is-ready" : "") +
              (player.isMe ? " is-me" : "");
            slot.setAttribute("data-slot", String(player.index));

            var dot = document.createElement("span");
            dot.className = "player__dot";
            slot.appendChild(dot);

            var num = document.createElement("span");
            num.className = "player__slot-num";
            num.textContent = String(player.index + 1);
            slot.appendChild(num);

            var name = document.createElement("span");
            name.className = "player__name" + (player.name ? "" : " is-empty");
            name.textContent = player.name ? player.name : "Player " + (player.index + 1) + " (empty)";
            slot.appendChild(name);

            var role = document.createElement("span");
            role.className = "player__role" + (player.isMe ? " is-me" : "");
            role.textContent = player.isMe ? "You" : (player.name ? "Player " + (player.index + 1) : "Empty");
            slot.appendChild(role);

            var readyBadge = document.createElement("span");
            readyBadge.className = "badge " + (player.ready ? "badge--solved" : "badge--locked");
            readyBadge.textContent = player.ready ? "ready" : "pending";
            slot.appendChild(readyBadge);

            playerGrid.appendChild(slot);
          });
        }

        if (lobbyStatus) {
          if (!startedNow) {
            if (!allNamed) {
              lobbyStatus.textContent = "Fill all three slots before the lobby is ready.";
              lobbyStatus.className = "lobby-status warn";
            } else if (allReady) {
              lobbyStatus.textContent = "All three players are ready - start the competition.";
              lobbyStatus.className = "lobby-status ok";
            } else {
              lobbyStatus.textContent = "Waiting on " + waiting + " player(s) to get ready.";
              lobbyStatus.className = "lobby-status warn";
            }
          } else if (over()) {
            lobbyStatus.textContent = "Competition finished.";
            lobbyStatus.className = "lobby-status error";
          } else {
            lobbyStatus.textContent = "Competition running - " + formatClock(msLeft()) + " left.";
            lobbyStatus.className = "lobby-status ok";
          }
        }

        if (myNameInput) {
          myNameInput.value = mySlot === null ? "" : String(state.team.members[mySlot] || "");
          myNameInput.disabled = startedNow;
          myNameInput.placeholder = mySlot === null ? "Your name" : "Your name";
        }

        if (readyToggle) {
          var myReady = mySlot !== null && !!((state.team.ready || [])[mySlot]);
          readyToggle.textContent = myReady ? "Ready" : "Not ready";
          readyToggle.className = "btn btn--primary ready-toggle" + (myReady ? " is-ready" : "");
          readyToggle.disabled = startedNow || mySlot === null || !String(state.team.members[mySlot] || "").trim();
          readyToggle.setAttribute("aria-pressed", String(myReady));
        }

        if (startButton) {
          if (!startedNow) {
            startButton.textContent = "Start Competition";
            startButton.disabled = !canStart();
            startButton.setAttribute("data-action", "start");
            startButton.hidden = !isCreator;
          } else if (CFG.practiceMode) {
            startButton.textContent = "Restart competition";
            startButton.disabled = false;
            startButton.setAttribute("data-action", "restart");
            startButton.hidden = !isCreator;
          } else if (over()) {
            startButton.textContent = "Competition finished";
            startButton.disabled = true;
            startButton.removeAttribute("data-action");
            startButton.hidden = !isCreator;
          } else {
            startButton.textContent = "Competition running - " + formatClock(msLeft());
            startButton.disabled = true;
            startButton.removeAttribute("data-action");
            startButton.hidden = !isCreator;
          }
        }

        if (endButton) {
          endButton.hidden = !isCreator || !startedNow || over();
        }
      } else {
        teamCard.hidden = true;
      }
    }

    var resetButton = byId("reset-button");
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
    var playerName = String(form.elements.playerName.value || "").trim();
    if (!teamName) {
      flash("Please enter a team name.", "error");
      form.elements.teamName.focus();
      return;
    }
    if (!playerName) {
      flash("Please enter your name.", "error");
      form.elements.playerName.focus();
      return;
    }
    joinLobby(teamName, school, playerName);
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

    apiFetch("/api/solutions", {
      method: "POST",
      body: { challengeId: ch.id, answer: value }
    }).then(function (data) {
      if (submit) submit.disabled = false;
      if (data.correct) {
        var award = data.pointsAwarded;
        var solvedAt = Date.now();
        state.solved[ch.id] = {
          at: solvedAt,
          points: award,
          hints: hintsFor(ch).slice()
        };
        state.lastSolveAt = solvedAt;
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
        var left = data.attemptsLeft;
        if (data.locked) {
          if (state.locked.indexOf(ch.id) === -1) state.locked.push(ch.id);
          saveState();
          setFeedback(data.message || "Wrong flag - no attempts left. This challenge is now locked.", "error");
        } else {
          saveState();
          setFeedback(data.message || "Wrong flag - " + left + " attempt(s) left.", "error");
        }
        renderModalFooter(ch, isSolved(ch), isLocked(ch), over());
        renderBoard();
      }
      if (input) input.value = "";
    }).catch(function (error) {
      if (submit) submit.disabled = false;
      setFeedback("Submission failed: " + error.message, "error");
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

  function fetchScoreboard() {
    return apiFetch("/api/scoreboard").then(function (data) {
      return (data && data.teams) || [];
    }).catch(function () {
      return [];
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

    fetchScoreboard().then(function (teams) {
      var entries = teams.map(function (team) {
        return {
          name: team.name || "Team",
          school: team.school || "",
          score: Number(team.score || 0),
          solved: Number(team.solved || 0),
          lastSolve: team.lastSolve ? Date.parse(team.lastSolve) : null,
          mine: team.id === (state.team ? state.team.id : null),
          rank: team.rank
        };
      });

      var ended = over();
      var html = "";
      entries.forEach(function (entry, index) {
        var rank = entry.rank || index + 1;
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

    var myNameInput = byId("my-name");
    if (myNameInput) {
      myNameInput.addEventListener("input", function () {
        setMyName(myNameInput.value);
      });
    }

    var readyToggle = byId("ready-toggle");
    if (readyToggle) {
      readyToggle.addEventListener("click", toggleMyReady);
    }

    var playerGrid = byId("player-grid");
    if (playerGrid) {
      playerGrid.addEventListener("click", function (event) {
        var slot = closest(event.target, "[data-slot]");
        if (!slot) return;
        var index = Number(slot.getAttribute("data-slot"));
        if (!state.team) return;
        var players = lobbyPlayers();
        var player = players[index];
        if (!player.name) {
          var name = prompt("Enter your name to join as player " + (index + 1) + ":", "");
          if (name) joinSlot(index, name);
          return;
        }
        toggleSlotReady(index);
      });
    }

    var registration = byId("registration-form");
    if (registration)     registration.addEventListener("submit", submitRegistration);

    var joinForm = byId("join-form");
    if (joinForm) {
      joinForm.addEventListener("submit", function (event) {
        event.preventDefault();
        var code = String(joinForm.elements.joinCode.value || "").trim();
        var name = String(joinForm.elements.joinPlayerName.value || "").trim();
        joinTeam(code, name);
      });
    }

    var startButton = byId("start-button");
    if (startButton) {
      startButton.addEventListener("click", function () {
        var action = startButton.getAttribute("data-action");
        if (action === "start") startCompetition();
        else if (action === "restart") restartCompetition();
      });
    }

    var endButton = byId("end-button");
    if (endButton) {
      endButton.addEventListener("click", endCompetition);
    }

    var resetButton = byId("reset-button");
    if (resetButton) {
      resetButton.addEventListener("click", function () {
        leaveTeam();
      });
    }

    var joinCodeCopy = byId("lobby-join-code-copy");
    if (joinCodeCopy) {
      joinCodeCopy.addEventListener("click", function () {
        var code = state.joinCode || "";
        if (!code) return;
        navigator.clipboard.writeText(code).then(function () {
          joinCodeCopy.textContent = "Copied!";
          setTimeout(function () { joinCodeCopy.textContent = "Copy"; }, 1200);
        });
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
    loadTeam().then(function () {
      bindGlobalEvents();
      renderPage();
      startTimer();
    });
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

