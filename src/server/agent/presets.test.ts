/**
 * Presets that are not offered yet: they show in the picker as "segera hadir" and cannot be
 * saved as a provider.
 *
 *   bun test src/server/agent/presets.test.ts
 */
import { expect, test } from "bun:test";
import { getPreset, isPresetComingSoon, PROVIDER_PRESETS } from "./presets";

test("Codex and Pi are coming soon; the others are offered", () => {
  expect(getPreset("cli-codex")?.comingSoon).toBe(true);
  expect(getPreset("cli-pi")?.comingSoon).toBe(true);
  expect(isPresetComingSoon("cli-codex")).toBe(true);
  expect(isPresetComingSoon("cli-pi")).toBe(true);
  expect(isPresetComingSoon("cli-antigravity")).toBe(false);
  expect(isPresetComingSoon("cli-opencode")).toBe(false);
  expect(isPresetComingSoon("tidak-ada")).toBe(false);
  expect(PROVIDER_PRESETS.filter((p) => p.comingSoon).map((p) => p.id).sort()).toEqual(["cli-codex", "cli-pi"]);
});
