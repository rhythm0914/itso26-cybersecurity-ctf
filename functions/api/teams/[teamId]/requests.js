/**
 * GET /api/teams/:teamId/requests
 *   Query: ?status=pending|approved|rejected|cancelled (default pending)
 *   Captain/organizer/admin only for listing.
 * POST /api/teams/:teamId/requests
 *   Body: { message }
 *   Authenticated user submits a join request.
 */
import { json, errorResponse, requireAuth, getSession, cleanString } from "../../../_lib.js";

export const onRequestGet = async (context) => {
  const { env, request, params } = context;
  const teamId = params.teamId;
  const session = await getSession(env, request);
  if (!session) return errorResponse("authentication required", 401);

  let membership;
  try {
    membership = await env.DB.prepare("SELECT slot_index, user_id, is_captain FROM team_members WHERE user_id = ? AND team_id = ?").bind(session.userId, teamId).first();
  } catch { return errorResponse("database error", 500); }
  const isCaptain = membership && (membership.is_captain === 1 || membership.slot_index === 0);
  if (!isCaptain && !["organizer", "admin"].includes(session.role)) {
    return errorResponse("insufficient permissions", 403);
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "pending";

  let rows;
  try {
    rows = await env.DB.prepare(
      `SELECT r.id, r.message, r.status, r.created_at, r.reviewed_at, u.username AS requester_username
       FROM team_join_requests r
       JOIN users u ON u.id = r.user_id
       WHERE r.team_id = ? AND r.status = ?
       ORDER BY r.created_at DESC`
    ).bind(teamId, status).all();
  } catch { return errorResponse("database error", 500); }

  const requests = (rows.results || []).map((r) => ({
    id: r.id,
    message: r.message,
    status: r.status,
    created_at: r.created_at,
    reviewed_at: r.reviewed_at,
    requester: { id: null, username: r.requester_username },
  }));
  return json({ requests });
};

export const onRequestPost = async (context) => {
  const { env, request, params } = context;
  const teamId = params.teamId;
  const resolved = await requireAuth(env, request);
  if (!resolved.ok) return resolved.error;
  const session = resolved.session;

  let existing;
  try {
    existing = await env.DB.prepare("SELECT id FROM team_members WHERE user_id = ? LIMIT 1").bind(session.userId).first();
  } catch { return errorResponse("database error", 500); }
  if (existing) return errorResponse("you already belong to a team", 409);

  let team;
  try {
    team = await env.DB.prepare("SELECT id, recruitment, max_size FROM teams WHERE id = ?").bind(teamId).first();
  } catch { return errorResponse("database error", 500); }
  if (!team) return errorResponse("team not found", 404);
  if (!team.recruitment) return errorResponse("team is not recruiting", 400);

  let body = {};
  const ct = request.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try { body = JSON.parse(await request.text()); } catch { return errorResponse("invalid json body", 400); }
  }
  const message = cleanString(body.message || "");

  let dup;
  try {
    dup = await env.DB.prepare("SELECT id FROM team_join_requests WHERE team_id = ? AND user_id = ? AND status = 'pending' LIMIT 1").bind(teamId, session.userId).first();
  } catch { return errorResponse("database error", 500); }
  if (dup) return errorResponse("you already have a pending request to this team", 409);

  const now = Date.now();
  const nowStr = String(now);
  const id = crypto.randomUUID();
  try {
    await env.DB.prepare(
      `INSERT INTO team_join_requests (id, team_id, user_id, message, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`
    ).bind(id, teamId, session.userId, message, nowStr, nowStr).run();
  } catch { return errorResponse("could not submit request", 500); }

  try {
    const captains = await env.DB.prepare(
      `SELECT u.id AS uid FROM team_members tm JOIN users u ON u.id = tm.user_id WHERE tm.team_id = ? AND tm.is_captain = 1`
    ).bind(teamId).all();
    for (const c of (captains.results || [])) {
      await notify(env, c.uid, "join_request", "Join request received", `A member requested to join your team "${team.name}".`, { team_id: teamId, request_id: id });
    }
  } catch {}

  return json({ ok: true, request: { id, team_id: teamId, user_id: session.userId, message, status: "pending", created_at: now } }, 201);
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