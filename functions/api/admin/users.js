/**
 * GET /api/admin/users  - list users (organizer/admin only)
 * Query: ?limit=50&role=...
 */
import { json, errorResponse, requireRole } from "../../_lib.js";

export const onRequestGet = async (context) => {
  const { env, request } = context;
  const resolved = await requireRole(env, request, ["organizer", "admin"]);
  if (!resolved.ok) return resolved.error;
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 200);
  const role = url.searchParams.get("role") || "";

  let sql = `SELECT id, username, email, role, email_verified, created_at FROM users`;
  const params = [];
  if (role) { sql += " WHERE role = ?"; params.push(role); }
  sql += " ORDER BY created_at DESC LIMIT ?";
  params.push(limit);

  let rows;
  try { rows = await env.DB.prepare(sql).bind(...params).all(); } catch { return errorResponse("database error", 500); }
  return json({ users: (rows.results || []).map((u) => ({ id: u.id, username: u.username, email: u.email, role: u.role, email_verified: !!u.email_verified, created_at: u.created_at })) });
};

/** POST /api/admin/users - create a new user */
export const onRequestPost = async (context) => {
  const { env, request } = context;
  const resolved = await requireRole(env, request, ["organizer", "admin"]);
  if (!resolved.ok) return resolved.error;
  const body = await request.text();
  let data;
  try { data = JSON.parse(body); } catch { return errorResponse("invalid json", 400); }
  const { username, email, role = "participant", email_verified = 0 } = data;
  if (!username || !email) return errorResponse("username and email required", 400);
  const id = crypto.randomUUID();
  const password_hash = crypto.randomUUID(); // placeholder; hash properly in production
  const now = Date.now();
  try {
    await env.DB.prepare(
      `INSERT INTO users (id, username, email, password_hash, role, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, username, email, password_hash, role, email_verified, now).run();
  } catch { return errorResponse("database error", 500); }
  return json({ ok: true, user: { id, username, email, role, email_verified, created_at: now } });
};

/** PUT /api/admin/users/:id - update user */
export const onRequestPut = async (context) => {
  const { env, request, params } = context;
  const resolved = await requireRole(env, request, ["organizer", "admin"]);
  if (!resolved.ok) return resolved.error;
  const body = await request.text();
  let data;
  try { data = JSON.parse(body); } catch { return errorResponse("invalid json", 400); }
  const { id } = params;
  if (!id) return errorResponse("user id required", 400);
  const sets = [];
  const vals = [];
  if (data.username !== undefined) { sets.push("username = ?"); vals.push(data.username); }
  if (data.email !== undefined) { sets.push("email = ?"); vals.push(data.email); }
  if (data.role !== undefined) { sets.push("role = ?"); vals.push(data.role); }
  if (data.email_verified !== undefined) { sets.push("email_verified = ?"); vals.push(data.email_verified); }
  if (sets.length === 0) return errorResponse("no fields to update", 400);
  vals.push(id);
  const sql = `UPDATE users SET ${sets.join(", ")} WHERE id = ?`;
  try { await env.DB.prepare(sql).bind(...vals).run(); } catch { return errorResponse("database error", 500); }
  return json({ ok: true });
};

/** DELETE /api/admin/users/:id - delete user */
export const onRequestDelete = async (context) => {
  const { env, request, params } = context;
  const resolved = await requireRole(env, request, ["organizer", "admin"]);
  if (!resolved.ok) return resolved.error;
  const { id } = params;
  if (!id) return errorResponse("user id required", 400);
  try {
    await env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(id).run();
  } catch { return errorResponse("database error", 500); }
  return json({ ok: true });
};