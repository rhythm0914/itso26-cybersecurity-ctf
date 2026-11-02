/**
 * _lib.js - shared helpers for the Cloudflare Pages Functions API.
 * Provides: json, cookie auth, session resolution, rate limiting,
 * password hashing, token generation, audit logging, notification helpers.
 */

export const JSON_HEADERS = { "Content-Type": "application/json" };

/**
 * Fallback CTF salt. The deployed value should come from env.CTF_SALT (a
 * Pages/Workers variable or secret); the fallback keeps `wrangler pages dev`
 * and fresh deployments working without extra setup. The seeded challenge
 * hashes in migrations/007 were generated with this exact string, so changing
 * it requires regenerating the flags.
 */

export const DEFAULT_CTF_SALT = "itso26-cybersecurity-ctf-v1";

export function ctfSalt(env) {
  return (env && env.CTF_SALT) || DEFAULT_CTF_SALT;
}

export function isSecureRequest(request) {
  try {
    const url = new URL(request.url);
    if (url.protocol === "https:") return true;
    return (request.headers.get("x-forwarded-proto") || "").split(",")[0].trim() === "https";
  } catch {
    return false;
  }
}

export function sessionCookie(token, maxAgeSeconds, secure) {
  if (secure === undefined) secure = false;
  return `cf_session=${token}; Path=/; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function clearedSessionCookie(secure) {
  return `cf_session=; Path=/; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Lax; Max-Age=0`;
}

export function memberCookie(memberId, maxAgeSeconds) {
  // Not HttpOnly: the offline lobby reads it from the page. It carries no
  // privilege beyond the team membership it identifies.
  return `ctf_member=${memberId}; Path=/; ${maxAgeSeconds ? `Max-Age=${maxAgeSeconds}; ` : ""}SameSite=Lax`;
}

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

export function errorResponse(message, status = 400) {
  return json({ error: message }, status);
}

export function getCookie(request, name) {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? match[1] : null;
}

export function randomToken() {
  return crypto.randomUUID();
}

export function now() {
  return Date.now();
}

/**
 * PBKDF2-SHA512 password hash, Web Crypto based (Cloudflare Workers supports it).
 * Format: $pbkdf2-sha512$<iterations>$<salt_base64>$<hash_base64>
 */

export async function hashPassword(password) {
  const iterations = 100000;
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-512" },
    key,
    512
  );
  const enc = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  return `$pbkdf2-sha512$${iterations}$${enc(salt)}$${enc(hash)}`;
}

export async function verifyPassword(password, stored) {
  const parts = stored.split("$");
  if (parts.length !== 5 || parts[0] !== "" || parts[1] !== "pbkdf2-sha512") return false;
  const iterations = Number(parts[2]);
  const salt = Uint8Array.from(atob(parts[3]), (c) => c.charCodeAt(0));
  const hashB64 = parts[4];
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-512" },
    key,
    512
  );
  const enc = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  return safeEqual(enc(hash), hashB64);
}

export function normalizeUsername(s) { return String(s || "").trim().toLowerCase(); }
export function normalizeEmail(s) { return String(s || "").trim().toLowerCase(); }
export function isValidEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }

/**
 * Rate limit using D1 rate_limits table.
 * Returns true if under limit, false if exceeded.
 */

export async function rateLimit(env, key, action, limitPerHour = 60) {
  const startMs = Date.now() - 60 * 60 * 1000;
  try {
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS c FROM rate_limits WHERE key = ? AND action = ? AND created_at > ?"
    ).bind(key, action, startMs).first();
    const count = row ? Number(row.c) : 0;
    if (count >= limitPerHour) return false;
    await env.DB.prepare(
      "INSERT INTO rate_limits (key, action, created_at) VALUES (?, ?, ?)"
    ).bind(key, action, Date.now()).run();
    // Best-effort pruning so the table does not grow without bound.
    if (Math.random() < 0.02) {
      env.DB.prepare("DELETE FROM rate_limits WHERE created_at < ?"
        .bind(startMs - 24 * 3600 * 1000)).run().catch(function () {});
    }
    return true;
  } catch (e) {
    return true; // if table missing, don't block
  }
}

/**
 * Server-side email sending via configurable provider.
 * Never pretends if provider missing.
 */

export async function sendEmail(env, { to, subject, text, html }) {
  const provider = env.EMAIL_PROVIDER;
  const apiKey = env.EMAIL_API_KEY;
  const from = env.EMAIL_FROM || "no-reply@localhost";
  if (!provider || !apiKey) return { ok: false, error: "email provider not configured" };
  try {
    if (provider === "resend") {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from, to, subject, text, html }),
      });
      if (!res.ok) {
        const txt = await res.text();
        return { ok: false, error: `resend error ${res.status}: ${txt}` };
      }
      return { ok: true };
    }
    if (provider === "sendgrid") {
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }], subject }],
          from: { email: from },
          content: [{ type: "text/html", value: html || text }],
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        return { ok: false, error: `sendgrid error ${res.status}: ${txt}` };
      }
      return { ok: true };
    }
    return { ok: false, error: `unknown email provider: ${provider}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function getSession(env, request) {
  const token = getCookie(request, "cf_session");
  if (!token) return null;
  const nowMs = Date.now();
  let row;
  try {
    row = await env.DB.prepare(
      `SELECT s.id, s.user_id, s.expires_at, u.username, u.email, u.role, u.email_verified, u.created_at`
    ).bind(token, nowMs).first();
  } catch (e) { return null; }
  if (!row) return null;
  return {
    sessionId: row.id,
    userId: row.user_id,
    username: row.username,
    email: row.email,
    role: row.role,
    emailVerified: !!row.email_verified,
    createdAt: row.created_at,
  };
}

export async function createSession(env, userId, opts = {}) {
  const id = crypto.randomUUID();
  const nowMs = Date.now();
  const ttl = Number(opts.ttlMs || 30 * 24 * 3600 * 1000);
  const expiresAt = nowMs + ttl;
  try {
    await env.DB.prepare(
      "INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)"
    ).bind(id, userId, nowMs, expiresAt).run();
  } catch (e) { return null; }
  const cookie = sessionCookie(id, Math.floor(ttl / 1000), opts.secure !== false);
  return { id, expiresAt, cookie };
}

export async function destroySession(env, request) {
  const token = getCookie(request, "cf_session");
  if (token) {
    try { await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(token).run(); } catch (e) {}
  }
  return clearedSessionCookie(isSecureRequest(request));
}

export async function requireAuth(env, request) {
  const session = await getSession(env, request);
  if (!session) return { ok: false, error: errorResponse("authentication required", 401) };
  return { ok: true, session };
}

export async function requireRole(env, request, allowedRoles) {
  const resolved = await requireAuth(env, request);
  if (!resolved.ok) return resolved;
  if (!allowedRoles.includes(resolved.session.role)) {
    return { ok: false, error: errorResponse("insufficient permissions", 403) };
  }
  return { ok: true, session: resolved.session };
}

export function cleanString(s) { return String(s || "").trim(); }

/**
 * Audit log helper. Best-effort; never blocks the caller.
 */

export async function audit(env, { actorId, actorUsername, action, targetType, targetId, detail = {}, ip }) {
  try {
    await env.DB.prepare(
      `INSERT INTO audit_logs (id, actor_id, actor_username, action, target_type, target_id, detail, ip, created_at)`
    ).bind(crypto.randomUUID(), actorId || null, actorUsername || null, action, targetType || null, targetId || null, JSON.stringify(detail), ip || null, Date.now()).run();
  } catch {}
}

export function normalizeAnswer(answer, caseSensitive) {
  let s = String(answer ?? '').trim();
  if (!caseSensitive) {
    const m = s.match(/^CTF\{(.*)\}$/i);
    if (m) s = m[1];
    s = s.toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  return s;
}

export async function sha256Hex(input) {
  const buf = new TextEncoder().encode(input);
  const d = await crypto.subtle.digest('SHA-256', buf);
  const arr = Array.from(new Uint8Array(d));
  return arr.map(function(b){ return b.toString(16).padStart(2, '0');}).join('');
}

export async function hashFlag(env, answer, caseSensitive) {
  return sha256Hex(ctfSalt(env) + '::' + normalizeAnswer(answer, caseSensitive));
}

export function safeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/**
 * Resolve the caller's team membership from either the authenticated session
 * (normal accounts) or the ctf_member cookie (offline lobby). Returns
 * { teamId, member, session } or null. This is the single source of truth used
 * by challenge submission, hints and clock control.
 */

export async function resolveTeam(env, request) {
  const session = await getSession(env, request);
  if (session) {
    try {
      const member = await env.DB.prepare(
        "SELECT id, team_id, slot_index, name, is_captain FROM team_members WHERE user_id = ? ORDER BY joined_at LIMIT 1"
      ).bind(session.userId).first();
      if (member) return { teamId: member.team_id, member, session };
    } catch { /* fall through to the member cookie */ }
  }
  const memberId = getCookie(request, "ctf_member");
  if (!memberId) return null;
  try {
    const member = await env.DB.prepare(
      "SELECT id, team_id, slot_index, name, is_captain FROM team_members WHERE id = ?"
    ).bind(memberId).first();
    if (!member) return null;
    return { teamId: member.team_id, member, session: null };
  } catch {
    return null;
  }
}

/** The configured competition length, in milliseconds. */

export function competitionDuration(env) {
  return Number(env && env.CTF_DURATION_MINUTES ? env.CTF_DURATION_MINUTES : 90) * 60 * 1000;
}
