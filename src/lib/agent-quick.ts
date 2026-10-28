/**
 * One-click CLI agents: a detected agent (found on this machine) becomes a provider with its
 * preset, so the user never has to fill in a form for it.
 */
export const DETECTED_AGENT_PRESETS: Record<string, { preset: string; label: string }> = {
  "claude-code": { preset: "cli-claude", label: "Claude Code (CLI)" },
  opencode: { preset: "cli-opencode", label: "opencode (CLI)" },
  codex: { preset: "cli-codex", label: "Codex (CLI)" },
  pi: { preset: "cli-pi", label: "Pi (CLI)" },
};

export interface DetectedAgent {
  name: string;
  found: boolean;
  path: string | null;
}

/** Creates the provider for a detected agent, or returns the one already configured for it. */
export async function addDetectedAgent(agent: DetectedAgent): Promise<string | null> {
  const preset = DETECTED_AGENT_PRESETS[agent.name];
  if (!preset || !agent.path) return null;
  const res = await fetch("/api/providers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: preset.label, preset: preset.preset, cliPath: agent.path }),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; provider?: { id: string } };
  if (res.ok) return body.id ?? body.provider?.id ?? null;
  // Already configured under the same name: use that one.
  if (res.status === 409) {
    const list = (await (await fetch("/api/providers", { cache: "no-store" })).json()) as { providers: { id: string; name: string }[] };
    return list.providers.find((p) => p.name === preset.label)?.id ?? null;
  }
  return null;
}
