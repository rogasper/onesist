import { expect, test } from "bun:test";
import type { OAuthTokens } from "@ai-sdk/mcp";
import {
  isRegistrationUnsupported,
  oauthRedirectUrl,
  readStoredTokens,
  serializeTokens,
  peekOAuthTokens,
  takeOAuthTokens,
  hasPendingOAuth,
} from "./oauth";

test("isRegistrationUnsupported identifies refusal messages correctly", () => {
  expect(isRegistrationUnsupported(new Error("Dynamic client registration is not supported"))).toBe(true);
  expect(isRegistrationUnsupported("Provider does not support dynamic client registration")).toBe(true);
  expect(isRegistrationUnsupported("HTTP 403 Forbidden")).toBe(true);
  expect(isRegistrationUnsupported("forbidden access")).toBe(true);
  expect(isRegistrationUnsupported(new Error("Network connection timed out"))).toBe(false);
  expect(isRegistrationUnsupported(null)).toBe(false);
});

test("oauthRedirectUrl uses default 4321 or process.env.PORT", () => {
  const oldPort = process.env.PORT;
  try {
    delete process.env.PORT;
    expect(oauthRedirectUrl()).toBe("http://localhost:4321/api/mcp-servers/oauth/callback");

    process.env.PORT = "9999";
    expect(oauthRedirectUrl()).toBe("http://localhost:9999/api/mcp-servers/oauth/callback");
  } finally {
    if (oldPort !== undefined) process.env.PORT = oldPort;
    else delete process.env.PORT;
  }
});

test("readStoredTokens and serializeTokens round-trip token bundle", () => {
  const tokenBundle: OAuthTokens = {
    access_token: "ghu_secret_access_token_123",
    refresh_token: "ghr_secret_refresh_token_456",
    token_type: "bearer",
    expires_in: 3600,
  };

  const serialized = serializeTokens(tokenBundle);
  expect(typeof serialized).toBe("string");

  const row = { authKind: "oauth", authValue: serialized };
  const parsed = readStoredTokens(row);
  expect(parsed).not.toBeNull();
  expect(parsed?.access_token).toBe("ghu_secret_access_token_123");
  expect(parsed?.refresh_token).toBe("ghr_secret_refresh_token_456");
  expect(parsed?.token_type).toBe("bearer");
  expect(parsed?.expires_in).toBe(3600);
  expect(parsed?.savedAt).toBeDefined();

  // Non-oauth row or invalid value
  expect(readStoredTokens({ authKind: "header", authValue: serialized })).toBeNull();
  expect(readStoredTokens({ authKind: "oauth", authValue: null })).toBeNull();
  expect(readStoredTokens({ authKind: "oauth", authValue: "not-json" })).toBeNull();
  expect(readStoredTokens({ authKind: "oauth", authValue: JSON.stringify({ other: 123 }) })).toBeNull();
});

test("peekOAuthTokens and takeOAuthTokens handle unknown/empty refs gracefully", () => {
  expect(peekOAuthTokens(null)).toBeNull();
  expect(peekOAuthTokens(undefined)).toBeNull();
  expect(peekOAuthTokens("nonexistent-state")).toBeNull();
  expect(takeOAuthTokens(null)).toBeNull();
  expect(takeOAuthTokens("nonexistent-state")).toBeNull();
  expect(hasPendingOAuth("nonexistent-state")).toBe(false);
});
