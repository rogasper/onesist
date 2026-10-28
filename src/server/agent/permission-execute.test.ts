import { expect, test } from "bun:test";
import { mutatingAllowed, shellAllowed } from "./types";

test("execute allows shell and writes, like ask", () => {
  expect(shellAllowed("execute")).toBe(true);
  expect(mutatingAllowed("execute")).toBe(true);
  expect(shellAllowed("readonly")).toBe(false);
  expect(mutatingAllowed("readonly")).toBe(false);
});
