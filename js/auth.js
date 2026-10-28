/**
 * auth.js - shared authentication client for the ITSO CTF platform.
 * Manages session (cf_session cookie) and exposes auth state + API helpers.
 */
(function () {
  "use strict";

  var API = (window.CTF_CONFIG && window.CTF_CONFIG.apiBase) || "";

  function api(path, opts) {
    var options = opts || {};
    options.headers = options.headers || {};
    options.credentials = "include"; // send HttpOnly session cookie
    if (options.body && typeof options.body !== "string") {
      options.body = JSON.stringify(options.body);
      options.headers["Content-Type"] = "application/json";
    }
    return fetch(API + path, options).then(function (res) {
      if (res.status === 401 || res.status === 403) {
        var err = new Error("HTTP " + res.status);
        err.status = res.status;
        throw err;
      }
      if (res.status === 204) return null;
      return res.json();
    });
  }

  var currentUser = null;
  var listeners = [];

  function notify() {
    listeners.forEach(function (fn) { try { fn(currentUser); } catch {} });
  }

  window.Auth = {
    getUser: function () { return currentUser; },
    isAuthenticated: function () { return !!currentUser; },
    onChange: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (l) { return l !== fn; }); }; },

    load: function () {
      return api("/api/me").then(function (data) {
        if (data && data.auth === "user" && data.user) {
          currentUser = data.user;
          currentUser.team = data.team || null;
          currentUser.member = data.member || null;
          currentUser.members = data.members || [];
        } else {
          currentUser = null;
        }
        notify();
        return currentUser;
      }).catch(function () {
        currentUser = null;
        notify();
        return null;
      });
    },

    register: function (fields) {
      return api("/api/auth/register", { method: "POST", body: fields }).then(function (data) {
        return data;
      });
    },

    login: function (email, password) {
      return api("/api/auth/login", { method: "POST", body: { email: email, password: password } }).then(function (data) {
        if (data && data.user) {
          currentUser = data.user;
          notify();
        }
        return data;
      });
    },

    logout: function () {
      return api("/api/auth/logout", { method: "POST" }).then(function () {
        currentUser = null;
        notify();
        return { ok: true };
      });
    },

    verifyEmail: function (token) {
      return api("/api/auth/verify-email", { method: "POST", body: { token: token } });
    },

    forgotPassword: function (email) {
      return api("/api/auth/forgot-password", { method: "POST", body: { email: email } });
    },

    resetPassword: function (token, newPassword) {
      return api("/api/auth/reset-password", { method: "POST", body: { token: token, new_password: newPassword } });
    },

    // Team API (user-authenticated)
    myTeams: function () { return api("/api/teams"); },
    teamDetail: function (teamId) { return api("/api/teams/" + encodeURIComponent(teamId)); },
    createTeam: function (fields) { return api("/api/teams/create", { method: "POST", body: fields }); },
    leaveTeam: function (teamId) { return api("/api/teams/leave", { method: "POST", body: { teamId: teamId } }); },
    submitJoinRequest: function (teamId, message) { return api("/api/teams/" + encodeURIComponent(teamId) + "/requests", { method: "POST", body: { message: message || "" } }); },
    listRequests: function (teamId, status) { return api("/api/teams/" + encodeURIComponent(teamId) + "/requests?status=" + (status || "pending")); },
    approveRequest: function (teamId, requestId) { return api("/api/teams/" + encodeURIComponent(teamId) + "/requests/" + encodeURIComponent(requestId) + "/approve", { method: "POST" }); },
    rejectRequest: function (teamId, requestId) { return api("/api/teams/" + encodeURIComponent(teamId) + "/requests/" + encodeURIComponent(requestId) + "/reject", { method: "POST" }); },
    chatMessages: function (teamId, before) { var u = "/api/teams/" + encodeURIComponent(teamId) + "/messages"; if (before) u += "?before=" + encodeURIComponent(before); return api(u); },
    sendMessage: function (teamId, body) { return api("/api/teams/" + encodeURIComponent(teamId) + "/messages", { method: "POST", body: { body: body } }); },
    notifications: function (unread) { var u = "/api/notifications"; if (unread) u += "?unread=1"; return api(u); },
    markNotificationsRead: function (ids) { return api("/api/notifications/mark-read", { method: "POST", body: { ids: ids } }); },
    announcements: function () { return api("/api/announcements"); },
    createAnnouncement: function (fields) { return api("/api/announcements", { method: "POST", body: fields }); },
    adminStats: function () { return api("/api/admin/stats"); },
    adminUsers: function () { return api("/api/admin/users"); },
    adminTeams: function () { return api("/api/admin/teams"); },
    adminAudit: function () { return api("/api/admin/audit"); },
  };
})();