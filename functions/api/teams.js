/**
 * GET /api/teams
 * List teams for discovery with search + recruiting filters.
 * Query: ?q=..., ?recruiting=1, ?limit=20
 * Optional cf_session for "my team" flagging.
 */
import { json, errorResponse, getSession, cleanString } from "../_lib.js";

export const onRequestGet = async (context) => {
  const { env, request } = context;
  const session = await getSession(env, request);
  const url = new URL(request.url);
  const q = cleanString(url.searchParams.get("q") || "");
  const recruiting = url.searchParams.get("recruiting") === "1";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 20, 1), 100);

  let sql = `SELECT t.id, t.name, t.school, t.slug, t.motto, t.description, t.recruitment, t.max_size, t.created_at, t.started_at, t.ended_at,
                   tm.id AS member_id, tm.slot_index, tm.name AS member_name, tm.user_id, tm.is_captain,
                   cu.username AS captain_username, t.captain_user_id
             FROM teams t
             LEFT JOIN team_members tm ON tm.team_id = t.id
             LEFT JOIN users cu ON cu.id = t.captain_user_id
             WHERE 1=1`;
  const params = [];
  if (recruiting) { sql += " AND t.recruitment = 1"; }
  if (q) { sql += " AND lower(t.name) LIKE ?"; params.push("%" + q.toLowerCase() + "%"); }
  sql += " GROUP BY t.id ORDER BY t.created_at DESC LIMIT ?";
  params.push(limit);

  let rows;
  try { rows = await env.DB.prepare(sql).bind(...params).all(); } catch { return errorResponse("database error", 500); }

  // Group by team
  const byTeam = new Map();
  for (const r of (rows.results || [])) {
    if (!byTeam.has(r.id)) {
      byTeam.set(r.id, {
        id: r.id, name: r.name, school: r.school || "", slug: r.slug || "", motto: r.motto || "",
        description: r.description || "", recruitment: !!r.recruitment, max_size: Number(r.max_size || 3),
        created_at: r.created_at, started_at: r.started_at, ended_at: r.ended_at,
        captain: r.captain_username || null, captain_user_id: r.captain_user_id || null,
        member_count: 0, members: [],
      });
    }
    const team = byTeam.get(r.id);
    if (r.member_id) {
      team.member_count++;
      team.members.push({ id: r.member_id, slot: r.slot_index, name: r.member_name, user_id: r.user_id, is_captain: !!r.is_captain });
    }
  }

  const teams = Array.from(byTeam.values()).map((t) => ({
    ...t,
    available_slots: Math.max(0, t.max_size - t.member_count),
    recruiting: t.recruitment && t.available_slots > 0,
    my_team: session ? t.captain_user_id === session.userId || t.members.some((m) => m.user_id === session.userId) : false,
  }));

  return json({ teams, count: teams.length });
};