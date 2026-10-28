/**
 * POST /api/auth/forgot-password
 * Body: { email }
 * Always returns generic ok to prevent enumeration. Sends reset email if provider configured.
 */
import { json, errorResponse, normalizeEmail, rateLimit, sendEmail, isValidEmail } from "../../_lib.js";

export const onRequestPost = async (context) => {
  const { env, request } = context;
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  if (!(await rateLimit(env, ip, "forgot-password", 3))) return errorResponse("too many requests", 429);

  let body;
  try { body = await request.json(); } catch { return errorResponse("invalid json body", 400); }
  const email = normalizeEmail(body.email);

  let user = null;
  if (email && isValidEmail(email)) {
    try { user = await env.DB.prepare("SELECT id, email FROM users WHERE lower(email) = ? LIMIT 1").bind(email).first(); } catch {}
  }

  const nowMs = Date.now();
  const nowMsStr = String(nowMs);
  if (user) {
    const tokenId = crypto.randomUUID();
    const rawToken = crypto.randomUUID();
    const enc = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(rawToken), { name: "PBKDF2" }, false, ["deriveBits"]);
    const tokenHash = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
    const tokenHashB64 = `$pbkdf2-sha256$100000$${enc(salt)}$${enc(tokenHash)}`;
    try {
      await env.DB.prepare(
        `INSERT INTO password_reset_tokens (id, user_id, token_hash, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(tokenId, user.id, tokenHashB64, nowMsStr, String(nowMs + 60 * 60 * 1000)).run();
    } catch { return errorResponse("database error", 500); }

    const resetUrl = `${cleanString(env.APP_URL || "")}/reset-password?token=${rawToken}`;
    if (env.EMAIL_PROVIDER && env.EMAIL_API_KEY) {
      try {
        await sendEmail(env, {
          to: user.email,
          subject: "Reset your password - IT Skills Olympics 2026",
          text: `Reset your password: ${resetUrl}`,
          html: `<p><a href="${resetUrl}">Reset your password</a>. Link expires in 1 hour.</p>`,
        });
      } catch {}
    }
  }

  return json({ ok: true, message: "if the email exists, a reset link was sent" });
};

function cleanString(s) { return String(s || "").trim(); }