/**
 * POST /api/auth/logout
 */
import { json, errorResponse, destroySession } from "../../_lib.js";

export const onRequestPost = async (context) => {
  const { env, request } = context;
  await destroySession(env, request);
  return json({ ok: true }, 200, { "Set-Cookie": `cf_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` });
};