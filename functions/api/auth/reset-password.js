/**
 * POST /api/auth/reset-password
 * Body: { token, new_password }
 */
import { json, errorResponse, hashPassword, rateLimit } from "../../_lib.js";

export const onRequestPost = async (context) => {
  const { env, request } = context;
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  if (!(await rateLimit(env, ip, "reset-password", 3))) return errorResponse("too many requests", 429);

  let body;
  try { body = await request.json(); } catch { return errorResponse("invalid json body", 400); }
  const rawToken = String(body.token || "").trim();
  const newPassword = String(body.new_password || "");
  if (!newPassword || newPassword.length < 8) return errorResponse("password must be at least 8 characters", 400);

  const nowMs = Date.now();
  const nowMsStr = String(nowMs);
  let rows;
  try {
    rows = await env.DB.prepare("SELECT id, user_id, token_hash FROM password_reset_tokens WHERE used_at IS NULL AND expires_at > ?").bind(nowMsStr).all();
  } catch { return errorResponse("database error", 500); }

  let matched = null;
  for (const r of (rows.results || [])) {
    try { if (await verifyToken(rawToken, r.token_hash)) { matched = r; break; } } catch { continue; }
  }
  if (!matched) return errorResponse("invalid or expired token", 400);

  const hash = await hashPassword(newPassword);
  try {
    await env.DB.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").bind(hash, nowMsStr, matched.user_id).run();
    await env.DB.prepare("UPDATE password_reset_tokens SET used_at = ? WHERE id = ?").bind(nowMsStr, matched.id).run();
  } catch { return errorResponse("could not reset password", 500); }

  return json({ ok: true, message: "password reset" });
};

async function verifyToken(raw, stored) {
  const parts = stored.split("$");
  if (parts.length !== 5 || parts[0] !== "" || parts[1] !== "pbkdf2-sha256") return false;
  const iterations = Number(parts[2]);
  const salt = Uint8Array.from(atob(parts[3]), (c) => c.charCodeAt(0));
  const hashB64 = parts[4];
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(raw), { name: "PBKDF2" }, false, ["deriveBits"]);
  const hash = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256);
  const enc = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  return enc(hash) === hashB64;
}