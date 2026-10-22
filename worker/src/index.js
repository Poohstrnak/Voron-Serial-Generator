// GET /api/count returns {"count": total}; POST adds one download and returns the new total.
// The increment is a single UPDATE, so downloads at the same moment can't overwrite each other.
export default {
  async fetch(request, env) {
    let row;
    if (request.method === "POST") {
      row = await env.DB.prepare("UPDATE counter SET n = n + 1 WHERE id = 1 RETURNING n").first();
    } else if (request.method === "GET" || request.method === "HEAD") {
      row = await env.DB.prepare("SELECT n FROM counter WHERE id = 1").first();
    } else {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD, POST" } });
    }
    return Response.json({ count: row?.n ?? 0 }, { headers: { "Cache-Control": "no-store" } });
  },
};
