/**
 * GET /api/teams/:teamId/messages  - list recent messages (bounded, newest last)
 * POST /api/teams/:teamId/messages  - send a message (team member only)
 */
import { json, errorResponse, requireAuth, getSession, cleanString } from "../../../_lib.js";

export const onRequestGet = async (context) => {
  const { env, request, params } = context;
  const teamId = params.teamId;
  const session = await getSession(env, request);
  if (!session) return errorResponse("authentication required", 401);

  // Verify membership
  let membership;
  try {
    membership = await env.DB.prepare("SELECT id FROM team_members WHERE user_id = ? AND team_id = ? LIMIT 1").bind(session.userId, teamId).first();
  } catch { return errorResponse("database error", 500); }
  if (!membership) return errorResponse("you are not a member of this team", 403);

  const url = new URL(request.url);
  const before = url.searchParams.get("before") || null;
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 100);

  let sql = `SELECT id, user_id, username, body, created_at FROM team_messages WHERE team_id = ?`;
  const params_ = [teamId];
  if (before) { sql += " AND created_at < ?"; params_.push(before); }
  sql += " ORDER BY created_at DESC LIMIT ?";
  params_.push(limit);

  let rows;
  try { rows = await env.DB.prepare(sql).bind(...params_).all(); } catch { return errorResponse("database error", 500); }

  const messages = (rows.results || []).map((m) => ({ id: m.id, user_id: m.user_id, username: m.username, body: m.body, created_at: m.created_at })).reverse();
  return json({ messages, count: messages.length });
};

export const onRequestPost = async (context) => {
  const { env, request, params } = context;
  const teamId = params.teamId;
  const resolved = await requireAuth(env, request);
  if (!resolved.ok) return resolved.error;
  const session = resolved.session;

  let membership;
  try {
    membership = await env.DB.prepare("SELECT id FROM team_members WHERE user_id = ? AND team_id = ? LIMIT 1").bind(session.userId, teamId).first();
  } catch { return errorResponse("database error", 500); }
  if (!membership) return errorResponse("you are not a member of this team", 403);

  let body = {};
  const ct = request.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try { body = JSON.parse(await request.text()); } catch { return errorResponse("invalid json body", 400); }
  }
  const text = cleanString(body.body || "");
  if (!text) return errorResponse("message body is required", 400);
  if (text.length > 1000) return errorResponse("message too long", 400);

  // Simple rate limit: max 30 msgs per minute per user
  const startMs = String(Date.now() - 60 * 1000);
  let cnt;
  try {
    cnt = await env.DB.prepare("SELECT COUNT(*) AS c FROM team_messages WHERE user_id = ? AND team_id = ? AND created_at > ?").bind(session.userId, teamId, startMs).first();
  } catch { return errorResponse("database error", 500); }
  if (Number(cnt.c) >= 30) return errorResponse("too many messages", 429);

  const id = crypto.randomUUID();
  const now = Date.now();
  const nowStr = String(now);
  try {
    await env.DB.prepare(
      `INSERT INTO team_messages (id, team_id, user_id, username, body, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(id, teamId, session.userId, session.username, text, nowStr).run();
  } catch { return errorResponse("could not send message", 500); }

  // Notify teammates
  try {
    const teammates = await env.DB.prepare(
      `SELECT u.id AS uid FROM team_members tm JOIN users u ON u.id = tm.user_id WHERE tm.team_id = ? AND u.id != ?`
    ).bind(teamId, session.userId).all();
    for (const t of (teammates.results || [])) {
      await notify(env, t.uid, "team_message", "New team message", `${session.username} posted in ${teamId.slice(0,8)}`, { team_id: teamId });
    }
  } catch {}

  return json({ ok: true, message: { id, user_id: session.userId, username: session.username, body: text, created_at: now } }, 201);
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