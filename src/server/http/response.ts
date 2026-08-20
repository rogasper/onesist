export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      // WKWebView (Tauri desktop) heuristically caches responses without
      // explicit cache headers — stale agent/project data would persist across
      // app launches. API responses must always be fresh.
      "Cache-Control": "no-store",
    },
  });
}

export function notFound(): Response {
  return json({ error: "Not found" }, 404);
}

export function badRequest(error = "Bad request"): Response {
  return json({ error }, 400);
}
