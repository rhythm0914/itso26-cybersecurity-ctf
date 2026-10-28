/**
 * POST /api/teams/leave
 * Body: { teamId }
 * Leaves the team: clears the caller's member row. Uses ctf_member cookie to identify caller.
 * If the caller was the creator (slot 0) and others remain, team stays; if alone, team is deleted.
 */
export const onRequestPost = async (context) => {
  const { env, request } = context;
  const body = request.body || {};
  const teamId = String(body.teamId || "").trim();

  const memberId = getMemberCookie(request);
  if (!memberId) return json({ error: "not identified" }, 401);
  if (!teamId) return json({ error: "team id is required" }, 400);

  let member;
  try {
    member = await env.DB.prepare(
      "SELECT * FROM team_members WHERE id = ? AND team_id = ?"
    ).bind(memberId, teamId).first();
  } catch (e) {
    return json({ error: "database error" }, 500);
  }

  if (!member) return json({ error: "you are not a member of this team" }, 404);

  const slot = member.slot_index;

  try {
    await env.DB.prepare("DELETE FROM team_members WHERE id = ?").bind(memberId).run();

    const remaining = await env.DB.prepare(
      "SELECT COUNT(*) AS c FROM team_members WHERE team_id = ?"
    ).bind(teamId).first();

    if (remaining.c === 0) {
      await env.DB.prepare("DELETE FROM teams WHERE id = ?").bind(teamId).run();
      await env.DB.prepare("DELETE FROM join_codes WHERE team_id = ?").bind(teamId).run();
      await env.DB.prepare("DELETE FROM team_solutions WHERE team_id = ?").bind(teamId).run();
    } else if (slot === 0) {
      // Creator left but others remain: promote next member to slot 0
      const next = await env.DB.prepare(
        "SELECT id FROM team_members WHERE team_id = ? AND slot_index > 0 ORDER BY slot_index LIMIT 1"
      ).bind(teamId).first();
      if (next) {
        await env.DB.prepare(
          "UPDATE team_members SET slot_index = 0 WHERE id = ?"
        ).bind(next.id).run();
      }
    }
  } catch (e) {
    return json({ error: "could not leave team" }, 500);
  }

  return json({ ok: true, left: true }).then((res) => {
    res.headers.set("Set-Cookie", `ctf_member=; Path=/; Max-Age=0`);
    return res;
  });
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
