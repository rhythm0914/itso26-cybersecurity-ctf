/**
 * GET /api/notifications  - list notifications for the authenticated user
 * Query: ?unread=1&limit=20
 * POST /api/notifications/mark-read  - body: { ids: [...] } mark multiple read
 */
import { json, errorResponse, requireAuth, getSession, cleanString } from "../_lib.js";

export const onRequestGet = async (context) => {
  const { env, request } = context;
  const session = await getSession(env, request);
  if (!session) return errorResponse("authentication required", 401);

  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get("unread") === "1";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 20, 1), 100);

  let sql = `SELECT id, type, title, body, data, read_at, created_at FROM notifications WHERE user_id = ?`;
  const params = [session.userId];
  if (unreadOnly) sql += " AND read_at IS NULL";
  sql += " ORDER BY created_at DESC LIMIT ?";
  params.push(limit);

  let rows;
  try { rows = await env.DB.prepare(sql).bind(...params).all(); } catch { return errorResponse("database error", 500); }

  const notifications = (rows.results || []).map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    data: n.data ? JSON.parse(n.data || "{}") : {},
    read: !!n.read_at,
    created_at: n.created_at,
  }));
  return json({ notifications });
};

export const onRequestPost = async (context) => {
  const { env, request } = context;
  const session = await getSession(env, request);
  if (!session) return errorResponse("authentication required", 401);

  let body = {};
  const ct = request.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try { body = JSON.parse(await request.text()); } catch { return errorResponse("invalid json body", 400); }
  }
  const ids = Array.isArray(body.ids) ? body.ids : [];
  const now = Date.now();
  const nowStr = String(now);

  for (const id of ids) {
    try {
      await env.DB.prepare("UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL").bind(nowStr, id, session.userId).run();
    } catch {}
  }

  return json({ ok: true, marked: ids.length });
};