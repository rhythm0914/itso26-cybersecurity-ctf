/**
 * POST /api/teams/join
 * Body: { code, name }
 * Modes:
 *   - authenticated (cf_session): links user to the team via user_id.
 *   - offline (ctf_member cookie): legacy lobby behaviour.
 */
import { json, errorResponse, cleanString, getSession } from "../../_lib.js";

function getMemberCookieLocal(request) {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)ctf_member=([^;]+)/);
  return match ? match[1] : null;
}

export const onRequestPost = async (context) => {
  const { env, request } = context;
  const session = await getSession(env, request);
  const memberId = getMemberCookieLocal(request);
  const now = Date.now();
  const nowStr = String(now);

  let body = {};
  const ct = request.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try { body = JSON.parse(await request.text()); } catch { return errorResponse("invalid json body", 400); }
  }

  const code = cleanString(body.code);
  const name = cleanString(body.name);
  if (!code) return errorResponse("join code is required", 400);
  if (!name) return errorResponse("your name is required", 400);
  if (name.length > 60) return errorResponse("name too long", 400);

  let row;
  try {
    row = await env.DB.prepare("SELECT * FROM join_codes WHERE code = ? AND uses_left > 0 AND expires_at > ?").bind(code, nowStr).first();
  } catch { return errorResponse("database error", 500); }
  if (!row) return errorResponse("invalid or expired join code", 400);
  const teamId = row.team_id;

  let members;
  try {
    members = await env.DB.prepare("SELECT slot_index FROM team_members WHERE team_id = ? ORDER BY slot_index").bind(teamId).all();
  } catch { return errorResponse("database error", 500); }
  const taken = new Set((members.results || []).map((m) => m.slot_index));
  let slot = -1;
  for (let s = 1; s <= 2; s++) { if (!taken.has(s)) { slot = s; break; } }
  if (slot === -1) return errorResponse("team is full", 400);

  const newMemberId = crypto.randomUUID();
  try {
    await env.DB.prepare("INSERT INTO team_members (id, team_id, slot_index, name, user_id, joined_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(newMemberId, teamId, slot, name, session ? session.userId : null, nowStr).run();
    await env.DB.prepare("UPDATE join_codes SET uses_left = uses_left - 1 WHERE code = ?").bind(code).run();
  } catch { return errorResponse("could not join team", 500); }

  const team = await env.DB.prepare("SELECT * FROM teams WHERE id = ?").bind(teamId).first();

  const cookie = `ctf_member=${newMemberId}; Path=/; Max-Age=604800; SameSite=Lax`;
  return json({ ok: true, team: { id: team.id, name: team.name, school: team.school, created_at: team.created_at }, member: { id: newMemberId, slot, name } }, 200, { "Set-Cookie": cookie });
};