/**
 * _middleware.js - CORS + JSON body handling for all API routes.
 * Applied to every request under /api/.
 *
 * Cloudflare Pages Functions middleware does NOT use the (context, next)
 * signature like Workers. onRequest receives only context. Return a Response
 * to short-circuit, or undefined to let the route handler run.
 */
export const onRequest = async (context) => {
  try {
    return await handleRequest(context);
  } catch (err) {
    return json({
      error: "middleware threw",
      message: err.message,
      stack: err.stack
    }, 500);
  }
};

async function handleRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // Parse JSON body for POST requests
  if (request.method === "POST") {
    const ct = request.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      try {
        request.body = JSON.parse(await request.text());
      } catch (e) {
        return json({ error: "invalid json body" }, 400);
      }
    }
  }

  // D1 binding check
  if (!context.env || !context.env.DB) {
    return json({
      error: "database not configured",
      message: "Bind the D1 database 'itso26-cybersecurity-ctf' (binding: DB) in the Pages project settings.",
    }, 503);
  }

  // Return undefined to let the route handler run automatically.
  // Pages Functions invokes the route handler after middleware returns undefined.
  return undefined;
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
