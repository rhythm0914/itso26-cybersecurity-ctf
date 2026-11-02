/**
 * POST /api/control
 * Body: { teamId?, action }  action: "start" | "restart" | "end"
 *
 * Only the team captain (slot 0 / is_captain) can control the clock. The caller
 * is identified by the session cookie or, for the offline lobby, ctf_member.
 * The authoritative clock lives on the teams row (started_at / ended_at); the
 * challenge submission and hint endpoints read the same columns.
 */
import { json, errorResponse, resolveTeam, competitionDuration } from "../_lib.js";

export const onRequestPost = async (context) => {
  const { env, request } = context;

  let body = {};
  try { body = await request.json(); } catch { return errorResponse("invalid json body", 400); }

  const action = String(body.action || "").trim();
  if (!["start", "restart", "end"].includes(action)) return errorResponse("invalid action", 400);

  const resolved = await resolveTeam(env, request);
  if (!resolved) return errorResponse("authentication required", 401);

  const requestedTeam = String(body.teamId || "").trim();
  if (requestedTeam && requestedTeam !== resolved.teamId) {
    return errorResponse("you are not a member of this team", 403);
  }

  const member = resolved.member;
  const isCaptain = Number(member.slot_index) === 0 || !!member.is_captain;
  if (!isCaptain) return errorResponse("only the team captain can control the clock", 403);

  const now = Date.now();
  const teamId = resolved.teamId;

  let team;
  try {
    team = await env.DB.prepare("SELECT started_at, ended_at FROM teams WHERE id = ?").bind(teamId).first();
  } catch {
    return errorResponse("database error", 500);
  }
  if (!team) return errorResponse("team not found", 404);

  let startedAt = team.started_at === null || team.started_at === undefined ? null : Number(team.started_at);
  let endedAt = team.ended_at === null || team.ended_at === undefined ? null : Number(team.ended_at);

  if (action === "start") {
    if (startedAt && endedAt && now < endedAt) {
      return json({ ok: true, action, startedAt, endedAt, alreadyStarted: true });
    }
    startedAt = now;
    endedAt = now + competitionDuration(env);
  } else if (action === "restart") {
    startedAt = now;
    endedAt = now + competitionDuration(env);
  } else {
    if (!startedAt) return errorResponse("the competition has not started yet", 409);
    endedAt = now;
  }

  try {
    await env.DB.prepare(
      "UPDATE teams SET started_at = ?, ended_at = ?, updated_at = ? WHERE id = ?"
    ).bind(startedAt, endedAt, now, teamId).run();
  } catch {
    return errorResponse("could not update competition clock", 500);
  }

  return json({ ok: true, action, startedAt, endedAt });
};
