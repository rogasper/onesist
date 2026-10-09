/**
 * Regression: Chrome is preferred, Edge is the Windows fallback, and a configured path wins.
 *
 *   bun test src/server/browser/locate.test.ts
 */
import { expect, test } from "bun:test";
import { browserCandidates, findBrowser } from "./locate";

test("on macOS Chrome is looked for first, then Edge", () => {
  const names = browserCandidates("darwin", {}).map((c) => c.name);
  expect(names).toEqual(["chrome", "edge", "chromium"]);
});

test("on Windows Edge is the fallback when Chrome is not installed", () => {
  const env = { ProgramFiles: "C:\\Program Files", LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local" };
  const onlyEdge = (p: string) => p.endsWith("msedge.exe");
  const found = findBrowser({ platform: "win32", env, exists: onlyEdge });
  expect(found?.name).toBe("edge");
});

test("a configured path is used when it exists, and nothing else is tried", () => {
  const found = findBrowser({ platform: "darwin", env: {}, override: "/opt/x/browser", exists: (p) => p === "/opt/x/browser" });
  expect(found?.path).toBe("/opt/x/browser");
  expect(findBrowser({ platform: "darwin", env: {}, override: "/nope", exists: () => false })).toBeNull();
});
