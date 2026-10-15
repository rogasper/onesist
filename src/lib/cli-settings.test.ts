/**
 * The settings a CLI provider's form shows, per driver.
 *
 *   bun test src/lib/cli-settings.test.ts
 */
import { expect, test } from "bun:test";
import { cliSettingFields } from "./cli-settings";

test("OpenCode asks for its binary, an optional server URL, and that server's password", () => {
  const fields = cliSettingFields("opencode");
  expect(fields.map((f) => f.column)).toEqual(["cliPath", "endpoint", "apiKey"]);
  expect(fields.find((f) => f.column === "apiKey")?.secret).toBe(true);
  expect(fields.every((f) => f.label && f.hint)).toBe(true);
});

test("other CLI agents only ask for the binary", () => {
  expect(cliSettingFields("claude").map((f) => f.column)).toEqual(["cliPath"]);
  expect(cliSettingFields(null).map((f) => f.column)).toEqual(["cliPath"]);
});
