/**
 * `#` references in the composer (M4 item 18): an FSD session, an ERD table, an API
 * endpoint, a task, a wiki page, or another conversation. The popup lists them; when a
 * message is sent, each reference is resolved to a bounded excerpt of its content and
 * sent along with the message. The excerpt is project data, so it is labelled as
 * data, not as instructions.
 */
import fs from "node:fs";
import path from "node:path";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "~/server/db/client";
import { apiEndpoints, apiSpecs, chatThreads, erds, fsdSessions, tasks, wikiPages } from "~/server/db/schema";
import { MENTION_KINDS, type MentionKind, type MentionRef } from "~/lib/mention-ref";
import { resolveInRoot } from "./paths";
import { listMessages, toUIMessages } from "./store";

/** The longest excerpt sent for one reference. */
export const REF_TEXT_LIMIT = 4000;
/** How many references of one kind the popup lists. */
const LIST_LIMIT = 200;

/** Table names declared in a DBML document, in order. */
export function dbmlTableNames(dbml: string): string[] {
  return [...dbml.matchAll(/^\s*Table\s+"?([\w.]+)"?\s*(?:as\s+\w+\s*)?\{/gm)].map((m) => m[1]);
}

/** The declaration of one table: from its `Table name {` line to the closing brace. */
export function dbmlTableBlock(dbml: string, table: string): string | null {
  const start = new RegExp(`^\\s*Table\\s+"?${table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"?\\s*(?:as\\s+\\w+\\s*)?\\{`, "m").exec(dbml);
  if (!start) return null;
  const close = dbml.indexOf("\n}", start.index);
  return dbml.slice(start.index, close === -1 ? undefined : close + 2).trim();
}

function clip(text: string): string {
  return text.length <= REF_TEXT_LIMIT ? text : `${text.slice(0, REF_TEXT_LIMIT)}\n… (dipotong)`;
}

/** Every reference the project offers, grouped by kind for the popup. */
export function listMentionRefs(projectId: string): MentionRef[] {
  const out: MentionRef[] = [];

  const fsd = db.select().from(fsdSessions).where(eq(fsdSessions.projectId, projectId)).limit(LIST_LIMIT).all();
  for (const row of fsd) {
    const file = path.basename(row.markdownPath ?? row.fsdInputPath ?? "");
    out.push({ kind: "fsd", id: row.id, label: row.title?.trim() || file || "FSD", hint: `FSD · ${row.status ?? "pending"}` });
  }

  // Tables come from the newest ERD of each project; a table listed twice is kept once.
  const erdRows = db.select().from(erds).where(eq(erds.projectId, projectId)).orderBy(desc(erds.updatedAt)).all();
  const seen = new Set<string>();
  for (const erd of erdRows) {
    for (const table of dbmlTableNames(erd.dbmlContent)) {
      if (seen.has(table) || out.length > LIST_LIMIT * 6) continue;
      seen.add(table);
      out.push({ kind: "erd", id: table, label: table, hint: `ERD · ${erd.name}` });
    }
  }

  const endpoints = db
    .select({ id: apiEndpoints.id, method: apiEndpoints.method, path: apiEndpoints.path, module: apiEndpoints.module })
    .from(apiEndpoints)
    .innerJoin(apiSpecs, eq(apiSpecs.id, apiEndpoints.specId))
    .where(eq(apiSpecs.projectId, projectId))
    .orderBy(asc(apiEndpoints.sortOrder))
    .limit(LIST_LIMIT)
    .all();
  for (const row of endpoints) out.push({ kind: "endpoint", id: row.id, label: `${row.method} ${row.path}`, hint: `API · ${row.module}` });

  const taskRows = db.select().from(tasks).where(eq(tasks.projectId, projectId)).limit(LIST_LIMIT).all();
  for (const row of taskRows) {
    out.push({ kind: "task", id: row.id, label: row.code ? `${row.code} ${row.title}` : row.title, hint: `Task · ${row.status ?? "todo"}` });
  }

  const wiki = db.select().from(wikiPages).where(eq(wikiPages.projectId, projectId)).limit(LIST_LIMIT).all();
  for (const row of wiki) out.push({ kind: "wiki", id: row.id, label: row.title, hint: "Wiki" });

  const threads = db
    .select()
    .from(chatThreads)
    .where(and(eq(chatThreads.projectId, projectId), eq(chatThreads.archived, false)))
    .orderBy(desc(chatThreads.updatedAt))
    .limit(LIST_LIMIT)
    .all();
  for (const row of threads) out.push({ kind: "thread", id: row.id, label: row.title?.trim() || "Percakapan", hint: "Percakapan lain" });

  return out;
}

/**
 * The content of one reference, clipped. Null when it does not exist in this project.
 * A file-backed FSD is read from the workspace; a thread gives its summary, or else its
 * latest messages, so another conversation can be carried over without its tool detail.
 */
export function resolveMentionRef(projectId: string, root: string, kind: MentionKind, id: string): { label: string; text: string } | null {
  switch (kind) {
    case "fsd": {
      const row = db.select().from(fsdSessions).where(and(eq(fsdSessions.id, id), eq(fsdSessions.projectId, projectId))).get();
      if (!row) return null;
      const rel = row.markdownPath ?? row.fsdInputPath ?? "";
      let text = row.fsdContent ?? "";
      if (!text && rel) {
        try {
          text = fs.readFileSync(resolveInRoot(root, rel).abs, "utf-8");
        } catch {
          text = "";
        }
      }
      return { label: row.title?.trim() || path.basename(rel) || "FSD", text: clip(text) };
    }
    case "erd": {
      const erdRows = db.select().from(erds).where(eq(erds.projectId, projectId)).orderBy(desc(erds.updatedAt)).all();
      for (const erd of erdRows) {
        const block = dbmlTableBlock(erd.dbmlContent, id);
        if (block) return { label: id, text: clip(block) };
      }
      return null;
    }
    case "endpoint": {
      const row = db
        .select()
        .from(apiEndpoints)
        .innerJoin(apiSpecs, eq(apiSpecs.id, apiEndpoints.specId))
        .where(and(eq(apiEndpoints.id, id), eq(apiSpecs.projectId, projectId)))
        .get();
      if (!row) return null;
      const e = row.api_endpoints;
      const text = [
        `${e.method} ${e.path}`,
        `Modul: ${e.module}`,
        e.purpose ? `Tujuan: ${e.purpose}` : "",
        e.bodySchema ? `Body: ${e.bodySchema}` : "",
        e.responseSchema ? `Respons: ${e.responseSchema}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      return { label: `${e.method} ${e.path}`, text: clip(text) };
    }
    case "task": {
      const row = db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.projectId, projectId))).get();
      if (!row) return null;
      const text = [
        `Status: ${row.status ?? "todo"}`,
        row.module ? `Modul: ${row.module}` : "",
        row.dependenciesJson ? `Dependensi: ${row.dependenciesJson}` : "",
        row.description ?? "",
      ]
        .filter(Boolean)
        .join("\n");
      return { label: row.code ? `${row.code} ${row.title}` : row.title, text: clip(text) };
    }
    case "wiki": {
      const row = db.select().from(wikiPages).where(and(eq(wikiPages.id, id), eq(wikiPages.projectId, projectId))).get();
      if (!row) return null;
      return { label: row.title, text: clip(row.contentMd ?? "") };
    }
    case "thread": {
      const row = db.select().from(chatThreads).where(and(eq(chatThreads.id, id), eq(chatThreads.projectId, projectId))).get();
      if (!row) return null;
      const label = row.title?.trim() || "Percakapan";
      if (row.summary?.trim()) return { label, text: clip(row.summary.trim()) };
      const lines = toUIMessages(listMessages(id).slice(-10))
        .filter((m) => m.role !== "system")
        .map((m) => `${m.role === "user" ? "User" : "Agent"}: ${(m.parts ?? []).map((p: any) => (p?.type === "text" ? p.text : "")).join("").trim()}`)
        .filter((line) => line.length > 9);
      return { label, text: clip(lines.join("\n\n")) };
    }
  }
}

