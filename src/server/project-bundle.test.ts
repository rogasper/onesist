import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "./db/schema";
import { exportProjectBundle, importProjectBundle } from "./project-bundle";

let sqlite: Database;
let db: any;
let tmp: string;
let source: string;
let bundle: ArrayBuffer;

beforeAll(async () => {
  sqlite = new Database(":memory:");
  db = drizzle(sqlite, { schema });
  sqlite.run("PRAGMA foreign_keys = ON");
  await migrate(db, { migrationsFolder: path.resolve(import.meta.dir, "db/migrations") });

  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-bundle-"));
  source = path.join(tmp, "source");
  fs.mkdirSync(path.join(source, "input/fsd"), { recursive: true });
  fs.mkdirSync(path.join(source, "output/erd"), { recursive: true });
  fs.mkdirSync(path.join(source, "node_modules/pkg"), { recursive: true });
  fs.mkdirSync(path.join(source, "dist"), { recursive: true });
  fs.writeFileSync(path.join(source, "input/fsd/spec.md"), "# Spec");
  fs.writeFileSync(path.join(source, "output/erd/erd.dbml"), "Table users {\n  id int\n}");
  fs.writeFileSync(path.join(source, "node_modules/pkg/index.js"), "nope");
  fs.writeFileSync(path.join(source, "dist/out.js"), "nope");
  fs.writeFileSync(path.join(source, ".env"), "SECRET=1");

  db.insert(schema.projects).values({
    id: "p1",
    name: "Demo",
    rootPath: source,
    defaultAgent: "opencode",
    skillsStatus: "ready",
  }).run();
  db.insert(schema.erds).values({ id: "e1", projectId: "p1", name: "ERD", dbmlContent: "Table users { id int }" }).run();
  db.insert(schema.erdSnapshots).values({ id: "es1", erdId: "e1", dbmlContent: "Table users { id int }" }).run();
  db.insert(schema.apiSpecs).values({ id: "s1", projectId: "p1", name: "Spec", markdownContent: "# API" }).run();
  db.insert(schema.apiSnapshots).values({ id: "as1", specId: "s1", markdownContent: "# API" }).run();
  db.insert(schema.apiEndpoints).values({ id: "ae1", specId: "s1", method: "GET", path: "/users", module: "users" }).run();
  db.insert(schema.wikiPages).values({ id: "w1", projectId: "p1", title: "Home", slug: "home", contentMd: "# Home" }).run();
  db.insert(schema.wikiSnapshots).values({ id: "ws1", pageId: "w1", contentMd: "# Home" }).run();
  db.insert(schema.tasks).values({ id: "t1", projectId: "p1", title: "Build login", status: "todo" }).run();
  db.insert(schema.taskSnapshots).values({ id: "ts1", taskId: "t1", title: "Build login", status: "todo" }).run();
  db.insert(schema.fsdSessions).values({ id: "f1", projectId: "p1", mode: "manual", status: "ready" }).run();
  db.insert(schema.businessRequirements).values({ id: "br1", projectId: "p1", code: "BR-1", title: "Login" }).run();
  db.insert(schema.functionalRequirements).values({ id: "fr1", projectId: "p1", brId: "br1", code: "FR-1", title: "Login form" }).run();
  db.insert(schema.designSolutions).values({ id: "ds1", projectId: "p1", code: "DS-1", title: "Auth API" }).run();
  db.insert(schema.testCases).values({ id: "tc1", projectId: "p1", code: "TC-1", title: "Login works" }).run();
  db.insert(schema.rtmLinks).values({ id: "rl1", projectId: "p1", frId: "fr1", dsId: "ds1", tcId: "tc1" }).run();
  db.insert(schema.changeLog).values({
    id: "c1",
    projectId: "p1",
    entityType: "task",
    entityId: "t1",
    action: "updated",
    snapshotId: "ts1",
  }).run();
  db.insert(schema.projectExecSettings).values({
    projectId: "p1",
    taskMode: "execution",
    execProviderId: "prov1",
    execModel: "model-a",
    reviewerProviderId: "prov2",
    reviewerModel: "model-b",
    maxParallel: 3,
    integration: "pr",
  }).run();

  fs.mkdirSync(path.join(source, "input/uploads/th1"), { recursive: true });
  fs.writeFileSync(path.join(source, "input/uploads/th1/note.txt"), "attachment");
  db.insert(schema.chatThreads).values({
    id: "th1",
    projectId: "p1",
    title: "Login discussion",
    mode: "agent",
    providerId: "prov1",
    model: "model-a",
    cliSessionId: "ses_remote",
    modelOptionsJson: '{"variant":"high"}',
    workspaceStrategy: "worktree",
    workspaceRepo: ".",
    workspacePath: "/tmp/remote-worktree",
    workspaceBranch: "onesist/remote",
    queuePaused: true,
  }).run();
  db.insert(schema.chatThreads).values({
    id: "th2",
    projectId: "p1",
    title: "Fork of login",
    mode: "agent",
    relationshipToParent: "fork",
    parentThreadId: "th1",
    rootThreadId: "th1",
    forkedAtSeq: 2,
  }).run();
  db.insert(schema.chatMessages).values([
    {
      id: "m1",
      threadId: "th1",
      seq: 1,
      role: "user",
      contentJson: JSON.stringify([
        { type: "text", text: "Buat login" },
        { type: "file", path: "input/uploads/th1/note.txt", url: "data:text/plain;base64,AAAA", filename: "note.txt", mediaType: "text/plain" },
        { type: "image", url: "data:image/png;base64,AAAA" },
      ]),
    },
    {
      id: "m2",
      threadId: "th1",
      seq: 2,
      role: "assistant",
      contentJson: JSON.stringify([
        { type: "text", text: "Login dibuat" },
        { type: "reasoning", text: "thinking..." },
        { type: "tool-bash", state: "output-available" },
      ]),
      toolCallsJson: '[{"id":"tc1"}]',
      suggestionsJson: '["Lanjut buat login","Tambah test"]',
    },
    { id: "m3", threadId: "th1", seq: 3, role: "tool", contentJson: JSON.stringify([{ type: "text", text: "tool output" }]) },
    { id: "m4", threadId: "th1", seq: 4, role: "assistant", contentJson: null },
  ]).run();
  db.insert(schema.chatThreadFiles).values({
    id: "cf1",
    threadId: "th1",
    path: "input/uploads/th1/note.txt",
    route: "input/uploads/note.txt",
    op: "create",
    source: "tool",
    messageId: "m1",
    diffJson: '{"diff":"private"}',
  }).run();
  db.insert(schema.chatThreadReads).values({ id: "cr1", threadId: "th1", path: "input/uploads/th1/note.txt", hash: "abc" }).run();

  bundle = await exportProjectBundle(db, "p1");
});

afterAll(() => {
  sqlite.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("project bundle", () => {
  test("export includes files and project rows but not node_modules/env/dist", async () => {
    const zip = await JSZip.loadAsync(bundle);
    const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
    expect(manifest.formatVersion).toBe(1);
    expect(manifest.included.chat).toBe(false);
    expect(manifest.excluded).toContain("node_modules/");
    expect(zip.file("data/project.json")).not.toBeNull();
    expect(zip.file("data/artifacts.json")).not.toBeNull();
    expect(zip.file("project/input/fsd/spec.md")).not.toBeNull();
    expect(zip.file("project/output/erd/erd.dbml")).not.toBeNull();
    expect(zip.file("project/node_modules/pkg/index.js")).toBeNull();
    expect(zip.file("project/.env")).toBeNull();
    expect(zip.file("project/dist/out.js")).toBeNull();
  });

  test("import creates a new project and remaps every id", async () => {
    const dest = path.join(tmp, "dest");
    const result = await importProjectBundle(db, new Uint8Array(bundle), dest);

    expect(result.projectId).not.toBe("p1");
    expect(result.rootPath).toBe(dest);
    expect(fs.readFileSync(path.join(dest, "input/fsd/spec.md"), "utf8")).toBe("# Spec");
    expect(fs.readFileSync(path.join(dest, "output/erd/erd.dbml"), "utf8")).toContain("Table users");
    expect(fs.existsSync(path.join(dest, "node_modules"))).toBe(false);
    expect(fs.existsSync(path.join(dest, ".env"))).toBe(false);

    const project = db.select().from(schema.projects).where(eq(schema.projects.id, result.projectId)).get();
    expect(project.name).toBe("Demo (imported)");
    expect(project.rootPath).toBe(dest);

    const erd = db.select().from(schema.erds).where(eq(schema.erds.projectId, result.projectId)).get();
    expect(erd.id).not.toBe("e1");
    const erdSnap = db.select().from(schema.erdSnapshots).where(eq(schema.erdSnapshots.erdId, erd.id)).get();
    expect(erdSnap).toBeTruthy();

    const task = db.select().from(schema.tasks).where(eq(schema.tasks.projectId, result.projectId)).get();
    expect(task.id).not.toBe("t1");
    expect(task.execProviderId).toBeNull();

    const log = db.select().from(schema.changeLog).where(eq(schema.changeLog.projectId, result.projectId)).all();
    const taskLog = log.find((row: any) => row.entityType === "task");
    expect(taskLog.entityId).toBe(task.id);
    expect(taskLog.snapshotId).not.toBeNull();

    const settings = db.select().from(schema.projectExecSettings).where(eq(schema.projectExecSettings.projectId, result.projectId)).get();
    expect(settings.execProviderId).toBeNull();
    expect(settings.reviewerProviderId).toBeNull();
    expect(settings.maxParallel).toBe(3);

    const link = db.select().from(schema.rtmLinks).where(eq(schema.rtmLinks.projectId, result.projectId)).get();
    const fr = db.select().from(schema.functionalRequirements).where(eq(schema.functionalRequirements.id, link.frId)).get();
    expect(fr).toBeTruthy();
  });

  test("a zip-slip entry is rejected and nothing is written outside the destination", async () => {
    const evil = new JSZip();
    evil.file("manifest.json", JSON.stringify({
      formatVersion: 1,
      project: { name: "Evil" },
      included: { files: true, artifacts: [], execution: false, chat: false },
      excluded: [],
      counts: {},
    }));
    evil.file("data/project.json", JSON.stringify({ project: { name: "Evil" } }));
    evil.file("data/artifacts.json", JSON.stringify({}));
    evil.file("project/../evil.txt", "nope");
    const bytes = new Uint8Array(await evil.generateAsync({ type: "arraybuffer" }));
    const dest = path.join(tmp, "evil");

    await expect(importProjectBundle(db, bytes, dest)).rejects.toThrow();
    expect(fs.existsSync(path.join(tmp, "evil.txt"))).toBe(false);
  });

  test("a non-empty destination is refused", async () => {
    const dest = path.join(tmp, "nonempty");
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, "keep.txt"), "keep");

    await expect(importProjectBundle(db, new Uint8Array(bundle), dest)).rejects.toThrow(/kosong/);
    expect(fs.readFileSync(path.join(dest, "keep.txt"), "utf8")).toBe("keep");
  });

  test("chat export is compact and drops machine-local state", async () => {
    const withChat = await exportProjectBundle(db, "p1", { includeChat: true });
    const zip = await JSZip.loadAsync(withChat);
    const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
    expect(manifest.included.chat).toBe(true);
    expect(manifest.chatMode).toBe("compact");
    expect(manifest.counts.chatThreads).toBe(2);

    const chat = JSON.parse(await zip.file("data/chat.json")!.async("string"));
    const thread = chat.threads.find((row: any) => row.id === "th1");
    expect(thread.title).toBe("Login discussion");
    expect(thread.cliSessionId).toBeUndefined();
    expect(thread.providerId).toBeUndefined();
    expect(thread.model).toBeUndefined();
    expect(thread.modelOptionsJson).toBeUndefined();
    expect(thread.workspacePath).toBeUndefined();
    expect(thread.workspaceStrategy).toBeUndefined();
    expect(thread.queuePaused).toBeUndefined();
    expect(chat.threads.find((row: any) => row.id === "th2").parentThreadId).toBe("th1");

    const ids = chat.messages.map((row: any) => row.id);
    expect(ids).toEqual(["m1", "m2"]);
    const user = JSON.parse(chat.messages[0].contentJson);
    expect(user[0]).toEqual({ type: "text", text: "Buat login" });
    expect(user[1].path).toBe("input/uploads/th1/note.txt");
    expect(user[1].url).toBeUndefined();
    expect(user.some((part: any) => part.type === "image")).toBe(false);
    const assistant = JSON.parse(chat.messages[1].contentJson);
    expect(assistant).toEqual([{ type: "text", text: "Login dibuat" }]);
    expect(chat.messages[1].toolCallsJson).toBeNull();
    expect(JSON.parse(chat.messages[1].suggestionsJson)).toEqual(["Lanjut buat login", "Tambah test"]);

    expect(chat.threadFiles[0].diffJson).toBeUndefined();
    expect(chat.threadReads[0].hash).toBe("abc");
  });

  test("chat import remaps threads, lineage, messages, uploads and search rows", async () => {
    const withChat = await exportProjectBundle(db, "p1", { includeChat: true });
    const dest = path.join(tmp, "dest-chat");
    const result = await importProjectBundle(db, new Uint8Array(withChat), dest);

    const threads = db.select().from(schema.chatThreads).where(eq(schema.chatThreads.projectId, result.projectId)).all();
    expect(threads).toHaveLength(2);
    const imported = threads.find((row: any) => row.title === "Login discussion")!;
    expect(imported.id).not.toBe("th1");
    expect(imported.cliSessionId).toBeNull();
    expect(imported.providerId).toBeNull();
    expect(imported.model).toBeNull();
    expect(imported.modelOptionsJson).toBeNull();
    expect(imported.workspacePath).toBeNull();
    expect(imported.queuePaused).toBe(false);

    const fork = threads.find((row: any) => row.title === "Fork of login")!;
    expect(fork.parentThreadId).toBe(imported.id);
    expect(fork.rootThreadId).toBe(imported.id);

    const messages = db.select().from(schema.chatMessages).where(eq(schema.chatMessages.threadId, imported.id)).all();
    expect(messages.map((row: any) => row.seq).sort((a: number, b: number) => a - b)).toEqual([1, 2]);
    const user = messages.find((row: any) => row.seq === 1)!;
    expect(user.id).not.toBe("m1");
    expect(user.contentJson).toContain(`input/uploads/${imported.id}/note.txt`);
    expect(user.contentJson).not.toContain(`input/uploads/th1/`);
    const answer = messages.find((row: any) => row.seq === 2)!;
    expect(JSON.parse(answer.suggestionsJson)).toEqual(["Lanjut buat login", "Tambah test"]);

    const files = db.select().from(schema.chatThreadFiles).where(eq(schema.chatThreadFiles.threadId, imported.id)).all();
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe(`input/uploads/${imported.id}/note.txt`);
    expect(files[0].messageId).toBe(messages.find((row: any) => row.seq === 1)!.id);

    expect(fs.existsSync(path.join(dest, "input/uploads/th1"))).toBe(false);
    expect(fs.readFileSync(path.join(dest, `input/uploads/${imported.id}/note.txt`), "utf8")).toBe("attachment");

    const hits = sqlite
      .query("SELECT text FROM chat_fts WHERE thread_id = ? ORDER BY text")
      .all(imported.id) as { text: string }[];
    expect(hits.map((hit) => hit.text)).toEqual(["Buat login", "Login dibuat"]);
  });
});
