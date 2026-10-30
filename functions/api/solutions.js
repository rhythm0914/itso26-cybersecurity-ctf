import { json, errorResponse, hashFlag, safeEqual, rateLimit } from '../_lib.js';

function getMemberCookie(r) {
  const c = r.headers.get('cookie') || '';
  const m = c.match(/(?:^|;\s*)ctf_member=([^;]+)/);
  return m ? m[1] : null;
}

export const onRequestPost = async (ctx) => {
  const { env, request } = ctx;
  let body = {};
  if (request.method === 'POST') {
    const ct = request.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try { body = JSON.parse(await request.text()); } catch (e) { return errorResponse('bad', 400); }
    }
  }
  const cid = String(body.challengeId || '').trim();
  const ans = String(body.answer || '');
  if (!cid || !ans) return errorResponse('bad', 400);
  const mid = getMemberCookie(request);
  if (!mid) return errorResponse('no', 401);
  let mem;
  try { mem = await env.DB.prepare('SELECT team_id FROM team_members WHERE id = ?').bind(mid).first(); } catch (e) { return errorResponse('db', 500); }
  if (!mem) return errorResponse('no', 401);
  const tid = mem.team_id;
  try { if (!(await rateLimit(env, 'sol:' + tid, 'submit', 60))) return errorResponse('rl', 429); } catch (e) {}
  let fr;
  try { fr = await env.DB.prepare('SELECT * FROM challenge_flags WHERE challenge_id = ?').bind(cid).first(); } catch (e) { return errorResponse('db', 500); }
  if (!fr) return errorResponse('nf', 404);
  let comp;
  try { comp = await env.DB.prepare('SELECT * FROM competition_state WHERE team_id = ?').bind(tid).first(); } catch (e) {}
  const now = Date.now();
  if (!comp || !comp.started_at || comp.ended) return json({ correct: false, error: 'competition_not_active' }, 403);
  if (fr.is_tiebreaker && env.CTF_SHOW_TIEBREAKER !== 'true') return errorResponse('forbidden', 403);
  let ar;
  try { ar = await env.DB.prepare('SELECT * FROM challenge_attempts WHERE team_id = ? AND challenge_id = ?').bind(tid, cid).first(); } catch (e) {}
  if (ar && ar.locked) return json({ correct: false, locked: true, attemptsLeft: 0 }, 423);
  let ch;
  try { ch = await hashFlag(env, ans, !!fr.case_sensitive); } catch (e) { return errorResponse(e.message || 'err', 500); }
  const ok = safeEqual(String(ch).toLowerCase(), String(fr.flag_hash).toLowerCase());
  const ma = Number(env.CTF_MAX_ATTEMPTS || 3);
  if (ok) {
    try {
      const au = (ar && ar.attempts) ? ar.attempts : 0;
      await env.DB.prepare('INSERT OR IGNORE INTO team_solutions(id, team_id, challenge_id, solved_at, points, hints_used, attempts_used) VALUES(?, ?, ?, ?, ?, ?, ?)')
        .bind(crypto.randomUUID(), tid, cid, String(now), String(fr.points || 0), JSON.stringify([]), String(au)).run();
      if (ar && !ar.first_solved_at) {
        await env.DB.prepare('UPDATE challenge_attempts SET first_solved_at = ? WHERE team_id = ? AND challenge_id = ?')
          .bind(String(now), tid, cid).run();
      } else if (!ar) {
        await env.DB.prepare('INSERT OR REPLACE INTO challenge_attempts(team_id, challenge_id, attempts, locked, first_solved_at) VALUES(?, ?, 0, 0, ?)')
          .bind(tid, cid, String(now)).run();
      }
    } catch (e) {}
    return json({ correct: true, pointsAwarded: Number(fr.points || 0) });
  }
  const ca = (ar && ar.attempts) || 0;
  const na = ca + 1;
  const lk = na >= ma;
  try {
    await env.DB.prepare('INSERT OR REPLACE INTO challenge_attempts(team_id, challenge_id, attempts, locked, first_solved_at) VALUES(?, ?, ?, ?, ?)')
      .bind(tid, cid, String(na), lk ? 1 : 0, ar && ar.first_solved_at ? String(ar.first_solved_at) : null).run();
  } catch (e) {}
  return json({ correct: false, attemptsLeft: Math.max(0, ma - na), locked: !!lk });
};
