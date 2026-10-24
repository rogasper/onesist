/**
 * "Lengkapi dengan AI": the prompt that asks an agent for a readiness proposal (repos, file
 * scope, acceptance criteria), and the parsing and validation of its answer. Nothing here
 * writes; the route decides when a proposal is saved.
 */
import type { Task } from "~/shared/types";

export interface FillProposal {
  repos: string[];
  filesScope: string[];
  acceptanceCriteria: string[];
}

const BLOCK = /```onesist-fill\s*\n([\s\S]*?)\n```/g;
const MAX_PATHS = 200;
const MAX_CRITERIA = 30;
const MAX_CRITERION_CHARS = 300;

export function buildFillPrompt(task: Task, repoIds: string[]): string {
  const refs = [
    task.specRef && `Spec: ${task.specRef}`,
    task.erdRef && `ERD: ${task.erdRef}`,
    task.rtmRef && `RTM: ${task.rtmRef}`,
  ].filter(Boolean);
  return [
    `Lengkapi kesiapan task ${task.code ?? task.title} supaya bisa dikerjakan agen.`,
    "",
    `Judul: ${task.title}`,
    task.description ? `Deskripsi:\n${task.description}` : "",
    refs.length ? refs.join("\n") : "",
    `Repo yang tersedia: ${repoIds.length ? repoIds.join(", ") : "(tidak ada)"}`,
    "",
    "Baca dokumen yang disebut di atas dan kode repo yang relevan. JANGAN mengubah berkas apa pun.",
    "Jawab dengan tepat satu blok kode ```onesist-fill``` berisi JSON seperti ini:",
    '{"repos": ["input/code/nama"], "filesScope": ["input/code/nama/src/berkas.ts"], "acceptanceCriteria": ["kriteria yang bisa diuji"]}',
    "filesScope berupa path relatif ke root project, dimulai dari repo-nya. Hanya tulis path yang memang akan disentuh.",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function parseFillProposal(text: string): { ok: true; proposal: FillProposal } | { ok: false; error: string } {
  const blocks = [...text.matchAll(BLOCK)];
  const last = blocks.at(-1);
  if (!last) return { ok: false, error: "Usulan belum ada di jawaban agen." };
  let value: unknown;
  try {
    value = JSON.parse(last[1]);
  } catch {
    return { ok: false, error: "Usulan agen bukan JSON yang valid." };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "Usulan agen harus berupa objek." };
  const v = value as Record<string, unknown>;
  const strings = (x: unknown) => (Array.isArray(x) ? x.filter((s): s is string => typeof s === "string") : []);
  return {
    ok: true,
    proposal: { repos: strings(v.repos), filesScope: strings(v.filesScope), acceptanceCriteria: strings(v.acceptanceCriteria) },
  };
}

/** A safe repo-relative path: not empty, not absolute, and never climbing out with "..". */
function safePath(p: string): boolean {
  const s = p.trim();
  return s !== "" && !s.startsWith("/") && !/^[A-Za-z]:/.test(s) && !s.split(/[\\/]/).includes("..");
}

/** The proposal may come from a request body, so every list is checked item by item. */
export function validateFillProposal(proposal: FillProposal, repoIds: string[]): { proposal: FillProposal; dropped: string[] } {
  const known = new Set(repoIds);
  const strings = (xs: unknown[]) => xs.filter((x): x is string => typeof x === "string");
  const repos = strings(proposal.repos);
  const dropped = repos.filter((r) => !known.has(r));
  return {
    proposal: {
      repos: repos.filter((r) => known.has(r)),
      filesScope: strings(proposal.filesScope).map((p) => p.trim()).filter(safePath).slice(0, MAX_PATHS),
      acceptanceCriteria: strings(proposal.acceptanceCriteria)
        .map((c) => c.trim())
        .filter((c) => c !== "")
        .map((c) => c.slice(0, MAX_CRITERION_CHARS))
        .slice(0, MAX_CRITERIA),
    },
    dropped,
  };
}
