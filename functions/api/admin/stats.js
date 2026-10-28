/**
 * GET /api/admin/stats  - platform overview (organizer/admin only)
 */
import { json, errorResponse, requireRole } from "../../_lib.js";

export const onRequestGet = async (context) => {
  const { env, request } = context;
  const resolved = await requireRole(env, request, ["organizer", "admin"]);
  if (!resolved.ok) return resolved.error;

  const get = async (sql, params = []) => {
    try { return (await env.DB.prepare(sql).bind(...params).all()).results || []; } catch { return []; }
  };
  const count = async (sql, params = []) => {
    try { return Number(((await env.DB.prepare(sql).bind(...params).first()) || {}).c || 0); } catch { return 0; }
  };

  const stats = {
    users: await count("SELECT COUNT(*) AS c FROM users"),
    teams: await count("SELECT COUNT(*) AS c FROM teams"),
    join_requests_pending: await count("SELECT COUNT(*) AS c FROM team_join_requests WHERE status = 'pending'"),
    messages: await count("SELECT COUNT(*) AS c FROM team_messages"),
    notifications_unread: await count("SELECT COUNT(*) AS c FROM notifications WHERE read_at IS NULL"),
    announcements: await count("SELECT COUNT(*) AS c FROM announcements WHERE published = 1"),
  };
  return json({ stats });
};