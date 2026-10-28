/**
 * POST /api/auth/login
 * Body: { email, password }
 * Rate-limited per IP and per email. Generic errors to prevent enumeration.
 */
import { json, errorResponse, normalizeEmail, verifyPassword, rateLimit, createSession } from "../../_lib.js";

export const onRequestPost = async (context) => {
  const { env, request } = context;
  const ip = request.headers.get("cf-connecting-ip") || "unknown";

  let body;
  try { body = await request.json(); } catch { return errorResponse("invalid json body", 400); }

  const email = normalizeEmail(body.email);
  const password = String(body.password || "");

  if (!email || !password) return errorResponse("invalid credentials", 400);

  if (!(await rateLimit(env, ip, "login", 60))) return errorResponse("too many requests", 429);
  if (!(await rateLimit(env, `email:${email}`, "login", 60))) return errorResponse("too many requests", 429);

  let user;
  try {
    user = await env.DB.prepare("SELECT * FROM users WHERE lower(email) = ? LIMIT 1").bind(email).first();
  } catch (e) {
    return errorResponse("database error", 500);
  }
  if (!user) return errorResponse("invalid credentials", 400);

  let valid = false;
  try { valid = await verifyPassword(password, user.password_hash); } catch { valid = false; }
  if (!valid) return errorResponse("invalid credentials", 400);

  const session = await createSession(env, user.id);
  if (!session) return errorResponse("could not create session", 500);

  return json({ ok: true, user: { id: user.id, username: user.username, email: user.email, role: user.role, email_verified: !!user.email_verified } }, 200, { "Set-Cookie": session.cookie });
};