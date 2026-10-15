/**
 * Where a provider's OpenCode runs. Reuses the provider row's columns instead of new
 * ones: `cliPath` = the binary, `endpoint` = the URL of a server the user runs
 * themselves (empty = Onesist spawns one), `apiKey` = that server's password — stored,
 * masked and redacted exactly like an API key.
 */
import type { ProviderRow } from "~/server/agent/config";

export interface OpenCodeTarget {
  binary: string;
  serverUrl: string | null;
  serverPassword: string | null;
}

export function openCodeTargetOf(provider: Pick<ProviderRow, "cliPath" | "endpoint" | "apiKey">): OpenCodeTarget {
  return {
    binary: provider.cliPath?.trim() || "opencode",
    serverUrl: provider.endpoint?.trim() || null,
    serverPassword: provider.apiKey?.trim() || null,
  };
}
