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

/** POST /api/admin/teams - create a new team */
export const onRequestPost = async (context) => {
  const { env, request, params } = context;
  const resolved = await requireRole(env, request, ["organizer", "admin"]);
  if (!resolved.ok) return resolved.error;
  const body = await request.text();
  let data;
  try { data = JSON.parse(body); } catch { return errorResponse("invalid json", 400); }
  const { name, school, slug, motto, description } = data;
  if (!name) return errorResponse("team name required", 400);
  const id = crypto.randomUUID();
  const now = Date.now();
  try {
    await env.DB.prepare(
      `INSERT INTO teams (id, name, school, created_at) VALUES (?, ?, ?, ?)`
    ).bind(id, name, school || "", now).run();
    await env.DB.prepare(
      `UPDATE teams SET slug = ?, motto = ?, description = ?, max_size = 3, status = 'open', updated_at = ? WHERE id = ?`
    ).bind(slug || id, motto || "", description || "", now, id).run();
  } catch { return errorResponse("database error", 500); }
  return json({ ok: true, team: { id, name, school, slug: slug || id, motto, description, created_at: now } });
};

/** PUT /api/admin/teams/:id - update team */
export const onRequestPut = async (context) => {
  const { env, request, params } = context;
  const resolved = await requireRole(env, request, ["organizer", "admin"]);
  if (!resolved.ok) return resolved.error;
  const body = await request.text();
  let data;
  try { data = JSON.parse(body); } catch { return errorResponse("invalid json", 400); }
  const { id } = params;
  if (!id) return errorResponse("team id required", 400);
  const sets = [];
  const vals = [];
  if (data.name !== undefined) { sets.push("name = ?"); vals.push(data.name); }
  if (data.school !== undefined) { sets.push("school = ?"); vals.push(data.school); }
  if (data.slug !== undefined) { sets.push("slug = ?"); vals.push(data.slug); }
  if (data.motto !== undefined) { sets.push("motto = ?"); vals.push(data.motto); }
  if (data.description !== undefined) { sets.push("description = ?"); vals.push(data.description); }
  if (data.max_size !== undefined) { sets.push("max_size = ?"); vals.push(Number(data.max_size)); }
  if (data.status !== undefined) { sets.push("status = ?"); vals.push(data.status); }
  if (sets.length === 0) return errorResponse("no fields to update", 400);
  vals.push(id);
  const sql = `UPDATE teams SET ${sets.join(", ")} WHERE id = ?`;
  try { await env.DB.prepare(sql).bind(...vals).run(); } catch { return errorResponse("database error", 500); }
  return json({ ok: true });
};

/** DELETE /api/admin/teams/:id - delete team */
export const onRequestDelete = async (context) => {
  const { env, request, params } = context;
  const resolved = await requireRole(env, request, ["organizer", "admin"]);
  if (!resolved.ok) return resolved.error;
  const { id } = params;
  if (!id) return errorResponse("team id required", 400);
  try {
    await env.DB.prepare(`DELETE FROM teams WHERE id = ?`).bind(id).run();
    await env.DB.prepare(`DELETE FROM team_members WHERE team_id = ?`).bind(id).run();
    await env.DB.prepare(`DELETE FROM join_codes WHERE team_id = ?`).bind(id).run();
    await env.DB.prepare(`DELETE FROM team_solutions WHERE team_id = ?`).bind(id).run();
  } catch { return errorResponse("database error", 500); }
  return json({ ok: true });
};