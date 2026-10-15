/**
 * A thread's model options (plan D, "ModelSelection … options[]"): which variant of the
 * chosen model it runs on, and later other per-model choices. Stored as a small JSON
 * object on the thread. Shared by the server (validation, storage) and the composer.
 */
import type { ModelOptionDescriptor, ModelOptions } from "~/lib/runtime-types";

const KEY = /^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/;
const MAX_VALUE = 64;
const MAX_KEYS = 8;

export function parseModelOptions(raw: unknown): ModelOptions {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: ModelOptions = {};
  for (const [key, v] of Object.entries(value).slice(0, MAX_KEYS)) {
    if (!KEY.test(key) || typeof v !== "string") continue;
    const trimmed = v.trim();
    if (trimmed && trimmed.length <= MAX_VALUE) out[key] = trimmed;
  }
  return out;
}

export function serializeModelOptions(options: ModelOptions): string | null {
  return Object.keys(options).length ? JSON.stringify(options) : null;
}

/**
 * The stored options after a thread update, or undefined to leave them alone. Options
 * sent with the update win. A change of provider or model without options clears them:
 * a variant belongs to one model, and OpenCode refuses a variant the new model lacks.
 */
export function nextModelOptionsJson(body: Record<string, unknown>, modelChanged: boolean): string | null | undefined {
  if (body.modelOptions !== undefined) return serializeModelOptions(parseModelOptions(body.modelOptions));
  if (modelChanged) return null;
  return undefined;
}

/** One option set (or removed with null), the others kept. */
export function withModelOption(options: ModelOptions, id: string, value: string | null): ModelOptions {
  const next = { ...options };
  if (value === null) delete next[id];
  else next[id] = value;
  return next;
}

/** The stored value of one option when the model still offers it; null = the default. */
export function activeChoice(descriptor: ModelOptionDescriptor, options: ModelOptions): string | null {
  const value = options[descriptor.id];
  return value && descriptor.choices.some((c) => c.value === value) ? value : null;
}
