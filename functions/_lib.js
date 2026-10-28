/**
 * _lib.js - shared helpers for the Cloudflare Pages Functions API.
 * Provides: json, cookie auth, session resolution, rate limiting,
 * password hashing, token generation, audit logging, notification helpers.
 */

export const JSON_HEADERS = { "Content-Type": "application/json" };

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
  return enc(hash) === hashB64;
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
      `SELECT s.id, s.user_id, s.expires_at, u.username, u.email, u.role, u.email_verified
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > ?`
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
  const cookie = `cf_session=${id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(ttl / 1000)}`;
  return { id, expiresAt, cookie };
}

export async function destroySession(env, request) {
  const token = getCookie(request, "cf_session");
  if (token) {
    try { await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(token).run(); } catch (e) {}
  }
  return `cf_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
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
      `INSERT INTO audit_logs (id, actor_id, actor_username, action, target_type, target_id, detail, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(crypto.randomUUID(), actorId || null, actorUsername || null, action, targetType || null, targetId || null, JSON.stringify(detail), ip || null, Date.now()).run();
  } catch {}
}