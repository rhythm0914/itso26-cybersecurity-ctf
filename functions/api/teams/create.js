/**
 * POST /api/teams/create
 * Body: { name, school }
 * Creates a team, makes the caller member slot 0, issues a join code.
 * Sets an HttpOnly-ish cookie (ctf_member) identifying the caller's member row.
 */
export const onRequestPost = async (context) => {
  const { env, request } = context;
  const body = request.body || {};
  const teamName = String(body.name || "").trim();
  const school = String(body.school || "").trim();

  if (!teamName) return json({ error: "team name is required" }, 400);
  if (teamName.length > 60) return json({ error: "team name too long" }, 400);
  if (school.length > 100) return json({ error: "school too long" }, 400);

  const now = Date.now();
  const teamId = crypto.randomUUID();
  const memberId = crypto.randomUUID();
  const joinCode = crypto.randomUUID();

  try {
    await env.DB.prepare(
      "INSERT INTO teams (id, name, school, created_at) VALUES (?, ?, ?, ?)"
    ).bind(teamId, teamName, school, now).run();

    await env.DB.prepare(
      "INSERT INTO team_members (team_id, slot_index, name, joined_at) VALUES (?, 0, ?, ?)"
    ).bind(teamId, memberId, teamName, now).run();

    const expiresAt = now + 7 * 24 * 60 * 60 * 1000; // 7 days
    await env.DB.prepare(
      "INSERT INTO join_codes (code, team_id, expires_at, max_uses, uses_left, created_at) VALUES (?, ?, ?, 2, 2, ?)"
    ).bind(joinCode, teamId, expiresAt, now).run();
  } catch (e) {
    return json({ error: "could not create team" }, 500);
  }

  return json(
    {
      ok: true,
      team: { id: teamId, name: teamName, school, created_at: now },
      member: { id: memberId, slot: 0, name: teamName },
      joinCode,
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
