/**
 * POST /api/teams/create
 * Body: { name, school }
 * Creates a team, makes the caller member slot 0, issues a join code.
 * Sets an HttpOnly-ish cookie (ctf_member) identifying the caller's member row.
 */
export const onRequestPost = async (context) => {
  try {
    return await handleCreate(context);
  } catch (err) {
    return json({
      error: "route handler threw",
      message: err.message,
      stack: err.stack
    }, 500);
  }
};

async function handleCreate(context) {
  const { env, request } = context;
  let body = {};
  if (request.method === "POST") {
    const ct = request.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      try {
        body = JSON.parse(await request.text());
      } catch (e) {
        return json({ error: "invalid json body", message: e.message }, 400);
      }
    }
  }
  const teamName = String(body.name || "").trim();
  const school = String(body.school || "").trim();

  if (!teamName) return json({ error: "team name is required" }, 400);
  if (teamName.length > 60) return json({ error: "team name too long" }, 400);
  if (school.length > 100) return json({ error: "school too long" }, 400);

  const now = Date.now();
  let teamId, memberId, joinCode;
  try {
    teamId = crypto.randomUUID();
    memberId = crypto.randomUUID();
    joinCode = crypto.randomUUID();
  } catch (e) {
    return json({ error: "uuid generation failed", message: e.message }, 500);
  }

  try {
    await env.DB.prepare(
      "INSERT INTO teams (id, name, school, created_at) VALUES (?, ?, ?, ?)"
    ).bind(teamId, teamName, school, now).run();

    await env.DB.prepare(
      "INSERT INTO team_members (team_id, slot_index, name, joined_at) VALUES (?, ?, ?, ?)"
    ).bind(teamId, 0, teamName, now).run();

    const expiresAt = now + 7 * 24 * 60 * 60 * 1000; // 7 days
    await env.DB.prepare(
      "INSERT INTO join_codes (code, team_id, expires_at, max_uses, uses_left, created_at) VALUES (?, ?, ?, 2, 2, ?)"
    ).bind(joinCode, teamId, expiresAt, now).run();
  } catch (e) {
    return json({ error: "could not create team", message: e.message }, 500);
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
