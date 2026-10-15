/**
 * Runtime types shared by the server and the UI (plan D, "Antarmuka AgentRuntime").
 * Kept free of server imports so the composer and the settings can use them.
 */

/** Which composer controls a provider gets. Controls a runtime lacks are hidden, not forced. */
export interface RuntimeCapabilities {
  /** Rendah/Sedang/Tinggi in the model picker (native Anthropic Messages and Responses). */
  reasoningEffort: boolean;
  /** Per-model options from the runtime itself (OpenCode variants) in the model picker. */
  modelOptions: boolean;
}

export type RuntimeState = "ready" | "not_installed" | "not_ready" | "error";

export interface RuntimeStatus {
  state: RuntimeState;
  version: string | null;
  /** Indonesian; shown as-is in Settings and the model picker. */
  message: string;
}

export interface ModelOptionChoice {
  value: string;
  label: string;
}

export interface ModelOptionDescriptor {
  /** Key in the thread's model options, e.g. "variant". */
  id: string;
  label: string;
  type: "select";
  choices: ModelOptionChoice[];
}

/** A thread's chosen model options, keyed by descriptor id. */
export type ModelOptions = Record<string, string>;
