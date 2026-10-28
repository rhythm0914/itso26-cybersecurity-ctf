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