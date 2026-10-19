/**
 * Page copy rules: execution is only ever "coming soon", and the agent list is the shipped one.
 *
 *   cd landing && bun test src/content.test.ts
 */
import { expect, test } from "bun:test";
import { AGENT_POINTS, AGENTS, API_PROVIDERS, AUDIENCE, PIPELINE, SLIDES, WORKSPACE_POINTS } from "./content";

test("execution is in the pipeline only as a coming-soon step", () => {
  expect(PIPELINE.at(-1)).toMatchObject({ step: "Execution", soon: true });
  expect(PIPELINE.filter((p) => p.soon)).toHaveLength(1);
});
test("no other copy mentions execution", () => {
  const rest = JSON.stringify([AUDIENCE, PIPELINE.slice(0, -1), AGENTS, API_PROVIDERS, AGENT_POINTS, WORKSPACE_POINTS, SLIDES]);
  expect(rest).not.toMatch(/execut/i);
});
test("the five agents, in order", () => expect(AGENTS).toEqual(["Claude Code", "Codex", "Pi", "Antigravity", "OpenCode"]));
