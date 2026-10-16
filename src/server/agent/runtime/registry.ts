/**
 * Which runtime runs a provider. Native providers (completions, responses,
 * anthropic-messages) stay on the chat route's own agent; a CLI provider runs on the
 * runtime of its `cliAgent`, when one exists.
 */
import { supportsReasoningEffort } from "~/lib/reasoning-level";
import type { RuntimeCapabilities } from "~/lib/runtime-types";
import { antigravityRuntime } from "~/server/agent/cli/antigravity/runtime";
import { claudeRuntime } from "~/server/agent/cli/claude/runtime";
import { codexRuntime } from "~/server/agent/cli/codex/runtime";
import { opencodeRuntime } from "~/server/agent/cli/opencode/runtime";
import type { ProviderRow } from "~/server/agent/config";
import type { CliRuntime } from "./types";

const CLI_RUNTIMES: Record<string, CliRuntime> = { opencode: opencodeRuntime, antigravity: antigravityRuntime, codex: codexRuntime, claude: claudeRuntime };

type ProviderKind = Pick<ProviderRow, "apiStyle" | "cliAgent">;

export function cliRuntimeFor(provider: ProviderKind): CliRuntime | null {
  if (provider.apiStyle !== "cli" || !provider.cliAgent) return null;
  return CLI_RUNTIMES[provider.cliAgent] ?? null;
}

export function runtimeCapabilities(provider: ProviderKind): RuntimeCapabilities {
  const cli = cliRuntimeFor(provider);
  if (cli) return cli.capabilities;
  if (provider.apiStyle === "cli") return { reasoningEffort: false, modelOptions: false };
  return { reasoningEffort: supportsReasoningEffort(provider.apiStyle), modelOptions: false };
}
