/**
 * Application preferences endpoint.
 *
 * Scope matters here: these are machine-wide defaults, not project settings
 * (project conventions live in the project workspace — see the composer actions
 * file and `<project>/.agents/`) and not provider settings (those are in
 * `llm_providers`). FR-L7's agent turn limit is the first inhabitant: it applies
 * to threads that do not exist yet, so it cannot live on a thread.
 */
import { json } from "../http/response";
import { Router } from "../http/router";
import { MAX_STEPS_MAX, MAX_STEPS_MIN } from "~/server/agent/types";
import { SETTING_DEFAULTS, getAllSettings, isSettingKey, normalizeAgentMaxSteps, setSetting } from "~/server/agent/settings";

export const router = new Router();

/** Public shape: the values plus the bounds the UI should enforce, so the limit
 *  is stated in one place instead of being duplicated in the form. */
function payload() {
  return {
    settings: getAllSettings(),
    bounds: {
      agentMaxSteps: { min: MAX_STEPS_MIN, max: MAX_STEPS_MAX, default: SETTING_DEFAULTS.agentMaxSteps },
    },
  };
}

router.get("settings", () => json(payload()));

router.put("settings", async (ctx) => {
  const body = await ctx.body();
  const applied: string[] = [];

  if (body.agentMaxSteps !== undefined) {
    if (typeof body.agentMaxSteps !== "number" || !Number.isFinite(body.agentMaxSteps)) {
      return json({ error: "agentMaxSteps harus berupa angka." }, 400);
    }
    // The clamp is the source of truth (ADR D7.5): the UI validates too, but a
    // hand-made request must not be able to store a limit that burns cost.
    setSetting("agentMaxSteps", normalizeAgentMaxSteps(body.agentMaxSteps));
    applied.push("agentMaxSteps");
  }

  const unknown = Object.keys(body).filter((k) => !isSettingKey(k));
  if (unknown.length && !applied.length) {
    return json({ error: `Preferensi tidak dikenal: ${unknown.join(", ")}.` }, 400);
  }

  return json({ ...payload(), applied, ignored: unknown });
});
