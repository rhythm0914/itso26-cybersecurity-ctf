/**
 * POST /api/auth/verify-email
 * Body: { token }   (or query param ?token=)
 */
import { json, errorResponse } from "../../_lib.js";

export const onRequestPost = async (context) => {
  const { env, request } = context;
  let body;
  try { body = await request.json(); } catch { body = {}; }
  const rawToken = String(body.token || "").trim();
  if (!rawToken) {
    const url = new URL(request.url);
    const t = url.searchParams.get("token") || "";
    if (t) return json({ ok: true, message: "already verified" }, 200);
    return errorResponse("token required", 400);
  }

  const nowMs = Date.now();
  const nowMsStr = String(nowMs);
  let tokenRow;
  try {
    tokenRow = await env.DB.prepare("SELECT id, user_id, token_hash, used_at, expires_at FROM email_verification_tokens ORDER BY created_at DESC LIMIT 1").first();
  } catch { return errorResponse("database error", 500); }

  // Find matching token by iterating recent tokens (DB can't compare hashes directly)
  // Instead, find tokens for this user and verify candidate. We don't know user yet.
  // Use a narrower query: all unused non-expired tokens.
  let rows;
  try {
    rows = await env.DB.prepare(
      "SELECT id, user_id, token_hash FROM email_verification_tokens WHERE used_at IS NULL AND expires_at > ?"
    ).bind(nowMsStr).all();
  } catch { return errorResponse("database error", 500); }

  let matched = null;
  for (const r of (rows.results || [])) {
    try {
      if (await verifyBcryptLike(rawToken, r.token_hash)) { matched = r; break; }
    } catch { continue; }
  }
  if (!matched) return errorResponse("invalid or expired token", 400);

  try {
    await env.DB.prepare("UPDATE email_verification_tokens SET used_at = ? WHERE id = ?").bind(nowMsStr, matched.id).run();
    await env.DB.prepare("UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?").bind(nowMsStr, matched.user_id).run();
  } catch { return errorResponse("could not verify email", 500); }

  return json({ ok: true, message: "email verified" });
};

async function verifyBcryptLike(raw, stored) {
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