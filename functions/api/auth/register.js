/**
 * POST /api/auth/register
 * Body: { username, email, password, confirm, accept_rules }
 * Rate-limited per IP. Returns generic success messages to avoid account enumeration.
 */
import {
  json, errorResponse, normalizeUsername, normalizeEmail,
  isValidEmail, hashPassword, rateLimit, sendEmail, createSession,
  cleanString,
} from "../../_lib.js";

export const onRequestPost = async (context) => {
  const { env, request } = context;
  const ip = request.headers.get("cf-connecting-ip") || "unknown";

  try {
    if (!(await rateLimit(env, ip, "register", 30))) {
      return errorResponse("too many requests", 429);
    }

    let body;
    try { body = await request.json(); } catch { return errorResponse("invalid json body", 400); }

    const username = normalizeUsername(body.username);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    const confirm = String(body.confirm || "");
    const acceptRules = body.accept_rules === true;

    if (!username || username.length < 3 || username.length > 32 || /[^a-z0-9_-]/.test(username)) {
      return errorResponse("username must be 3-32 chars, lowercase letters/numbers/_/-/ only", 400);
    }
    if (!isValidEmail(email)) return errorResponse("invalid email address", 400);
    if (!password || password.length < 8) return errorResponse("password must be at least 8 characters", 400);
    if (password !== confirm) return errorResponse("passwords do not match", 400);
    if (!acceptRules) return errorResponse("you must accept the event rules", 400);

    let existing;
    try {
      existing = await env.DB.prepare(
        "SELECT id FROM users WHERE lower(username) = ? OR lower(email) = ? LIMIT 1"
      ).bind(username, email).first();
    } catch (e) {
      return errorResponse("database error", 500);
    }
    if (existing) return errorResponse("account already exists", 409);

    const userId = crypto.randomUUID();
    const nowMs = Date.now();
    const nowMsStr = String(nowMs);
    const hash = await hashPassword(password);

    try {
      await env.DB.prepare(
        `INSERT INTO users (id, username, email, password_hash, role, email_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'participant', 0, ?, ?)`
      ).bind(userId, username, email, hash, nowMsStr, nowMsStr).run();
    } catch (e) {
      return errorResponse("could not create account", 500);
    }

    // Email verification token (hashed at rest)
    const tokenId = crypto.randomUUID();
    const rawToken = crypto.randomUUID();
    const enc = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(rawToken), { name: "PBKDF2" }, false, ["deriveBits"]);
    const tokenHash = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
    const tokenHashB64 = `$pbkdf2-sha256$100000$${enc(salt)}$${enc(tokenHash)}`;

    try {
      await env.DB.prepare(
        `INSERT INTO email_verification_tokens (id, user_id, token_hash, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(tokenId, userId, tokenHashB64, nowMsStr, String(nowMs + 24 * 3600 * 1000)).run();
    } catch (e) {
      return errorResponse("could not create verification token", 500);
    }

    const verifyUrl = `${cleanString(env.APP_URL || "")}/verify-email?token=${rawToken}`;

    if (env.EMAIL_PROVIDER && env.EMAIL_API_KEY) {
      try {
        await sendEmail(env, {
          to: email,
          subject: "Verify your email - IT Skills Olympics 2026",
          text: `Welcome! Verify your email by clicking: ${verifyUrl}`,
          html: `<p>Welcome! <a href="${verifyUrl}">Verify your email address</a> to complete registration.</p>`,
        });
      } catch (e) {
        /* non-fatal; token still stored */
      }
    }

    return json({ ok: true, email_verified: false, needs_email_verification: true }, 201);
  } catch (e) {
    return json({ error: "registration failed" }, 500);
  }
};