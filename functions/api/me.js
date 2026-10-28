/**
 * GET /api/me
 * Returns the caller's team + member + saved solutions based on the ctf_member cookie.
 * No signup: identity is the cookie set at create/join time.
 */
export const onRequestGet = async (context) => {
  const { DB, request } = context;

  const memberId = getMemberCookie(request);
  if (!memberId) return json({ ok: false, team: null, member: null }, 200);

  let member;
  try {
    member = await DB.prepare(
      "SELECT id, team_id, slot_index, name, is_ready, joined_at FROM team_members WHERE id = ?"
    ).bind(memberId).first();
  } catch (e) {
    return json({ error: "database error" }, 500);
  }

  if (!member) {
    return json({ ok: false, team: null, member: null }, 200).then((res) => {
      res.headers.set("Set-Cookie", `ctf_member=; Path=/; Max-Age=0`);
      return res;
    });
  }

  let team;
  try {
    team = await DB.prepare("SELECT * FROM teams WHERE id = ?").bind(member.team_id).first();
  } catch (e) {
    return json({ error: "database error" }, 500);
  }

  if (!team) {
    return json({ ok: false, team: null, member: null }, 200).then((res) => {
      res.headers.set("Set-Cookie", `ctf_member=; Path=/; Max-Age=0`);
      return res;
    });
  }

  let members;
  try {
    members = await DB.prepare(
      "SELECT id, slot_index, name, is_ready, joined_at FROM team_members WHERE team_id = ? ORDER BY slot_index"
    ).bind(team.id).all();
  } catch (e) {
    return json({ error: "database error" }, 500);
  }

  let solutions;
  try {
    solutions = await DB.prepare(
      "SELECT challenge_id, points, solved_at, hints_used, attempts_used FROM team_solutions WHERE team_id = ?"
    ).bind(team.id).all();
  } catch (e) {
    solutions = { results: [] };
  }

  return json({
    ok: true,
    team: {
      id: team.id,
      name: team.name,
      school: team.school,
      created_at: team.created_at,
      started_at: team.started_at,
      ended_at: team.ended_at,
    },
    member: {
      id: member.id,
      slot: member.slot_index,
      name: member.name,
      ready: !!member.is_ready,
      joined_at: member.joined_at,
    },
    members: (members.results || []).map((m) => ({
      id: m.id,
      slot: m.slot_index,
      name: m.name,
      ready: !!m.is_ready,
      joined_at: m.joined_at,
    })),
    solved: (solutions.results || []).reduce((acc, s) => {
      let hints = [];
      try { hints = JSON.parse(s.hints_used || "[]"); } catch (e) { hints = []; }
      acc[s.challenge_id] = {
        at: s.solved_at,
        points: s.points,
        hints,
        attempts: s.attempts_used,
      };
      return acc;
    }, {}),
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
