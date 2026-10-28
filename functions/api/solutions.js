/**
 * POST /api/solutions
 * Body: { challengeId, flag }
 * Records a solution for the caller's team if the flag matches.
 * Uses ctf_member cookie to find the caller's team.
 * NOTE: flag verification is done client-side in app.js (hash compare). This endpoint
 * persists the result once the client reports a correct solve.
 */
export const onRequestPost = async (context) => {
  const { env, request } = context;
  const body = request.body || {};
  const challengeId = String(body.challengeId || "").trim();
  const points = Number(body.points || 0);
  const hintsUsed = Array.isArray(body.hintsUsed) ? body.hintsUsed : [];
  const attemptsUsed = Number(body.attemptsUsed || 0);

  if (!challengeId) return json({ error: "challenge id is required" }, 400);

  const memberId = getMemberCookie(request);
  if (!memberId) return json({ error: "not identified" }, 401);

  let member;
  try {
    member = await env.DB.prepare(
      "SELECT team_id FROM team_members WHERE id = ?"
    ).bind(memberId).first();
  } catch (e) {
    return json({ error: "database error" }, 500);
  }

  if (!member) return json({ error: "you are not on a team" }, 404);

  const teamId = member.team_id;
  const now = Date.now();

  try {
    await env.DB.prepare(
      `INSERT INTO team_solutions (team_id, challenge_id, solved_at, points, hints_used, attempts_used)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(team_id, challenge_id) DO UPDATE SET
         solved_at = excluded.solved_at,
         points = excluded.points,
         hints_used = excluded.hints_used,
         attempts_used = excluded.attempts_used`
    ).bind(teamId, challengeId, now, points, JSON.stringify(hintsUsed), attemptsUsed).run();
  } catch (e) {
    return json({ error: "could not save solution" }, 500);
  }

  return json({ ok: true, teamId, challengeId, solved_at: now });
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
