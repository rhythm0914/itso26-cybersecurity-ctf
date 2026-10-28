/**
 * GET /api/teams/:teamId
 * Returns team + members.
 * PATCH /api/teams/:teamId
 * Body: { slot, name, ready }
 * Updates a member's name and/or ready state. Only the member themselves
 * (identified by ctf_member cookie) can update their own row; the team
 * creator (slot 0) can update any slot.
 */
export const onRequestGet = async (context) => {
  const { env, request } = context;
  const { teamId } = context.params;

  let team;
  try {
    team = await env.DB.prepare("SELECT * FROM teams WHERE id = ?").bind(teamId).first();
  } catch (e) {
    return json({ error: "database error" }, 500);
  }

  if (!team) return json({ error: "team not found" }, 404);

  let members;
  try {
    members = await env.DB.prepare(
      "SELECT id, slot_index, name, is_ready, joined_at FROM team_members WHERE team_id = ? ORDER BY slot_index"
    ).bind(teamId).all();
  } catch (e) {
    return json({ error: "database error" }, 500);
  }

  return json({
    team: {
      id: team.id,
      name: team.name,
      school: team.school,
      created_at: team.created_at,
      started_at: team.started_at,
      ended_at: team.ended_at,
    },
    members: (members.results || []).map((m) => ({
      id: m.id,
      slot: m.slot_index,
      name: m.name,
      ready: !!m.is_ready,
      joined_at: m.joined_at,
    })),
  });
};

export const onRequestPatch = async (context) => {
  const { env, request } = context;
  const { teamId } = context.params;

  // Prefer authenticated session user, fall back to ctf_member cookie
  let caller = null;
  const { getSession } = await import("../../_lib.js");
  const session = await getSession(env, request);
  if (session) {
    caller = await env.DB.prepare("SELECT id, slot_index FROM team_members WHERE user_id = ? AND team_id = ?").bind(session.userId, teamId).first();
  } else {
    const memberId = getMemberCookie(request);
    if (!memberId) return json({ error: "not identified" }, 401);
    caller = await env.DB.prepare("SELECT id, slot_index FROM team_members WHERE id = ? AND team_id = ?").bind(memberId, teamId).first();
  }
  if (!caller) return json({ error: "you are not a member of this team" }, 404);

  let body = {};
  const ct = request.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try { body = JSON.parse(await request.text()); } catch { return json({ error: "invalid json body" }, 400); }
  }

  const slot = Number(body.slot);
  const name = body.name !== undefined ? String(body.name || "").trim() : null;
  const ready = body.ready !== undefined ? Boolean(body.ready) : null;

  if (slot === undefined || slot === null || slot < 0 || slot > 2) {
    return json({ error: "slot must be 0, 1 or 2" }, 400);
  }
  if (name === null && ready === null) {
    return json({ error: "nothing to update" }, 400);
  }

  const isCreator = caller.slot_index === 0;
  const isOwnRow = caller.id === await getMemberRowId(env, teamId, slot);

  // Only the creator can edit another member's row; anyone can edit their own
  if (!isCreator && !isOwnRow) {
    return json({ error: "you can only update your own member row" }, 403);
  }

  // Build the update dynamically
  const sets = [];
  const params = [];
  if (name !== null) {
    sets.push("name = ?");
    params.push(name);
  }
  if (ready !== null) {
    sets.push("is_ready = ?");
    params.push(String(ready ? 1 : 0));
  }
  params.push(slot);

  try {
    await env.DB.prepare(
      "UPDATE team_members SET " + sets.join(", ") + " WHERE slot_index = ? AND team_id = ?"
    ).bind(...params, teamId).run();
  } catch (e) {
    return json({ error: "could not update member" }, 500);
  }

  return json({ ok: true, slot });
};

async function getMemberRowId(env, teamId, slot) {
  let row;
  try {
    row = await env.DB.prepare(
      "SELECT id FROM team_members WHERE team_id = ? AND slot_index = ?"
    ).bind(teamId, slot).first();
  } catch (e) {
    return null;
  }
  return row ? row.id : null;
}

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
