import { expect, test } from "bun:test";
import { outsideScope } from "./file-scope";

test("a file is inside the scope when it is named or sits under a named folder", () => {
  const scope = ["input/code/api/src/auth.ts", "input/code/api/src/routes"];
  expect(outsideScope(["input/code/api/src/auth.ts"], scope)).toEqual([]);
  expect(outsideScope(["input/code/api/src/routes/login.ts"], scope)).toEqual([]);
  expect(outsideScope(["input/code/api/src/authz.ts"], scope)).toEqual(["input/code/api/src/authz.ts"]);
  expect(outsideScope(["input/code/api/README.md"], scope)).toEqual(["input/code/api/README.md"]);
});

test("an empty scope puts every file outside it", () => {
  expect(outsideScope(["a.ts"], [])).toEqual(["a.ts"]);
});
