/**
 * POST /api/teams/create
 * Body: { name, school, slug?, motto?, description?, recruitment? }
 *
 * Uses two-step INSERT (minimal columns + UPDATE) to avoid D1 datatype
 * mismatch on the Pages Workers runtime with wide bind-parameter lists.
 */
import { errorResponse, cleanString, getSession } from "../../_lib.js";

function getMemberCookie(request) {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)ctf_member=([^;]+)/);
  return match ? match[1] : null;
}

function localJson(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

export const onRequestPost = async (context) => {
  try {
    const { env, request } = context;
    const session = await getSession(env, request);
    const memberId = getMemberCookie(request);
    const now = Date.now();

    let body = {};
    const ct = request.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      try { body = JSON.parse(await request.text()); } catch { return errorResponse("invalid json body", 400); }
    }

    const teamName = cleanString(body.name);
    const school = cleanString(body.school || "");
    const slug = cleanString(body.slug || slugify(teamName));
    const motto = cleanString(body.motto || "");
    const description = cleanString(body.description || "");
    const recruitment = body.recruitment !== false ? 1 : 0;

    if (!teamName || teamName.length > 60) return errorResponse("team name required (max 60 chars)", 400);
    if (school.length > 100) return errorResponse("school too long", 400);

    let teamId, memberIdNew;

    if (session) {
      let existing = await env.DB.prepare("SELECT id FROM team_members WHERE user_id = ? LIMIT 1").bind(session.userId).first();
      if (existing) return errorResponse("you already belong to a team", 409);
      existing = await env.DB.prepare("SELECT id FROM teams WHERE lower(slug) = ? LIMIT 1").bind(slug.toLowerCase()).first();
      if (existing) return errorResponse("team slug already in use", 409);

      teamId = crypto.randomUUID();
      memberIdNew = crypto.randomUUID();
      try {
        await env.DB.prepare(
          "INSERT INTO teams (id, name, school, created_at) VALUES (?, ?, ?, ?)"
        ).bind(teamId, teamName, school, now).run();
        await env.DB.prepare(
          "UPDATE teams SET slug = ?, motto = ?, description = ?, recruitment = ?, max_size = 3, captain_user_id = ?, status = 'open', updated_at = ? WHERE id = ?"
        ).bind(slug, motto, description, recruitment, session.userId, now, teamId).run();
        await env.DB.prepare(
          "INSERT INTO team_members (id, team_id, slot_index, name, user_id, is_captain, joined_at) VALUES (?, ?, 0, ?, ?, 1, ?)"
        ).bind(memberIdNew, teamId, teamName, session.userId, now).run();
      } catch (e) { return localJson({ error: "could not create team", message: String(e.message || e) }, 500); }
    } else {
      if (!memberId) return errorResponse("authentication required", 401);
      teamId = crypto.randomUUID();
      memberIdNew = crypto.randomUUID();
      try {
        await env.DB.prepare(
          "INSERT INTO teams (id, name, school, created_at) VALUES (?, ?, ?, ?)"
        ).bind(teamId, teamName, school, now).run();
        await env.DB.prepare(
          "UPDATE teams SET slug = ?, motto = ?, description = ?, recruitment = ?, max_size = 3, captain_user_id = NULL, status = 'open', updated_at = ? WHERE id = ?"
        ).bind(slug, motto, description, recruitment, now, teamId).run();
        await env.DB.prepare(
          "INSERT INTO team_members (id, team_id, slot_index, name, is_captain, joined_at) VALUES (?, ?, 0, ?, 1, ?)"
        ).bind(memberIdNew, teamId, teamName, now).run();
      } catch (e) { return errorResponse("could not create team", 500); }
    }

    const joinCode = crypto.randomUUID();
    const expiresAt = now + 7 * 24 * 3600 * 1000;
    try {
      await env.DB.prepare(
        "INSERT INTO join_codes (code, team_id, expires_at, max_uses, uses_left, created_at) VALUES (?, ?, ?, 2, 2, ?)"
      ).bind(joinCode, teamId, expiresAt, now).run();
    } catch (e) { return errorResponse("could not issue join code", 500); }

    const cookie = `ctf_member=${memberIdNew}; Path=/; Max-Age=604800; SameSite=Lax`;
    return localJson({ ok: true, team: { id: teamId, name: teamName, school, slug, motto, description, recruitment: !!recruitment, created_at: now }, member: { id: memberIdNew, slot: 0, name: teamName }, joinCode }, 200, { "Set-Cookie": cookie });
  } catch (e) {
    return localJson({ error: "worker exception", message: String(e.message || e), stack: String(e.stack || "").split("\n").slice(0, 5) }, 500);
  }
};

function slugify(s) {
  return String(s || "team").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "team";
}