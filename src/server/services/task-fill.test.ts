import { expect, test } from "bun:test";
import { parseFillProposal, validateFillProposal } from "./task-fill";

const block = (json: string) => "Hasil analisis.\n\n```onesist-fill\n" + json + "\n```\n";

test("the last onesist-fill block is the proposal", () => {
  const text = block('{"repos":["."],"filesScope":["a.ts"],"acceptanceCriteria":["x"]}') + block('{"repos":[],"filesScope":["b.ts"],"acceptanceCriteria":["y"]}');
  const res = parseFillProposal(text);
  expect(res.ok).toBe(true);
  if (res.ok) expect(res.proposal.filesScope).toEqual(["b.ts"]);
});

test("text without a block, or a broken block, is refused", () => {
  expect(parseFillProposal("tidak ada blok").ok).toBe(false);
  expect(parseFillProposal(block("{ rusak")).ok).toBe(false);
  expect(parseFillProposal(block("[1,2]")).ok).toBe(false);
});

test("validation drops unknown repos, unsafe paths, and blank criteria, and reports the repos", () => {
  const res = validateFillProposal(
    {
      repos: ["input/code/api", "input/code/gone"],
      filesScope: ["input/code/api/src/a.ts", "../secret", "/etc/passwd", "", 3 as unknown as string],
      acceptanceCriteria: ["Login memakai OTP", "   "],
    },
    ["input/code/api"],
  );
  expect(res.proposal).toEqual({
    repos: ["input/code/api"],
    filesScope: ["input/code/api/src/a.ts"],
    acceptanceCriteria: ["Login memakai OTP"],
  });
  expect(res.dropped).toEqual(["input/code/gone"]);
});
