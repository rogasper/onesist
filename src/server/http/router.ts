import { json } from "./response";

export interface ApiCtx {
  request: Request;
  method: string;
  params: Record<string, string>;
  query: URLSearchParams;
  body: () => Promise<Record<string, unknown>>;
}

export type ApiHandler = (ctx: ApiCtx) => Response | Promise<Response>;

interface RouteEntry {
  method: string;
  pattern: (string | null)[];
  handler: ApiHandler;
}

export class Router {
  private routes: RouteEntry[] = [];

  get(pattern: string, handler: ApiHandler) {
    this.add("GET", pattern, handler);
  }
  post(pattern: string, handler: ApiHandler) {
    this.add("POST", pattern, handler);
  }
  put(pattern: string, handler: ApiHandler) {
    this.add("PUT", pattern, handler);
  }
  delete(pattern: string, handler: ApiHandler) {
    this.add("DELETE", pattern, handler);
  }
  all(pattern: string, handler: ApiHandler) {
    this.add("*", pattern, handler);
  }

  private add(method: string, pattern: string, handler: ApiHandler) {
    this.routes.push({ method, pattern: pattern.split("/").filter(Boolean), handler });
  }

  async handle(request: Request): Promise<Response | null> {
    const url = new URL(request.url);
    const segments = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
    let methodMismatch = false;

    for (const route of this.routes) {
      if (route.pattern.length !== segments.length) continue;
      const params: Record<string, string> = {};
      let matched = true;
      for (let i = 0; i < route.pattern.length; i++) {
        const p = route.pattern[i];
        if (p?.startsWith(":")) params[p.slice(1)] = segments[i];
        else if (p !== segments[i]) {
          matched = false;
          break;
        }
      }
      if (!matched) continue;
      if (route.method !== "*" && route.method !== request.method) {
        methodMismatch = true;
        continue;
      }
      const ctx: ApiCtx = {
        request,
        method: request.method,
        params,
        query: url.searchParams,
        body: () => request.json().catch(() => ({})),
      };
      return await route.handler(ctx);
    }

    return methodMismatch ? json({ error: "Method not allowed" }, 405) : null;
  }
}
