/**
 * Reasoning effort per thread (M4 item 19): how the chosen level becomes provider options.
 *
 * The user picks low, medium or high; "default" (null) leaves the provider alone. Only
 * the API styles that have a reasoning control take the option: Anthropic Messages as
 * a thinking budget, OpenAI Responses as `reasoningEffort`. The chat-completions style
 * has no shared control, so the composer does not offer the choice there.
 */
import { supportsReasoningEffort, type ReasoningLevel } from "~/lib/reasoning-level";

/** Anthropic thinking budgets, in tokens. The API needs at least 1024. */
const ANTHROPIC_BUDGET: Record<ReasoningLevel, number> = { low: 2048, medium: 8192, high: 16384 };
const ANTHROPIC_MIN_BUDGET = 1024;
/** Room kept for the answer itself, so thinking can never take the whole output. */
const ANSWER_ROOM = 1024;

/**
 * Provider options for one turn, or undefined when nothing should be sent. A budget
 * too small to be useful is dropped rather than sent: the default then applies.
 */
export { parseReasoningLevel, supportsReasoningEffort, REASONING_LEVELS, type ReasoningLevel } from "~/lib/reasoning-level";

export function reasoningProviderOptions(input: {
  apiStyle: string | null | undefined;
  level: ReasoningLevel | null;
  maxOutputTokens: number;
}): Record<string, Record<string, unknown>> | undefined {
  if (!input.level || !supportsReasoningEffort(input.apiStyle)) return undefined;
  if (input.apiStyle === "responses") return { openai: { reasoningEffort: input.level } };
  const budget = Math.min(ANTHROPIC_BUDGET[input.level], input.maxOutputTokens - ANSWER_ROOM);
  if (budget < ANTHROPIC_MIN_BUDGET) return undefined;
  return { anthropic: { thinking: { type: "enabled", budgetTokens: budget } } };
}
