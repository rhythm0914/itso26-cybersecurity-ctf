/**
 * GET /api/admin/audit  - recent audit log (organizer/admin only)
 * Query: ?limit=50
 */
import { json, errorResponse, requireRole } from "../../_lib.js";

export const onRequestGet = async (context) => {
  const { env, request } = context;
  const resolved = await requireRole(env, request, ["organizer", "admin"]);
  if (!resolved.ok) return resolved.error;
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 200);

  let rows;
  try {
    rows = await env.DB.prepare(
      `SELECT id, actor_id, actor_username, action, target_type, target_id, detail, ip, created_at
       FROM audit_logs ORDER BY created_at DESC LIMIT ?`
    ).bind(limit).all();
  } catch { return errorResponse("database error", 500); }
  return json({ audit: (rows.results || []).map((a) => ({ id: a.id, actor_id: a.actor_id, actor_username: a.actor_username, action: a.action, target_type: a.target_type, target_id: a.target_id, detail: a.detail ? JSON.parse(a.detail || "{}") : {}, ip: a.ip, created_at: a.created_at })) });
};