import { json } from "./http/response";
import { routers } from "./routes";

export async function handleApiRequest(request: Request): Promise<Response | null> {
  const reqUrl = new URL(request.url);
  if (!reqUrl.pathname.startsWith("/api/")) return null;

  for (const router of routers) {
    const res = await router.handle(request);
    if (res) return res;
  }
  return json({ error: "Not found" }, 404);
}
