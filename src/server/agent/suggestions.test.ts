/**
 * Regression: the empty chat suggests the next step the project's files point to.
 *
 *   bun test src/server/agent/suggestions.test.ts
 */
import { expect, test } from "bun:test";
import { suggestionsFor, type ProjectState } from "./suggestions";

const empty: ProjectState = { fsdCount: 0, endpointCount: 0, erdTableCount: 0, taskCount: 0, testCaseCount: 0, fsdNewerThanSpec: false };

test("with no FSD yet, the chat offers to look at what exists", () => {
  expect(suggestionsFor(empty).map((s) => s.label)).toEqual(["Periksa isi project", "Ringkas project"]);
});

test("an FSD without a spec or ERD suggests building them", () => {
  const labels = suggestionsFor({ ...empty, fsdCount: 2 }).map((s) => s.label);
  expect(labels).toContain("Buat spec API dari FSD");
  expect(labels).toContain("Buat ERD dari FSD");
  expect(labels).toContain("Pecah FSD jadi task");
});

test("a spec without test cases suggests SIT; a spec older than the FSD suggests a check", () => {
  const labels = suggestionsFor({ ...empty, fsdCount: 1, endpointCount: 5, erdTableCount: 3, taskCount: 1, fsdNewerThanSpec: true }).map((s) => s.label);
  expect(labels).toContain("Susun SIT");
  expect(labels).toContain("Periksa konsistensi");
});

test("at most four suggestions, and the last one is always the summary", () => {
  const list = suggestionsFor({ ...empty, fsdCount: 1, endpointCount: 2, erdTableCount: 2, fsdNewerThanSpec: true });
  expect(list.length).toBe(4);
  expect(list.at(-1)?.label).toBe("Ringkas project");
});
