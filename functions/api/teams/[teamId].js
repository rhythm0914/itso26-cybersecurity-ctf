/**
 * GET /api/teams/:teamId
 * Returns team + members. Uses ctf_member cookie to scope visibility.
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

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
