/**
 * POST /api/teams/join
 * Body: { code, name }
 * Joins a team via join code into the next free slot (1 or 2).
 * Sets ctf_member cookie identifying the new member row.
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
  const code = String(body.code || "").trim();
  const name = String(body.name || "").trim();

  if (!code) return json({ error: "join code is required" }, 400);
  if (!name) return json({ error: "your name is required" }, 400);
  if (name.length > 60) return json({ error: "name too long" }, 400);

  const now = Date.now();

  let row;
  try {
    row = await env.DB.prepare(
      "SELECT * FROM join_codes WHERE code = ? AND uses_left > 0 AND expires_at > ?"
    ).bind(code, now).first();
  } catch (e) {
    return json({ error: "database error" }, 500);
  }

  if (!row) return json({ error: "invalid or expired join code" }, 400);

  const teamId = row.team_id;

  // Find next free slot (1 or 2; slot 0 is the creator)
  let members;
  try {
    members = await env.DB.prepare(
      "SELECT slot_index FROM team_members WHERE team_id = ? ORDER BY slot_index"
    ).bind(teamId).all();
  } catch (e) {
    return json({ error: "database error" }, 500);
  }

  const taken = new Set((members.results || []).map((m) => m.slot_index));
  let slot = -1;
  for (let s = 1; s <= 2; s++) {
    if (!taken.has(s)) { slot = s; break; }
  }
  if (slot === -1) return json({ error: "team is full" }, 400);

  const memberId = crypto.randomUUID();
  try {
    await env.DB.prepare(
      "INSERT INTO team_members (team_id, slot_index, name, joined_at) VALUES (?, ?, ?, ?)"
    ).bind(teamId, slot, name, now).run();

    await env.DB.prepare(
      "UPDATE join_codes SET uses_left = uses_left - 1 WHERE code = ?"
    ).bind(code).run();

    const team = await env.DB.prepare(
      "SELECT * FROM teams WHERE id = ?"
    ).bind(teamId).first();
  } catch (e) {
    return json({ error: "could not join team" }, 500);
  }

  const team = await env.DB.prepare("SELECT * FROM teams WHERE id = ?").bind(teamId).first();

  return json(
    {
      ok: true,
      team: { id: team.id, name: team.name, school: team.school, created_at: team.created_at },
      member: { id: memberId, slot, name },
    },
    200
  ).then((res) => {
    res.headers.set("Set-Cookie", `ctf_member=${memberId}; Path=/; Max-Age=604800; SameSite=Lax`);
    return res;
  });
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
