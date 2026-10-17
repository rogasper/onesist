/**
 * The path a pane window opens: the bare pane route, with the project id encoded.
 *
 *   bun test src/lib/window.test.ts
 */
import { expect, test } from "bun:test";
import { paneWindowPath } from "./window";

test("a pane window opens the bare pane route for that project and tab", () => {
  expect(paneWindowPath("1731f89e-ac8e-4d25-88fe-a1baa9fc5efa", "erd")).toBe("/pane/1731f89e-ac8e-4d25-88fe-a1baa9fc5efa/erd");
  expect(paneWindowPath("a b/../c", "fsd")).toBe("/pane/a%20b%2F..%2Fc/fsd");
});
