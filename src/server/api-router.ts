import { json } from "./http/response";
import { routers } from "./routes";

export async function handleApiRequest(request: Request): Promise<Response | null> {
  const reqUrl = new URL(request.url);
  if (!reqUrl.pathname.startsWith("/api/")) return null;

  try {
    for (const router of routers) {
      const res = await router.handle(request);
      if (res) return res;
    }
  } catch (err) {
    // A thrown route error used to escape to the SSR handler and come back as an
    // HTML 500 page, so the client's `res.json()` threw on the HTML instead of
    // showing what actually went wrong. Answer JSON — and log the cause — so
    // every /api/* caller gets a usable error.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[api] ${request.method} ${reqUrl.pathname} gagal: ${message}`);
    return json({ error: "Terjadi kesalahan di server", detail: message }, 500);
  }
  return json({ error: "Not found" }, 404);
}
