/**
 * Wiring guard for the Global Settings page. The tabs and panels are ordinary
 * React, so nothing to unit-test; this file checks that the route exists, all
 * four tabs are present, the sidebar links to it and the BYOK surface can
 * actually render inline — the seams that could quietly regress.
 *
 *   bun test src/routes/-settings-wiring.test.ts
 */
import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const settingsRoute = fs.readFileSync(path.join(import.meta.dir, "settings.tsx"), "utf-8");
const rootRoute = fs.readFileSync(path.join(import.meta.dir, "__root.tsx"), "utf-8");
const providerSettings = fs.readFileSync(
  path.join(import.meta.dir, "../components/providers/ProviderSettings.tsx"),
  "utf-8",
);

test("/settings is a real route", () => {
  expect(settingsRoute).toContain('createFileRoute("/settings")');
});

test("the page carries all four tabs", () => {
  for (const id of ["models", "mcp", "cli", "appearance"]) {
    expect(settingsRoute).toContain(`"${id}"`);
  }
});

test("the sidebar links to /settings", () => {
  expect(rootRoute).toContain('to: "/settings"');
});

test("ProviderSettings can render inline (no overlay for the page)", () => {
  expect(providerSettings).toContain('variant === "inline"');
});
