/**
 * Read-only tool that returns sanitized, Monday-friendly external task cards (#69).
 *
 * Exposed both to the native chat agent (`task_external_card`) and over the project MCP
 * server (`onesist_task_card`) so agents pushing items to Monday MCP use the exact same
 * formatter as Copy HTML and Monday CSV, without leaking Onesist-internal workspace paths.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { formatExternalTaskCard } from "~/lib/external-task-card";
import { STATUS_LABELS, normalizeStatus } from "~/lib/task-status";
import { db } from "~/server/db/client";
import { tasks } from "~/server/db/schema";
import { tool } from "./ai";

export const MAX_EXTERNAL_TASK_CARDS = 20;

export interface ExternalTaskCardToolItem {
  id: string;
  code: string | null;
  title: string;
  group: string | null;
  status: string;
  assignee: string | null;
  storyPoints: number | null;
  dependsOn: string[];
  blocks: string[];
  fields: { label: string; value: string }[];
  html: string;
  text: string;
}

function parseJsonStringList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string" && v.trim().length > 0 && v.trim() !== "—" && v.trim() !== "-")
      : [];
  } catch {
    return [];
  }
}

export function formatTaskRowForTool(row: typeof tasks.$inferSelect): ExternalTaskCardToolItem {
  const card = formatExternalTaskCard(row);
  return {
    id: row.id,
    code: row.code ?? null,
    title: card.title,
    group: card.group,
    status: STATUS_LABELS[normalizeStatus(row.status)] ?? row.status,
    assignee: row.assignee?.trim() || null,
    storyPoints: row.storyPoints ?? null,
    dependsOn: parseJsonStringList(row.dependenciesJson),
    blocks: parseJsonStringList(row.blocksJson),
    fields: card.fields,
    html: card.html,
    text: card.text,
  };
}

export function buildTaskCardTool(projectId: string) {
  const taskExternalCard = tool({
    description:
      "Ambil kartu task siap pakai untuk Monday atau pihak eksternal dalam format standar (judul, group, field penting, HTML ramah Monday, dan fallback plain text) tanpa path/file internal Onesist. " +
      "WAJIB panggil tool ini setiap kali akan membuat atau memperbarui item/update di Monday; jangan menyalin markdown mentah dari output/task/*.md atau menyebut Files Scope, Spec Ref, ERD Ref, RTM Ref, Source, output/, input/, .agents/, data.db, MASTER_*, atau nama file artifact Onesist. " +
      "Jika dipanggil tanpa task_id/code/codes, mengembalikan daftar ringkas task aktif di project ini.",
    inputSchema: z.object({
      task_id: z.string().optional().describe("ID task di tabel tasks (opsional jika memakai code/codes)"),
      code: z.string().optional().describe("Satu kode task, mis. LOAN-1 atau BE-01"),
      codes: z
        .array(z.string())
        .max(MAX_EXTERNAL_TASK_CARDS)
        .optional()
        .describe(`Daftar kode task (maksimal ${MAX_EXTERNAL_TASK_CARDS}) untuk mengambil beberapa kartu sekaligus`),
    }),
    execute: async ({ task_id, code, codes }) => {
      const allRows = db.select().from(tasks).where(eq(tasks.projectId, projectId)).all() as (typeof tasks.$inferSelect)[];
      allRows.sort((a, b) => (a.code ?? "").localeCompare(b.code ?? ""));

      const requestedCodes = [
        ...(code?.trim() ? [code.trim()] : []),
        ...(codes ?? []).map((c) => c.trim()).filter(Boolean),
      ];
      const requestedId = task_id?.trim() || null;

      if (!requestedId && requestedCodes.length === 0) {
        const active = allRows.filter((r) => !r.archived);
        if (!active.length) return "Belum ada task aktif di project ini.";
        const summary = active.map((r) => ({
          id: r.id,
          code: r.code,
          title: formatExternalTaskCard(r).title,
          group: r.phase?.trim() || r.module?.trim() || null,
          status: STATUS_LABELS[normalizeStatus(r.status)] ?? r.status,
        }));
        return JSON.stringify(
          {
            total: summary.length,
            note: "Panggil ulang dengan code, codes, atau task_id untuk mengambil kartu eksternal lengkap (html & text).",
            tasks: summary,
          },
          null,
          2,
        );
      }

      const matched: (typeof tasks.$inferSelect)[] = [];
      const seen = new Set<string>();
      const missing: string[] = [];

      if (requestedId) {
        const found = allRows.find((r) => r.id === requestedId);
        if (found) {
          seen.add(found.id);
          matched.push(found);
        } else {
          missing.push(requestedId);
        }
      }

      for (const reqCode of requestedCodes) {
        const needle = reqCode.toLowerCase();
        const found = allRows.find((r) => (r.code ?? "").trim().toLowerCase() === needle);
        if (found) {
          if (!seen.has(found.id)) {
            seen.add(found.id);
            matched.push(found);
          }
        } else {
          missing.push(reqCode);
        }
      }

      if (!matched.length) {
        throw new Error(`Task tidak ditemukan di project ini: ${missing.join(", ")}.`);
      }

      const cards = matched.map(formatTaskRowForTool);
      return JSON.stringify(
        {
          guidance:
            "Pakai title untuk nama item Monday, group untuk Group, fields untuk kolom board, html untuk Update/rich text Monday, dan text untuk kolom Description teks biasa. Jangan tambahkan Files Scope, Spec Ref, ERD Ref, RTM Ref, Source, atau path internal Onesist.",
          ...(missing.length ? { missing } : {}),
          cards,
        },
        null,
        2,
      );
    },
  });

  return { taskExternalCard };
}
