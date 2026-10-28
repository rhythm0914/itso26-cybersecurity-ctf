/**
 * POST /api/teams/:teamId/requests/:requestId/approve
 * Captain/organizer/admin only. Creates membership if capacity remains and user team-free.
 */
import { json, errorResponse, getSession } from "../../../../../_lib.js";

export const onRequestPost = async (context) => {
  const { env, request, params } = context;
  const teamId = params.teamId;
  const requestId = params.requestId;
  const session = await getSession(env, request);
  if (!session) return errorResponse("authentication required", 401);

  // Verify actor is captain/organizer/admin of this team
  let membership;
  try {
    membership = await env.DB.prepare("SELECT slot_index, is_captain FROM team_members WHERE user_id = ? AND team_id = ?").bind(session.userId, teamId).first();
  } catch { return errorResponse("database error", 500); }
  const isCaptain = membership && (membership.is_captain === 1 || membership.slot_index === 0);
  if (!isCaptain && !["organizer", "admin"].includes(session.role)) {
    return errorResponse("insufficient permissions", 403);
  }

  let reqRow;
  try {
    reqRow = await env.DB.prepare("SELECT id, team_id, user_id, status FROM team_join_requests WHERE id = ? AND team_id = ?").bind(requestId, teamId).first();
  } catch { return errorResponse("database error", 500); }
  if (!reqRow) return errorResponse("request not found", 404);
  if (reqRow.status !== "pending") return errorResponse("request already processed", 409);

  const requesterId = reqRow.user_id;

  // Safety: requester still team-free?
  let existingMember;
  try {
    existingMember = await env.DB.prepare("SELECT id FROM team_members WHERE user_id = ? LIMIT 1").bind(requesterId).first();
  } catch { return errorResponse("database error", 500); }
  if (existingMember) return errorResponse("user already belongs to a team", 409);

  // Safety: capacity remains?
  let team;
  try {
    team = await env.DB.prepare("SELECT id, max_size FROM teams WHERE id = ?").bind(teamId).first();
  } catch { return errorResponse("database error", 500); }
  if (!team) return errorResponse("team not found", 404);
  let count;
  try {
    count = await env.DB.prepare("SELECT COUNT(*) AS c FROM team_members WHERE team_id = ?").bind(teamId).first();
  } catch { return errorResponse("database error", 500); }
  if (Number(count.c) >= Number(team.max_size)) return errorResponse("team is full", 409);

  // Find next free slot — slot 0 is reserved for the captain/creator
  let members;
  try {
    members = await env.DB.prepare("SELECT slot_index FROM team_members WHERE team_id = ? ORDER BY slot_index").bind(teamId).all();
  } catch { return errorResponse("database error", 500); }
  const taken = new Set((members.results || []).map((m) => m.slot_index));
  let slot = -1;
  for (let s = 1; s <= 2; s++) { if (!taken.has(s)) { slot = s; break; } }
  if (slot === -1) return errorResponse("team is full", 409);

  let requester;
  try {
    requester = await env.DB.prepare("SELECT username FROM users WHERE id = ?").bind(requesterId).first();
  } catch { return errorResponse("database error", 500); }

  const now = Date.now();
  const nowStr = String(now);
  const memberId = crypto.randomUUID();
  try {
    await env.DB.prepare(
      `INSERT INTO team_members (id, team_id, slot_index, name, user_id, is_captain, joined_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(memberId, teamId, String(slot), requester ? requester.username : "member", requesterId, "0", nowStr).run();
    await env.DB.prepare(
      `UPDATE team_join_requests SET status = 'approved', reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ?`
    ).bind(session.userId, nowStr, nowStr, requestId).run();
  } catch { return errorResponse("could not approve request", 500); }

  // Notify requester
  try {
    await notify(env, requesterId, "join_approved", "Join request approved",
      `You have been approved to join team "${team.name}".`, { team_id: teamId });
  } catch {}

  return json({ ok: true, request: { id: requestId, status: "approved" }, member: { id: memberId, slot } });
};

async function notify(env, userId, type, title, bodyText, data = {}) {
  const id = crypto.randomUUID();
  const now = Date.now();
  const nowStr = String(now);
  try {
    await env.DB.prepare(
      `INSERT INTO notifications (id, user_id, type, title, body, data, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, userId, type, title, bodyText, JSON.stringify(data), nowStr).run();
  } catch {}
}