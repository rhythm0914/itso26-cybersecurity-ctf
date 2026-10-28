/**
 * POST /api/teams/:teamId/requests/:requestId/reject
 * Captain/organizer/admin only.
 */
import { json, errorResponse, getSession } from "../../../../../_lib.js";

export const onRequestPost = async (context) => {
  const { env, request, params } = context;
  const teamId = params.teamId;
  const requestId = params.requestId;
  const session = await getSession(env, request);
  if (!session) return errorResponse("authentication required", 401);

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

  const now = Date.now();
  const nowStr = String(now);
  try {
    await env.DB.prepare(
      `UPDATE team_join_requests SET status = 'rejected', reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ?`
    ).bind(session.userId, nowStr, nowStr, requestId).run();
  } catch { return errorResponse("could not reject request", 500); }

  return json({ ok: true, request: { id: requestId, status: "rejected" } });
};