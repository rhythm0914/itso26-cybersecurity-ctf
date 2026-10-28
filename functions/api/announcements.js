/**
 * GET /api/announcements  - list published announcements
 * POST /api/announcements  - create (organizer/admin only)
 * Body: { title, body, published? }
 */
import { json, errorResponse, getSession, requireRole, cleanString } from "../_lib.js";

export const onRequestGet = async (context) => {
  const { env, request } = context;
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 20, 1), 100);

  let rows;
  try {
    rows = await env.DB.prepare(
      `SELECT a.id, a.title, a.body, a.published, a.created_at, a.updated_at, u.username AS author_username
       FROM announcements a JOIN users u ON u.id = a.author_id
       WHERE a.published = 1
       ORDER BY a.created_at DESC LIMIT ?`
    ).bind(limit).all();
  } catch { return errorResponse("database error", 500); }

  return json({ announcements: (rows.results || []).map((a) => ({ id: a.id, title: a.title, body: a.body, published: !!a.published, created_at: a.created_at, updated_at: a.updated_at, author: a.author_username })) });
};

export const onRequestPost = async (context) => {
  const { env, request } = context;
  const resolved = await requireRole(env, request, ["organizer", "admin"]);
  if (!resolved.ok) return resolved.error;
  const session = resolved.session;

  let body = {};
  const ct = request.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try { body = JSON.parse(await request.text()); } catch { return errorResponse("invalid json body", 400); }
  }
  const title = cleanString(body.title);
  const now = Date.now();
  const nowStr = String(now);
  const published = body.published !== false ? 1 : 0;
  if (!title) return errorResponse("title is required", 400);
  if (!text) return errorResponse("body is required", 400);

  const id = crypto.randomUUID();
  try {
    await env.DB.prepare(
      `INSERT INTO announcements (id, author_id, title, body, published, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, session.userId, title, text, String(published), nowStr, nowStr).run();
  } catch { return errorResponse("could not create announcement", 500); }

  return json({ ok: true, announcement: { id, title, body: text, published: !!published, created_at: now, author: session.username } }, 201);
};