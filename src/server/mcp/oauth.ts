/**
 * OAuth for external MCP servers, per the MCP authorization spec.
 *
 * Figma and GitHub MCP both publish protected-resource metadata, and Miro and
 * Monday additionally support dynamic client registration, so nothing has to be
 * pre-registered: `auth()` discovers the authorization server, registers a
 * client, and returns the URL the user must approve. The code comes back on the
 * loopback callback.
 *
 * Acquiring a credential and saving it are SEPARATE steps. A completed flow
 * leaves its token bundle in `pending`, reachable only through the opaque
 * reference handed to the UI; nothing is written to a row until the user saves.
 * That is what makes Batal and switching preset safe.
 *
 * In memory on purpose: an unsaved credential should not outlive the process.
 */
import crypto from "node:crypto";
import { auth, type OAuthClientProvider, type OAuthTokens } from "@ai-sdk/mcp";
import { assertSafeMcpUrl, safeMcpFetch } from "./url-guard";

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

interface Flow {
  serverUrl: string;
  authorizationUrl: string;
  codeVerifier: string;
  state: string;
  clientInformation: any;
  tokens?: OAuthTokens;
  createdAt: number;
}

/** Authorization in progress, keyed by the OAuth state. */
const flows = new Map<string, Flow>();
/** Completed flows whose credential has not been saved yet, keyed by reference. */
const completed = new Map<string, Flow>();
const TTL_MS = 30 * 60_000;

function sweep(): void {
  const now = Date.now();
  for (const map of [flows, completed]) {
    for (const [key, flow] of map.entries()) {
      if (now - flow.createdAt > TTL_MS) map.delete(key);
    }
  }
}

/** Loopback callback. The port is the one this server actually listens on. */
export function oauthRedirectUrl(): string {
  const port = process.env.PORT?.trim() || "4321";
  return `http://localhost:${port}/api/mcp-servers/oauth/callback`;
}

export interface StoredTokens {
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

/** The token bundle as it is written to a row: what a completed flow produced. */
export function serializeTokens(tokens: OAuthTokens): string {
  const stored: StoredTokens = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_type: tokens.token_type,
    expires_in: tokens.expires_in,
    savedAt: new Date().toISOString(),
  };
  return JSON.stringify(stored);
}

/**
 * Provider bound to one flow. The SDK drives it: it stores the PKCE verifier,
 * hands back the authorization URL through `redirectToAuthorization`, and
 * reports the tokens once the code is exchanged.
 */
function providerFor(flow: Flow): OAuthClientProvider {
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
      return flow.tokens;
    },
    saveTokens(tokens) {
      flow.tokens = tokens;
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
    /** Metadata points at the authorization server, so that URL is checked too. */
    async validateAuthorizationServerURL(_serverUrl, authorizationServerUrl) {
      await assertSafeMcpUrl(authorizationServerUrl.toString());
    },
  };
}

export interface BeginResult {
  /** Empty when the provider returned a token without a browser round trip. */
  authorizationUrl: string;
  /**
   * Identifies this flow. The UI polls `oauth/result` with it and saves with it,
   * so one key covers the whole round trip: start, callback, save.
   */
  state: string;
}

/** Starts a flow. Either a URL to approve, or a credential that is already ready. */
export async function beginOAuth(serverUrl: string): Promise<BeginResult> {
  sweep();
  const safeUrl = await assertSafeMcpUrl(serverUrl);
  const flow: Flow = {
    serverUrl: safeUrl.href,
    authorizationUrl: "",
    codeVerifier: "",
    state: crypto.randomBytes(16).toString("hex"),
    clientInformation: undefined,
    createdAt: Date.now(),
  };

  const result = await auth(providerFor(flow), { serverUrl: safeUrl.href, fetchFn: safeMcpFetch });
  if (result === "AUTHORIZED") {
    // The provider handed back a token without a browser round trip.
    if (!flow.tokens) throw new McpOAuthError("Server MCP tidak mengembalikan token.");
    completed.set(flow.state, flow);
    return { authorizationUrl: "", state: flow.state };
  }
  if (!flow.authorizationUrl) throw new McpOAuthError("Server MCP tidak mengembalikan URL otorisasi.");
  flows.set(flow.state, flow);
  return { authorizationUrl: flow.authorizationUrl, state: flow.state };
}

/**
 * Completes a flow with the code from the callback. The credential stays
 * unsaved, reachable under the flow's own state.
 */
export async function completeOAuth(state: string, code: string): Promise<void> {
  sweep();
  const flow = flows.get(state);
  if (!flow) throw new McpOAuthError("Sesi OAuth tidak ditemukan atau sudah kedaluwarsa.");
  await auth(providerFor(flow), {
    serverUrl: flow.serverUrl,
    authorizationCode: code,
    callbackState: state,
    fetchFn: safeMcpFetch,
  });
  flows.delete(state);
  if (!flow.tokens) throw new McpOAuthError("Server MCP tidak mengembalikan token.");
  completed.set(state, flow);
}

export function hasPendingOAuth(state: string): boolean {
  return flows.has(state);
}

/** The token bundle waiting to be saved, or null once saved or expired. */
export function peekOAuthTokens(ref: string | null | undefined): string | null {
  if (!ref) return null;
  sweep();
  const flow = completed.get(ref);
  return flow?.tokens ? serializeTokens(flow.tokens) : null;
}

/** Consumes the bundle once it has been written to a row. */
export function takeOAuthTokens(ref: string | null | undefined): string | null {
  const value = peekOAuthTokens(ref);
  if (value && ref) completed.delete(ref);
  return value;
}
