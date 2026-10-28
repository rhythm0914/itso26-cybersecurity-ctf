/**
 * POST /api/teams/leave
 * Body: { teamId }
 * Leaves the team. Deletes team if empty.
 */
import { json, errorResponse, getSession } from "../../_lib.js";

function getMemberCookieLocal(request) {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)ctf_member=([^;]+)/);
  return match ? match[1] : null;
}

function cleanString(s) { return String(s || "").trim(); }

export const onRequestPost = async (context) => {
  const { env, request } = context;
  const session = await getSession(env, request);
  const memberId = getMemberCookieLocal(request);

  let body = {};
  const ct = request.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try { body = JSON.parse(await request.text()); } catch { return errorResponse("invalid json body", 400); }
  }
  const teamId = cleanString(body.teamId);
  if (!teamId) return errorResponse("team id is required", 400);

  let member;
  try {
    if (session) {
      member = await env.DB.prepare("SELECT id, team_id, slot_index, user_id FROM team_members WHERE user_id = ? AND team_id = ?").bind(session.userId, teamId).first();
    } else if (memberId) {
      member = await env.DB.prepare("SELECT id, team_id, slot_index, user_id FROM team_members WHERE id = ? AND team_id = ?").bind(memberId, teamId).first();
    }
  } catch { return errorResponse("database error", 500); }
  if (!member) return errorResponse("you are not a member of this team", 404);

  const slot = member.slot_index;
  const wasCaptain = slot === 0;
  try {
    await env.DB.prepare("DELETE FROM team_members WHERE id = ?").bind(member.id).run();
    const remaining = await env.DB.prepare("SELECT COUNT(*) AS c FROM team_members WHERE team_id = ?").bind(teamId).first();
    if (Number(remaining.c) === 0) {
      await env.DB.prepare("DELETE FROM teams WHERE id = ?").bind(teamId).run();
      await env.DB.prepare("DELETE FROM join_codes WHERE team_id = ?").bind(teamId).run();
      await env.DB.prepare("DELETE FROM team_solutions WHERE team_id = ?").bind(teamId).run();
      await env.DB.prepare("DELETE FROM team_join_requests WHERE team_id = ?").bind(teamId).run();
      await env.DB.prepare("DELETE FROM team_messages WHERE team_id = ?").bind(teamId).run();
    } else if (wasCaptain) {
      // Promote the next lowest-slot member to captain (slot 0)
      const next = await env.DB.prepare("SELECT id, user_id FROM team_members WHERE team_id = ? AND slot_index > 0 ORDER BY slot_index LIMIT 1").bind(teamId).first();
      if (next) {
        await env.DB.prepare("UPDATE team_members SET slot_index = 0, is_captain = 1 WHERE id = ?").bind(next.id).run();
        await env.DB.prepare("UPDATE teams SET captain_user_id = ?, updated_at = ? WHERE id = ?").bind(next.user_id || null, String(Date.now()), teamId).run();
      }
    }
  } catch { return errorResponse("could not leave team", 500); }

  const cookie = `ctf_member=; Path=/; Max-Age=0`;
  return json({ ok: true, left: true }, 200, { "Set-Cookie": cookie });
};