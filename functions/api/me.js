/**
 * GET /api/me
 * Returns the caller's identity + team.
 * Prefers cf_session (authenticated user), falls back to ctf_member (offline lobby).
 */
import { json, errorResponse, getSession } from "../_lib.js";

function getMemberCookie(request) {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)ctf_member=([^;]+)/);
  return match ? match[1] : null;
}

export const onRequestGet = async (context) => {
  const { env, request } = context;

  const session = await getSession(env, request);
  if (session) {
    let team = null;
    let member = null;
    let members = [];
    try {
      const mem = await env.DB.prepare(
        "SELECT id, team_id, slot_index, name, is_ready, joined_at FROM team_members WHERE user_id = ? ORDER BY slot_index LIMIT 1"
      ).bind(session.userId).first();
      if (mem) {
        member = { id: mem.id, slot: mem.slot_index, name: mem.name, ready: !!mem.is_ready, joined_at: mem.joined_at };
        team = await env.DB.prepare("SELECT * FROM teams WHERE id = ?").bind(mem.team_id).first();
        const ms = await env.DB.prepare(
          "SELECT id, slot_index, name, is_ready, joined_at FROM team_members WHERE team_id = ? ORDER BY slot_index"
        ).bind(mem.team_id).all();
        members = (ms.results || []).map((m) => ({ id: m.id, slot: m.slot_index, name: m.name, ready: !!m.is_ready, joined_at: m.joined_at }));
      }
    } catch (e) { return errorResponse("database error", 500); }

    let solved = {};
    if (team) {
      try {
        const sol = await env.DB.prepare("SELECT challenge_id, points, solved_at, hints_used, attempts_used FROM team_solutions WHERE team_id = ?").bind(team.id).all();
        solved = (sol.results || []).reduce((acc, s) => {
          let hints = [];
          try { hints = JSON.parse(s.hints_used || "[]"); } catch { hints = []; }
          acc[s.challenge_id] = { at: s.solved_at, points: s.points, hints, attempts: s.attempts_used };
          return acc;
        }, {});
      } catch { solved = {}; }
    }

    return json({
      ok: true,
      auth: "user",
      user: { id: session.userId, username: session.username, email: session.email, role: session.role, email_verified: session.emailVerified },
      team: team ? { id: team.id, name: team.name, school: team.school, created_at: team.created_at, started_at: team.started_at, ended_at: team.ended_at } : null,
      member, members, solved,
    });
  }

  // Offline lobby fallback via ctf_member cookie
  const memberId = getMemberCookie(request);
  if (!memberId) return json({ ok: false, auth: "none", team: null, member: null }, 200);

  let member;
  try {
    member = await env.DB.prepare("SELECT id, team_id, slot_index, name, is_ready, joined_at FROM team_members WHERE id = ?").bind(memberId).first();
  } catch { return errorResponse("database error", 500); }

  if (!member) {
    return json({ ok: false, auth: "none", team: null, member: null }, 200);
  }

  let team;
  try {
    team = await env.DB.prepare("SELECT * FROM teams WHERE id = ?").bind(member.team_id).first();
  } catch { return errorResponse("database error", 500); }
  if (!team) return json({ ok: false, auth: "none", team: null, member: null }, 200);

  let members;
  try {
    members = await env.DB.prepare("SELECT id, slot_index, name, is_ready, joined_at FROM team_members WHERE team_id = ? ORDER BY slot_index").bind(team.id).all();
  } catch { return errorResponse("database error", 500); }

  let solutions = { results: [] };
  try {
    solutions = await env.DB.prepare("SELECT challenge_id, points, solved_at, hints_used, attempts_used FROM team_solutions WHERE team_id = ?").bind(team.id).all();
  } catch {}

  return json({
    ok: true,
    auth: "member",
    team: { id: team.id, name: team.name, school: team.school, created_at: team.created_at, started_at: team.started_at, ended_at: team.ended_at },
    member: { id: member.id, slot: member.slot_index, name: member.name, ready: !!member.is_ready, joined_at: member.joined_at },
    members: (members.results || []).map((m) => ({ id: m.id, slot: m.slot_index, name: m.name, ready: !!m.is_ready, joined_at: m.joined_at })),
    solved: (solutions.results || []).reduce((acc, s) => {
      let hints = [];
      try { hints = JSON.parse(s.hints_used || "[]"); } catch { hints = []; }
      acc[s.challenge_id] = { at: s.solved_at, points: s.points, hints, attempts: s.attempts_used };
      return acc;
    }, {}),
  });
};