/**
 * Reasoning effort, shared by the server (which sends it to the provider) and the
 * composer (which offers it). Null means the provider's own default.
 */
export const REASONING_LEVELS = ["low", "medium", "high"] as const;
export type ReasoningLevel = (typeof REASONING_LEVELS)[number];

/** A stored or submitted value: a known level, or null for the default. */
export function parseReasoningLevel(value: unknown): ReasoningLevel | null {
  return typeof value === "string" && (REASONING_LEVELS as readonly string[]).includes(value) ? (value as ReasoningLevel) : null;
}

/** Only these API styles have a reasoning control. Chat-completions has none shared. */
export function supportsReasoningEffort(apiStyle: string | null | undefined): boolean {
  return apiStyle === "anthropic-messages" || apiStyle === "responses";
}
