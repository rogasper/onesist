/**
 * Regression tests for project file search: result parity, ignored directories,
 * file-read cost, index invalidation, and 2,000-file latency / event-loop responsiveness.
 *
 *   bun test src/lib/file-router.test.ts
 */
import { afterAll, beforeEach, describe, expect, spyOn, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  IGNORED_DIRS,
  copyFile,
  deleteFile,
  invalidateFileSearchIndex,
  moveFile,
  renameFile,
  searchProjectFiles,
  searchProjectFilesAsync,
  writeFile,
} from "./file-router";

const tempDirs: string[] = [];

function makeTempRoot(prefix = "onesist-file-router-"): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function writeTestFile(root: string, rel: string, content: string, mtimeSec?: number): string {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf-8");
  if (mtimeSec !== undefined) {
    fs.utimesSync(abs, mtimeSec, mtimeSec);
  }
  return abs;
}

afterAll(() => {
  invalidateFileSearchIndex();
  for (const dir of tempDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
});

beforeEach(() => {
  invalidateFileSearchIndex();
});

describe("file-router search parity and ordering", () => {
  test("filename matching ranks exact > startsWith > name contains > path contains, and ties break by modifiedAt desc", async () => {
    const root = makeTempRoot();
    writeTestFile(root, "docs/spec/guide.md", "path match only", 1000);
    writeTestFile(root, "output/my_spec_old.md", "name contains older", 2000);
    writeTestFile(root, "output/my_spec_new.md", "name contains newer", 3000);
    writeTestFile(root, "output/spec_users.md", "name startsWith", 1500);
    writeTestFile(root, "output/spec", "exact filename", 1200);

    const syncRes = searchProjectFiles(root, "spec", "filename", 40);
    const asyncRes = await searchProjectFilesAsync(root, "spec", "filename", 40);

    expect(syncRes.map((r) => r.path)).toEqual([
      "output/spec",
      "output/spec_users.md",
      "output/my_spec_new.md",
      "output/my_spec_old.md",
      "docs/spec/guide.md",
    ]);
    expect(asyncRes.map((r) => r.path)).toEqual(syncRes.map((r) => r.path));
  });

  test("content search extracts up to 3 line numbers and 140-char trimmed previews, ignoring regex metacharacters", async () => {
    const root = makeTempRoot();
    const longLine = "   prefix token[a.b]+? " + "x".repeat(200);
    writeTestFile(
      root,
      "output/specs/api.md",
      [
        "line 1 unrelated",
        "  first token[a.b]+? hit  ",
        "line 3 unrelated",
        longLine,
        "third TOKEN[A.B]+? hit",
        "fourth token[a.b]+? ignored",
      ].join("\n"),
      2000,
    );
    writeTestFile(root, "output/tasks/older.ts", "const x = 'token[a.b]+?';\r\n", 1000);

    const syncRes = searchProjectFiles(root, "token[a.b]+?", "content", 40);
    const asyncRes = await searchProjectFilesAsync(root, "token[a.b]+?", "content", 40);

    expect(syncRes).toHaveLength(2);
    expect(syncRes[0].path).toBe("output/specs/api.md");
    expect(syncRes[0].matchType).toBe("content");
    expect(syncRes[0].matches).toEqual([
      { line: 2, preview: "first token[a.b]+? hit" },
      { line: 4, preview: longLine.trim().slice(0, 140) },
      { line: 5, preview: "third TOKEN[A.B]+? hit" },
    ]);
    expect(syncRes[1].path).toBe("output/tasks/older.ts");
    expect(syncRes[1].matches).toEqual([{ line: 1, preview: "const x = 'token[a.b]+?';" }]);
    expect(asyncRes).toEqual(syncRes);
  });

  test("all mode places filename matches first, deduplicates, and fills remainder with newest content matches", async () => {
    const root = makeTempRoot();
    writeTestFile(root, "output/alpha_doc.md", "alpha inside filename-matched file", 1000);
    writeTestFile(root, "output/notes_old.md", "contains alpha keyword", 2000);
    writeTestFile(root, "output/notes_new.md", "also contains alpha keyword", 3000);

    const syncRes = searchProjectFiles(root, "alpha", "all", 40);
    const asyncRes = await searchProjectFilesAsync(root, "alpha", "all", 40);

    expect(syncRes.map((r) => ({ path: r.path, matchType: r.matchType }))).toEqual([
      { path: "output/alpha_doc.md", matchType: "filename" },
      { path: "output/notes_new.md", matchType: "content" },
      { path: "output/notes_old.md", matchType: "content" },
    ]);
    expect(asyncRes).toEqual(syncRes);
  });
});

describe("IGNORED_DIRS filtering", () => {
  test("skips build, vendor, .venv, venv, __pycache__, out, .output, and other build/cache dirs", async () => {
    const root = makeTempRoot();
    const skippedDirs = [
      "build",
      "vendor",
      ".venv",
      "venv",
      "__pycache__",
      "out",
      ".output",
      ".svelte-kit",
      ".nuxt",
      "Pods",
      ".idea",
      "node_modules",
      ".git",
      "dist",
    ];
    for (const dir of skippedDirs) {
      expect(IGNORED_DIRS.has(dir)).toBe(true);
      writeTestFile(root, `${dir}/needle_match.md`, "needle_content_token");
    }
    writeTestFile(root, "output/specs/needle_real.md", "needle_content_token");
    writeTestFile(root, ".env", "SECRET=needle_content_token");

    const allRes = await searchProjectFilesAsync(root, "needle", "all", 40);
    expect(allRes.map((r) => r.path)).toEqual(["output/specs/needle_real.md"]);

    const envRes = await searchProjectFilesAsync(root, ".env", "filename", 40);
    expect(envRes.map((r) => r.path)).toEqual([".env"]);
  });
});

describe("search cost regression (file reads & walks)", () => {
  test("empty query reads 0 file contents in sync and async modes", async () => {
    const root = makeTempRoot();
    for (let i = 0; i < 30; i++) {
      writeTestFile(root, `output/specs/doc_${i}.md`, `body ${i}`, 1000 + i);
    }

    const readPaths: string[] = [];
    const syncSpy = spyOn(fs, "readFileSync");
    const asyncSpy = spyOn(fs.promises, "readFile");
    try {
      const syncAll = searchProjectFiles(root, "", "all", 10, { onFileRead: (p) => readPaths.push(p) });
      const syncName = searchProjectFiles(root, "   ", "filename", 10, { onFileRead: (p) => readPaths.push(p) });
      const syncContent = searchProjectFiles(root, "", "content", 10, { onFileRead: (p) => readPaths.push(p) });
      const asyncAll = await searchProjectFilesAsync(root, "", "all", 10, { onFileRead: (p) => readPaths.push(p) });
      const asyncName = await searchProjectFilesAsync(root, "", "filename", 10, { onFileRead: (p) => readPaths.push(p) });
      const asyncContent = await searchProjectFilesAsync(root, "", "content", 10, { onFileRead: (p) => readPaths.push(p) });

      expect(syncAll).toHaveLength(10);
      expect(syncName).toHaveLength(10);
      expect(syncContent).toHaveLength(0);
      expect(asyncAll).toHaveLength(10);
      expect(asyncName).toHaveLength(10);
      expect(asyncContent).toHaveLength(0);
      expect(readPaths).toHaveLength(0);
      expect(syncSpy).not.toHaveBeenCalled();
      expect(asyncSpy).not.toHaveBeenCalled();
    } finally {
      syncSpy.mockRestore();
      asyncSpy.mockRestore();
    }
  });

  test("mode=all skips reading contents of files whose filename already matched", async () => {
    const root = makeTempRoot();
    for (let i = 0; i < 60; i++) {
      writeTestFile(root, `output/specs/spec_${i}.md`, `spec content ${i}`, 1000 + i);
    }
    for (let i = 0; i < 10; i++) {
      writeTestFile(root, `output/tasks/other_${i}.md`, `unrelated body ${i}`, 2000 + i);
    }

    // 60 filename matches >= limit 40 -> 0 content reads at all
    const readsWhenFull: string[] = [];
    const resFull = await searchProjectFilesAsync(root, "spec", "all", 40, {
      onFileRead: (p) => readsWhenFull.push(p),
    });
    expect(resFull).toHaveLength(40);
    expect(readsWhenFull).toHaveLength(0);

    // Partial filename matches (5) with limit 40 -> reads only the 10 non-matching text files, never the 5 matched ones
    invalidateFileSearchIndex(root);
    const root2 = makeTempRoot();
    for (let i = 0; i < 5; i++) {
      writeTestFile(root2, `output/specs/special_${i}.md`, "special", 3000 + i);
    }
    for (let i = 0; i < 10; i++) {
      writeTestFile(root2, `output/tasks/task_${i}.md`, "no match here", 2000 + i);
    }
    const readsPartial: string[] = [];
    const resPartial = await searchProjectFilesAsync(root2, "special", "all", 40, {
      onFileRead: (p) => readsPartial.push(path.relative(root2, p)),
    });
    expect(resPartial).toHaveLength(5);
    expect(readsPartial).toHaveLength(10);
    expect(readsPartial.every((p) => !p.includes("special_"))).toBe(true);
  });

  test("early exit stops reading once limit matches are found in modifiedAt order", async () => {
    const root = makeTempRoot();
    for (let i = 0; i < 200; i++) {
      writeTestFile(root, `output/notes/note_${i}.md`, `common_token line ${i}`, 1000 + i);
    }

    const syncReads: string[] = [];
    const syncRes = searchProjectFiles(root, "common_token", "content", 15, {
      onFileRead: (p) => syncReads.push(p),
    });
    expect(syncRes).toHaveLength(15);
    expect(syncReads).toHaveLength(15);
    expect(syncRes[0].path).toBe("output/notes/note_199.md");
    expect(syncRes[14].path).toBe("output/notes/note_185.md");

    invalidateFileSearchIndex(root);
    const asyncReads: string[] = [];
    const asyncRes = await searchProjectFilesAsync(root, "common_token", "content", 15, {
      onFileRead: (p) => asyncReads.push(p),
    });
    expect(asyncRes).toHaveLength(15);
    // Async pool reads at most limit + concurrency-1 files (never all 200)
    expect(asyncReads.length).toBeLessThanOrEqual(31);
    expect(asyncRes.map((r) => r.path)).toEqual(syncRes.map((r) => r.path));
  });

  test("index cache avoids re-walking on repeated searches and invalidates on file mutations", async () => {
    const root = makeTempRoot();
    writeTestFile(root, "output/specs/initial.md", "hello world", 1000);

    const readdirSpy = spyOn(fs.promises, "readdir");
    try {
      const first = await searchProjectFilesAsync(root, "initial", "filename", 40);
      expect(first.map((r) => r.path)).toEqual(["output/specs/initial.md"]);
      const firstWalkCalls = readdirSpy.mock.calls.length;
      expect(firstWalkCalls).toBeGreaterThan(0);

      readdirSpy.mockClear();
      const second = await searchProjectFilesAsync(root, "initial", "filename", 40);
      expect(second.map((r) => r.path)).toEqual(["output/specs/initial.md"]);
      expect(readdirSpy).not.toHaveBeenCalled();

      // Mutations through file-router invalidate the cache immediately
      expect(writeFile(root, "output/specs/added.md", "new file")).toBe(true);
      const afterWrite = await searchProjectFilesAsync(root, "added", "filename", 40);
      expect(afterWrite.map((r) => r.path)).toEqual(["output/specs/added.md"]);

      expect(renameFile(root, "output/specs/added.md", "renamed.md")).toBe(true);
      const afterRename = await searchProjectFilesAsync(root, "renamed", "filename", 40);
      expect(afterRename.map((r) => r.path)).toEqual(["output/specs/renamed.md"]);

      const copied = copyFile(root, "output/specs/renamed.md", "output/archive");
      expect(copied).toBe("output/archive/renamed.md");
      expect((await searchProjectFilesAsync(root, "archive/renamed", "filename", 40)).map((r) => r.path)).toEqual([
        "output/archive/renamed.md",
      ]);

      const moved = moveFile(root, "output/archive/renamed.md", "output/moved");
      expect(moved).toBe("output/moved/renamed.md");
      expect((await searchProjectFilesAsync(root, "moved/renamed", "filename", 40)).map((r) => r.path)).toEqual([
        "output/moved/renamed.md",
      ]);

      expect(deleteFile(root, "output/moved/renamed.md")).toBe(true);
      expect(await searchProjectFilesAsync(root, "moved/renamed", "filename", 40)).toEqual([]);
    } finally {
      readdirSpy.mockRestore();
    }
  });

  test("AbortSignal stops async content scanning", async () => {
    const root = makeTempRoot();
    for (let i = 0; i < 80; i++) {
      writeTestFile(root, `output/specs/f_${i}.md`, "some text", 1000 + i);
    }
    const controller = new AbortController();
    let reads = 0;
    const res = await searchProjectFilesAsync(root, "no_match_zzz", "content", 40, {
      signal: controller.signal,
      onFileRead: () => {
        reads++;
        if (reads >= 5) controller.abort();
      },
    });
    expect(res).toEqual([]);
    expect(reads).toBeLessThan(40);
  });
});

describe("2,000-file latency and event-loop responsiveness", () => {
  test("typing queries on a 2,000-file project keeps p50 < 50 ms and max event-loop stall < 50 ms", async () => {
    const root = makeTempRoot("onesist-search-2k-");
    const line = `export const v_k = "lorem ipsum dolor sit amet consectetur adipiscing elit";\n`;
    const bodyChunk = line.repeat(200); // ~13.6 KB/file (~27 MB total across 2,000 files)

    for (let i = 0; i < 2000; i++) {
      const dir = ["output/specs", "output/tasks", "output/app/src"][i % 3];
      const ext = i % 3 === 0 ? "md" : "ts";
      const abs = path.join(root, dir, `f_${i}.${ext}`);
      if (i < 3) fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, `// file ${i}\n${bodyChunk}`);
    }

    // Measure event-loop delay across warm-up (index build) + realistic modal query sequence.
    let maxLoopLagMs = 0;
    let lastTick = performance.now();
    const probe = setInterval(() => {
      const now = performance.now();
      const lag = now - lastTick - 5;
      if (lag > maxLoopLagMs) maxLoopLagMs = lag;
      lastTick = now;
    }, 5);

    try {
      // Initial modal open (empty query, builds index asynchronously with 0 content reads)
      let emptyReads = 0;
      const openResults = await searchProjectFilesAsync(root, "", "filename", 40, {
        onFileRead: () => {
          emptyReads++;
        },
      });
      expect(openResults).toHaveLength(40);
      expect(emptyReads).toBe(0);

      const timings: number[] = [];
      for (const q of ["s", "sp", "spe", "spec", "spec_", "spec_a"]) {
        const t0 = performance.now();
        await searchProjectFilesAsync(root, q, "all", 40);
        timings.push(performance.now() - t0);
      }

      const sorted = [...timings].sort((a, b) => a - b);
      const p50 = sorted[Math.floor(sorted.length / 2)];
      expect(p50).toBeLessThan(50);
      expect(maxLoopLagMs).toBeLessThan(50);
    } finally {
      clearInterval(probe);
    }
  });
});
