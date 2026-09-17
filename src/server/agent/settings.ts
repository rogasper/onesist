/**
 * Application-level preferences (FR-L7 and whatever comes next).
 *
 * A key → JSON value table, read through the typed helpers below. Validation
 * lives with the route that owns each key: this module stores what it is given,
 * because a settings layer that silently "fixes" values makes the UI lie about
 * what it saved.
 */
import { eq } from "drizzle-orm";
import { db } from "~/server/db/client";
import { appSettings } from "~/server/db/schema";
import { MAX_STEPS_DEFAULT, MAX_STEPS_MAX, MAX_STEPS_MIN } from "./types";

/** Every preference this app currently knows about, with its default. */
export const SETTING_DEFAULTS = {
  /** Agent turn limit (FR-L7). Clamped 5..500 in the UI *and* on write. */
  agentMaxSteps: MAX_STEPS_DEFAULT,
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

export function isSettingKey(key: string): key is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTING_DEFAULTS, key);
}

export function getSetting<K extends SettingKey>(key: K): (typeof SETTING_DEFAULTS)[K] {
  const row = db.select().from(appSettings).where(eq(appSettings.key, key)).get() as { value: string } | undefined;
  if (!row) return SETTING_DEFAULTS[key];
  try {
    const parsed = JSON.parse(row.value);
    return parsed == null ? SETTING_DEFAULTS[key] : (parsed as (typeof SETTING_DEFAULTS)[K]);
  } catch {
    // A corrupted row must not take a preference-dependent feature down with it.
    return SETTING_DEFAULTS[key];
  }
}

export function setSetting(key: SettingKey, value: unknown): void {
  const encoded = JSON.stringify(value);
  const existing = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
  const now = new Date().toISOString();
  if (existing) {
    db.update(appSettings).set({ value: encoded, updatedAt: now }).where(eq(appSettings.key, key)).run();
    return;
  }
  db.insert(appSettings).values({ key, value: encoded, updatedAt: now }).run();
}

/** All settings, defaults merged in — so a fresh install and an upgraded one
 *  return the same shape and the UI never has to know a key exists. */
export function getAllSettings(): Record<SettingKey, unknown> {
  const out = { ...SETTING_DEFAULTS } as Record<SettingKey, unknown>;
  for (const key of Object.keys(SETTING_DEFAULTS) as SettingKey[]) out[key] = getSetting(key);
  return out;
}

/** The same clamp the thread route uses, applied to the *default* for new
 *  threads. Two guards rather than one because the value comes from a request
 *  body: the ADR (D7.5) requires validation in the UI and the clamp in the
 *  backend as the source of truth. */
export function normalizeAgentMaxSteps(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : SETTING_DEFAULTS.agentMaxSteps;
  return Math.min(MAX_STEPS_MAX, Math.max(MAX_STEPS_MIN, n));
}
