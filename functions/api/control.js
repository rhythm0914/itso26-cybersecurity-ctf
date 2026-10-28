/**
 * POST /api/control
 * Body: { teamId, action }  action: "start" | "restart" | "end"
 * Only the team creator (slot 0) can control the clock. Identified by ctf_member cookie.
 */
export const onRequestPost = async (context) => {
  const { env, request } = context;
  let body = {};
  if (request.method === "POST") {
    const ct = request.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      try {
        body = JSON.parse(await request.text());
      } catch (e) {
        return json({ error: "invalid json body" }, 400);
      }
    }
  }
  const teamId = String(body.teamId || "").trim();
  const action = String(body.action || "").trim();

  if (!teamId) return json({ error: "team id is required" }, 400);
  if (!["start", "restart", "end"].includes(action)) return json({ error: "invalid action" }, 400);

  const memberId = getMemberCookie(request);
  if (!memberId) return json({ error: "not identified" }, 401);

  let member;
  try {
    member = await env.DB.prepare(
      "SELECT slot_index FROM team_members WHERE id = ? AND team_id = ?"
    ).bind(memberId, teamId).first();
  } catch (e) {
    return json({ error: "database error" }, 500);
  }

  if (!member) return json({ error: "you are not a member of this team" }, 404);
  if (member.slot_index !== 0) return json({ error: "only the team creator can control the clock" }, 403);

  const now = Date.now();
  const nowStr = String(now);
  let startedAt = null;
  let endedAt = null;

  if (action === "start" || action === "restart") {
    startedAt = nowStr;
    endedAt = String(now + 90 * 60 * 1000);
  } else if (action === "end") {
    endedAt = nowStr;
  }

  try {
    await env.DB.prepare(
      "UPDATE teams SET started_at = COALESCE(?, started_at), ended_at = ? WHERE id = ?"
    ).bind(startedAt, endedAt, teamId).run();
  } catch (e) {
    return json({ error: "could not update competition clock" }, 500);
  }

  return json({ ok: true, action, startedAt, endedAt });
};

function getMemberCookie(request) {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)ctf_member=([^;]+)/);
  return match ? match[1] : null;
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
