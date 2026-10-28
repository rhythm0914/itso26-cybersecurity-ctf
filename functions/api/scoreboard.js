/**
 * GET /api/scoreboard
 * Returns leaderboard: all teams ranked by total score, ties by earliest last solve.
 */
export const onRequestGet = async (context) => {
  const { DB } = context;

  let teams;
  try {
    teams = await DB.prepare("SELECT * FROM teams ORDER BY created_at ASC").all();
  } catch (e) {
    return json({ error: "database error" }, 500);
  }

  const rows = teams.results || [];

  const entries = await Promise.all(
    rows.map(async (t) => {
      let solutions;
      try {
        solutions = await DB.prepare(
          "SELECT points, solved_at FROM team_solutions WHERE team_id = ?"
        ).bind(t.id).all();
      } catch (e) {
        solutions = { results: [] };
      }

      const sol = solutions.results || [];
      let total = 0;
      let lastSolve = 0;
      sol.forEach((s) => {
        total += s.points || 0;
        if (s.solved_at && s.solved_at > lastSolve) lastSolve = s.solved_at;
      });

      return {
        id: t.id,
        name: t.name,
        school: t.school,
        score: total,
        solved: sol.length,
        lastSolve: lastSolve || null,
        started_at: t.started_at,
        ended_at: t.ended_at,
      };
    })
  );

  entries.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const at = a.lastSolve || Number.MAX_SAFE_INTEGER;
    const bt = b.lastSolve || Number.MAX_SAFE_INTEGER;
    if (at !== bt) return at - bt;
    return a.name.localeCompare(b.name);
  });

  return json({ teams: entries.map((e, i) => ({ ...e, rank: i + 1 })) });
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
