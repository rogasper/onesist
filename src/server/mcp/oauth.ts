/**
 * OAuth for external MCP servers, per the MCP authorization spec.
 *
 * Figma and GitHub MCP both publish protected-resource metadata and support
 * dynamic client registration + PKCE, so nothing has to be pre-registered:
 * `auth()` discovers the authorization server, registers a client, and returns
 * the URL the user must approve. The code comes back on the loopback callback.
 *
 * Pending flows live in memory — the browser round trip happens within one
 * process lifetime — while the tokens are written to the server row, so a
 * restart keeps the connection.
 */
import crypto from "node:crypto";
import { auth, type OAuthClientProvider, type OAuthTokens } from "@ai-sdk/mcp";
import { eq } from "drizzle-orm";
import { db } from "~/server/db/client";
import { mcpServers } from "~/server/db/schema";

export class McpOAuthError extends Error {}

/**
 * Does this failure mean the server will not register us as a client?
 *
 * Measured 2026-10-16: Miro and Monday accept dynamic registration and return a
 * client_id; Figma answers 403 Forbidden and GitHub publishes no
 * `registration_endpoint` at all. That is a property of the provider, not a bug
 * here, so the UI must send the user to a personal access token instead of
 * retrying the same flow.
 */
export function isRegistrationUnsupported(err: unknown): boolean {
  const text = String((err as any)?.message ?? err ?? "").toLowerCase();
  return (
    text.includes("dynamic client registration") ||
    text.includes("does not support") ||
    text.includes("forbidden") ||
    text.includes("403")
  );
}

export interface PendingOAuth {
  serverId: string;
  serverUrl: string;
  authorizationUrl: string;
  codeVerifier: string;
  state: string;
  clientInformation: any;
  createdAt: number;
}

const pending = new Map<string, PendingOAuth>();
const TTL_MS = 10 * 60_000;

function sweep(): void {
  const now = Date.now();
  for (const [state, flow] of pending.entries()) {
    if (now - flow.createdAt > TTL_MS) pending.delete(state);
  }
}

/** Loopback callback. The port is the one this server actually listens on. */
export function oauthRedirectUrl(): string {
  const port = process.env.PORT?.trim() || "4321";
  return `http://localhost:${port}/api/mcp-servers/oauth/callback`;
}

interface StoredTokens {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  savedAt?: string;
}

export function readStoredTokens(row: { authKind: string; authValue: string | null }): StoredTokens | null {
  if (row.authKind !== "oauth" || !row.authValue) return null;
  try {
    const parsed = JSON.parse(row.authValue);
    return typeof parsed?.access_token === "string" ? (parsed as StoredTokens) : null;
  } catch {
    return null;
  }
}

function saveTokens(serverId: string, tokens: OAuthTokens): void {
  const stored: StoredTokens = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_type: tokens.token_type,
    expires_in: tokens.expires_in,
    savedAt: new Date().toISOString(),
  };
  db.update(mcpServers)
    .set({ authKind: "oauth", authValue: JSON.stringify(stored), updatedAt: new Date().toISOString() })
    .where(eq(mcpServers.id, serverId))
    .run();
}

/**
 * Provider bound to one pending flow. The SDK drives it: it stores the PKCE
 * verifier, hands back the authorization URL through `redirectToAuthorization`,
 * and writes the tokens once the code is exchanged.
 */
function providerFor(serverId: string, flow: PendingOAuth): OAuthClientProvider {
  return {
    get redirectUrl() {
      return oauthRedirectUrl();
    },
    get clientMetadata() {
      return {
        redirect_uris: [oauthRedirectUrl()],
        client_name: "Onesist",
        client_uri: "https://github.com/rogasper/onesist",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      };
    },
    tokens() {
      const row = db.select().from(mcpServers).where(eq(mcpServers.id, serverId)).get();
      return row ? (readStoredTokens(row as any) as OAuthTokens | null) ?? undefined : undefined;
    },
    saveTokens(tokens) {
      saveTokens(serverId, tokens);
    },
    redirectToAuthorization(url) {
      flow.authorizationUrl = url.toString();
    },
    saveCodeVerifier(verifier) {
      flow.codeVerifier = verifier;
    },
    codeVerifier() {
      return flow.codeVerifier;
    },
    clientInformation() {
      return flow.clientInformation;
    },
    saveClientInformation(info) {
      flow.clientInformation = info;
    },
    state() {
      return flow.state;
    },
    saveState(state) {
      flow.state = state;
    },
    storedState() {
      return flow.state;
    },
  };
}

/** Starts a flow and returns the URL the user has to approve in a browser. */
export async function beginOAuth(serverId: string, serverUrl: string): Promise<string> {
  sweep();
  const flow: PendingOAuth = {
    serverId,
    serverUrl,
    authorizationUrl: "",
    codeVerifier: "",
    state: crypto.randomBytes(16).toString("hex"),
    clientInformation: undefined,
    createdAt: Date.now(),
  };

  const result = await auth(providerFor(serverId, flow), { serverUrl });
  if (result === "AUTHORIZED") {
    // A refresh token was still valid; no browser needed.
    return "";
  }
  if (!flow.authorizationUrl) throw new McpOAuthError("Server MCP tidak mengembalikan URL otorisasi.");
  pending.set(flow.state, flow);
  return flow.authorizationUrl;
}

/** Completes a flow with the code from the callback. */
export async function completeOAuth(state: string, code: string): Promise<void> {
  sweep();
  const flow = pending.get(state);
  if (!flow) throw new McpOAuthError("Sesi OAuth tidak ditemukan atau sudah kedaluwarsa.");
  await auth(providerFor(flow.serverId, flow), {
    serverUrl: flow.serverUrl,
    authorizationCode: code,
    callbackState: state,
  });
  pending.delete(state);
}

export function hasPendingOAuth(state: string): boolean {
  return pending.has(state);
}
