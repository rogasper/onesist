/**
 * Bearer token for the MCP endpoint.
 *
 * The endpoint is reachable by any process on this machine, and by any web page
 * that can make the browser send a request to localhost. A token in an
 * `Authorization` header stops the second: a cross-site page cannot set that header
 * without a CORS preflight, and this server answers none. Same per-installation
 * pattern as the approval secret (`run-registry.ts`): random, beside the database,
 * owner-only.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

let cached: string | null = null;

export function mcpTokenPath(): string {
  const dbPath = process.env.SA_DB_PATH ? path.resolve(process.env.SA_DB_PATH) : path.resolve(process.cwd(), "data.db");
  return path.join(path.dirname(dbPath), "mcp-token.secret");
}

export function readOrCreateToken(file: string): string {
  if (fs.existsSync(file)) {
    const existing = fs.readFileSync(file, "utf-8").trim();
    if (existing.length >= 32) return existing;
  }
  const fresh = crypto.randomBytes(32).toString("hex");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, fresh, { encoding: "utf-8", mode: 0o600 });
  // writeFileSync only applies `mode` when it creates the file; a replaced short file keeps its old mode.
  fs.chmodSync(file, 0o600);
  return fresh;
}

export function getMcpToken(): string {
  if (cached) return cached;
  const fromEnv = process.env.SA_MCP_TOKEN?.trim();
  if (fromEnv && fromEnv.length >= 32) {
    cached = fromEnv;
    return cached;
  }
  try {
    cached = readOrCreateToken(mcpTokenPath());
  } catch {
    // Read-only filesystem: a session token still protects the endpoint; it just changes on restart.
    cached = crypto.randomBytes(32).toString("hex");
  }
  return cached;
}

export function bearerMatches(header: string | null, token: string): boolean {
  if (!header || !header.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice("Bearer ".length).trim(), "utf-8");
  const wanted = Buffer.from(token, "utf-8");
  return given.length === wanted.length && crypto.timingSafeEqual(given, wanted);
}
