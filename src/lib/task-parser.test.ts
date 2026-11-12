/**
 * #65: the body a human edits must not repeat the card's own heading and
 * fields, and the `- Story Points: 3` bullet that cards actually use must be
 * read (it used to import as null).
 *
 *   bun test src/lib/task-parser.test.ts
 */
import { afterAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { rewriteTaskSection, scanAllTaskFiles, stripTaskHeading } from "./task-parser";

const dirs: string[] = [];

afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

function project(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-parser-"));
  dirs.push(root);
  for (const [rel, contents] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, contents);
  }
  return root;
}

test("a card's body excludes its heading and the rows that duplicate fields", () => {
  const section = [
    "## Task AP-1: Buat endpoint login",
    "",
    "| Story Point | 3 |",
    "| Developer | Rina |",
    "",
    "Deskripsi endpoint login.",
    "",
    "- Story Points: 3",
    "- Catatan lain",
  ].join("\n");

  expect(stripTaskHeading(section)).toBe("Deskripsi endpoint login.\n\n- Catatan lain");
});

test("content that starts with its own heading is left alone", () => {
  expect(stripTaskHeading("## Notes\n\nisi")).toBe("## Notes\n\nisi");
  expect(stripTaskHeading("Isi tanpa heading")).toBe("Isi tanpa heading");
});

test("the exact heading line is dropped when the parser knows it", () => {
  expect(stripTaskHeading("### T1 — Ambil data\n\nIsi.", "### T1 — Ambil data")).toBe("Isi.");
});

test("scanAllTaskFiles reads the Story Points bullet and stores a clean body", () => {
  const root = project({
    "output/task/task_api.md": "# API\n\n## Task AP-1: Buat endpoint login\n\n- Story Points: 3\n\nDeskripsi endpoint login.\n",
  });

  const { tasks } = scanAllTaskFiles(root);
  expect(tasks).toHaveLength(1);
  expect(tasks[0]).toMatchObject({
    code: "api-AP-1",
    title: "Buat endpoint login",
    storyPoints: 3,
    contentMd: "Deskripsi endpoint login.",
  });
});

test("the H1 fallback also stores a body without the heading", () => {
  const root = project({
    "output/task/task_solo.md": "# Task: Satu task saja\n\n- Story Points: 2\n\nIsi solo.\n",
  });

  const { tasks } = scanAllTaskFiles(root);
  expect(tasks).toHaveLength(1);
  expect(tasks[0]).toMatchObject({ title: "Satu task saja", storyPoints: 2, contentMd: "Isi solo." });
});

test("rewriting a card touches only its own section", () => {
  const file = [
    "# API",
    "",
    "## Task AP-1: Buat endpoint login",
    "",
    "- Story Points: 3",
    "",
    "Deskripsi lama.",
    "",
    "## Task AP-2: Buat logout",
    "",
    "Deskripsi logout.",
    "",
  ].join("\n");

  const next = rewriteTaskSection(file, "task_api.md", "api-AP-1", {
    title: "Buat endpoint login (baru)",
    body: "Isi baru.\n\n### Tujuan\nSelesai.",
    storyPoints: 5,
    assignee: null,
  });

  expect(next).not.toBeNull();
  expect(next!).toContain("## Task AP-1: Buat endpoint login (baru)");
  expect(next!).toContain("- Story Points: 5");
  expect(next!).toContain("Isi baru.");
  expect(next!).not.toContain("Deskripsi lama.");
  // Everything outside that section is byte-identical.
  expect(next!.startsWith("# API")).toBe(true);
  expect(next!).toContain("## Task AP-2: Buat logout");
  expect(next!).toContain("Deskripsi logout.");
  // The next card's heading is not glued to the paragraph above it.
  expect(next!).toContain("Selesai.\n\n## Task AP-2");
});

test("a card edited in the app parses back from its file unchanged", () => {
  const root = project({
    "output/task/task_rt.md": "# RT\n\n## Task RT-1: Judul lama\n\n- Story Points: 3\n\nIsi lama.\n",
  });
  const abs = path.join(root, "output/task/task_rt.md");
  const edited = rewriteTaskSection(fs.readFileSync(abs, "utf8"), "task_rt.md", "RT-1", {
    title: "Judul baru",
    body: "Isi baru dari editor.\n\n| Field | Detail |\n|---|---|\n| Priority | High |",
    storyPoints: 3.5,
    assignee: null,
  });
  expect(edited).not.toBeNull();
  fs.writeFileSync(abs, edited!);

  const { tasks } = scanAllTaskFiles(root);
  expect(tasks).toHaveLength(1);
  expect(tasks[0]).toMatchObject({
    code: "RT-1",
    title: "Judul baru",
    storyPoints: 3.5,
    contentMd: "Isi baru dari editor.\n\n| Field | Detail |\n|---|---|\n| Priority | High |",
  });
});

test("a heading the canonical patterns do not cover is found by its ID", () => {
  // Agent-written shape: "# P3M22-T2 | Judul" (pipe separator, H1).
  const file = [
    "# P3M22-T2 | Registrasi Step 1",
    "",
    "**SP:** 3.5",
    "",
    "Isi lama.",
    "",
    "# P3M22-T3 | Task lain",
    "",
    "Isi lain.",
    "",
  ].join("\n");

  const next = rewriteTaskSection(
    file,
    "task_registrasi.md",
    "registrasi-P3M22-T2",
    { title: "Registrasi Step 1 (baru)", body: "Isi baru.", storyPoints: 5, assignee: null },
    "Registrasi Step 1",
  );

  expect(next).not.toBeNull();
  expect(next!).toContain("# P3M22-T2 | Registrasi Step 1 (baru)");
  expect(next!).toContain("Isi baru.");
  expect(next!).not.toContain("Isi lama.");
  expect(next!).toContain("# P3M22-T3 | Task lain");
  expect(next!).toContain("Isi lain.");
});
