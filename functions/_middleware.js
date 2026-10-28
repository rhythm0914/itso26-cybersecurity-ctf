/**
 * _middleware.js - CORS + JSON body handling for all API routes.
 * Applied to every request under /api/.
 */
export const onRequest = async (context, next) => {
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

  const res = await next();

  // Add CORS headers to every response
  const headers = new Headers(res.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
