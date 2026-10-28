/**
 * GET /api/admin/teams  - list all teams (organizer/admin only)
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
      `SELECT t.id, t.name, t.school, t.slug, t.max_size, t.status, t.created_at,
             COUNT(tm.id) AS member_count
       FROM teams t LEFT JOIN team_members tm ON tm.team_id = t.id
       GROUP BY t.id ORDER BY t.created_at DESC LIMIT ?`
    ).bind(limit).all();
  } catch { return errorResponse("database error", 500); }
  return json({ teams: (rows.results || []).map((t) => ({ id: t.id, name: t.name, school: t.school || "", slug: t.slug || "", max_size: Number(t.max_size || 3), member_count: Number(t.member_count || 0), created_at: t.created_at })) });
};