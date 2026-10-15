import { useEffect, useState } from "react";
import { Button, Dialog, DialogDescription, DialogRoot, DialogTitle } from "@cloudflare/kumo";
import { InlineAlert } from "~/components/ui/InlineAlert";
import { fetchProjectWorktrees, fetchWorkspaceOptions, removeProjectWorktree, setThreadWorkspace } from "~/lib/use-chat";
import type { ProjectWorktree, WorkspaceOptions, WorkspaceRequest } from "~/lib/workspace-view";

/**
 * Fase 4C: where a thread's CLI agent works, and the project's worktrees. Moving the
 * workspace starts a new CLI session there; the conversation is handed over (4A).
 */

type Choice = "worktree" | "existing" | "repo" | "project";

const CHOICES: { value: Choice; label: string; hint: string; needsRepo: boolean }[] = [
  { value: "worktree", label: "Worktree baru (disarankan)", hint: "Branch baru di folder terpisah di luar project. Working tree repo Anda tidak tersentuh.", needsRepo: true },
  { value: "existing", label: "Worktree yang sudah ada", hint: "Lanjut bekerja di worktree lain milik repo ini.", needsRepo: true },
  { value: "repo", label: "Langsung di repo", hint: "Agent mengubah working tree repo itu sendiri.", needsRepo: true },
  { value: "project", label: "Root project", hint: "Untuk planning dan dokumen.", needsRepo: false },
];

const fieldCls = "w-full bg-kumo-elevated border border-kumo-line rounded px-2 py-1 text-xs text-kumo-default outline-none focus:border-kumo-brand";
const labelCls = "text-[10px] text-kumo-subtle uppercase tracking-wider block mb-1";

interface Props {
  open: boolean;
  threadId: string;
  projectId: string;
  onOpenChange: (open: boolean) => void;
  /** The workspace or a worktree changed: re-read the thread. */
  onChanged: () => void;
}

export function WorkspaceDialog({ open, threadId, projectId, onOpenChange, onChanged }: Props) {
  const [options, setOptions] = useState<WorkspaceOptions | null>(null);
  const [worktrees, setWorktrees] = useState<ProjectWorktree[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [choice, setChoice] = useState<Choice>("project");
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("");
  const [baseRef, setBaseRef] = useState("");
  const [fromOrigin, setFromOrigin] = useState(false);
  const [existing, setExisting] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  async function reload() {
    setError(null);
    try {
      const [opts, list] = await Promise.all([fetchWorkspaceOptions(threadId), fetchProjectWorktrees(projectId)]);
      setOptions(opts);
      setWorktrees(list);
      const firstRepo = opts.current.repo ?? opts.repos[0]?.id ?? "";
      setRepo(firstRepo);
      setBranch(opts.defaultBranch);
      setBaseRef(opts.repos.find((r) => r.id === firstRepo)?.branch ?? "");
      setFromOrigin(false);
      setExisting(opts.current.strategy === "worktree" || opts.current.strategy === "existing_worktree" ? (opts.current.path ?? "") : "");
      // A repo defaults to a new worktree; a thread without a repo shows where it is now.
      setChoice(
        opts.current.strategy === "root"
          ? "repo"
          : opts.current.strategy === "worktree" || opts.current.strategy === "existing_worktree"
            ? "existing"
            : opts.repos.length
              ? "worktree"
              : "project",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat pilihan workspace");
    }
  }

  // Read again on every open: repos and worktrees change outside the app.
  useEffect(() => {
    if (open) void reload();
  }, [open, threadId]); // eslint-disable-line react-hooks/exhaustive-deps

  const repoInfo = options?.repos.find((r) => r.id === repo) ?? null;
  const hasRepos = (options?.repos.length ?? 0) > 0;

  function request(): WorkspaceRequest {
    if (choice === "project") return { strategy: "root", repo: null };
    if (choice === "repo") return { strategy: "root", repo };
    if (choice === "existing") return { strategy: "existing_worktree", repo, path: existing };
    return { strategy: "worktree", repo, branch: branch.trim(), baseRef: baseRef.trim() || null, fromOrigin };
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await setThreadWorkspace(threadId, request());
      onOpenChange(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memindahkan workspace");
    } finally {
      setSaving(false);
    }
  }

  async function remove(w: ProjectWorktree) {
    setRemoving(true);
    setError(null);
    try {
      await removeProjectWorktree(projectId, w.path, w.dirtyFiles > 0);
      setConfirming(null);
      await reload();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus worktree");
    } finally {
      setRemoving(false);
    }
  }

  const canSave = !!options && !saving && (choice === "project" || (!!repo && (choice !== "existing" || !!existing) && (choice !== "worktree" || !!branch.trim())));

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <Dialog>
        <div className="p-5 w-[min(560px,92vw)] max-h-[85vh] overflow-y-auto space-y-4">
          <div>
            <DialogTitle>Workspace thread</DialogTitle>
            <DialogDescription>Tempat agent CLI thread ini bekerja. Memindahkan workspace memulai sesi CLI baru; percakapan tetap dibawa.</DialogDescription>
          </div>
          {error ? <InlineAlert>{error}</InlineAlert> : null}
          {!options ? (
            <p className="text-xs text-kumo-subtle">Memuat…</p>
          ) : (
            <>
              <p className="text-xs text-kumo-subtle">
                Sekarang: <span className="text-kumo-default">{options.current.label}</span>
                {options.current.missing ? <span className="text-red-400"> · folder tidak ditemukan</span> : null}
              </p>
              {!hasRepos ? (
                <p className="text-xs text-kumo-subtle">Belum ada repo git di root project atau di input/code/. Clone repo ke input/code/&lt;nama&gt; untuk memakai worktree.</p>
              ) : null}
              <div className="space-y-2">
                {CHOICES.map((c) => {
                  const disabled = c.needsRepo && !hasRepos;
                  return (
                    <label key={c.value} className={`flex gap-2 items-start text-xs ${disabled ? "opacity-50" : "cursor-pointer"}`}>
                      <input type="radio" name="workspace-choice" className="mt-0.5" checked={choice === c.value} disabled={disabled} onChange={() => setChoice(c.value)} />
                      <span>
                        <span className="text-kumo-default">{c.label}</span>
                        <span className="block text-kumo-subtle">{c.hint}</span>
                      </span>
                    </label>
                  );
                })}
              </div>

              {choice !== "project" && hasRepos ? (
                <div>
                  <label className={labelCls}>Repo</label>
                  <select
                    className={fieldCls}
                    value={repo}
                    onChange={(e) => {
                      setRepo(e.target.value);
                      setBaseRef(options.repos.find((r) => r.id === e.target.value)?.branch ?? "");
                      setExisting("");
                    }}
                  >
                    {options.repos.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.id === "." ? "Root project" : r.id}
                        {r.branch ? ` (${r.branch})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {choice === "worktree" && repoInfo ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelCls}>Branch baru</label>
                      <input className={fieldCls} value={branch} onChange={(e) => setBranch(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Mulai dari</label>
                      <input className={fieldCls} value={baseRef} placeholder={repoInfo.branch ?? "HEAD"} onChange={(e) => setBaseRef(e.target.value)} />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-kumo-default">
                    <input type="checkbox" checked={fromOrigin} onChange={(e) => setFromOrigin(e.target.checked)} />
                    Ambil dulu dari origin (git fetch), lalu mulai dari origin/{baseRef.trim() || repoInfo.branch || "HEAD"}
                  </label>
                  <p className="text-[11px] text-kumo-subtle break-all">Lokasi: {options.baseDir}</p>
                  {repoInfo.setup ? (
                    <p className="text-[11px] text-kumo-subtle">
                      Setelah dibuat, menjalankan: <code className="font-mono">{repoInfo.setup}</code>
                    </p>
                  ) : null}
                </div>
              ) : null}

              {choice === "existing" && repoInfo ? (
                repoInfo.worktrees.length ? (
                  <div>
                    <label className={labelCls}>Worktree</label>
                    <select className={fieldCls} value={existing} onChange={(e) => setExisting(e.target.value)}>
                      <option value="">Pilih worktree…</option>
                      {repoInfo.worktrees.map((w) => (
                        <option key={w.path} value={w.path}>
                          {w.branch ?? "(tanpa branch)"} — {w.path}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <p className="text-xs text-kumo-subtle">Repo ini belum punya worktree lain.</p>
                )
              ) : null}

              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                  Batal
                </Button>
                <Button variant="primary" size="sm" onClick={() => void save()} disabled={!canSave}>
                  {saving ? (choice === "worktree" ? "Membuat worktree…" : "Memindahkan…") : "Pindahkan"}
                </Button>
              </div>

              <div className="border-t border-kumo-line pt-3 space-y-2">
                <p className={labelCls}>Worktree Onesist di project ini</p>
                {worktrees.length === 0 ? <p className="text-xs text-kumo-subtle">Belum ada.</p> : null}
                {worktrees.map((w) => (
                  <div key={w.path} className="rounded ring ring-kumo-line px-2 py-1.5 text-xs space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-kumo-default" title={w.path}>
                        {w.branch ?? "(tanpa branch)"} · {w.repo === "." ? "root project" : w.repo}
                      </span>
                      {w.missing ? <span className="text-red-400 shrink-0">folder hilang</span> : null}
                      {w.dirtyFiles > 0 ? <span className="text-red-400 shrink-0">{w.dirtyFiles} berkas belum di-commit</span> : null}
                      {confirming === w.path ? null : (
                        <button className="ml-auto shrink-0 text-kumo-brand hover:underline" onClick={() => setConfirming(w.path)}>
                          Hapus
                        </button>
                      )}
                    </div>
                    {w.threads.length ? <p className="text-kumo-subtle truncate">Dipakai: {w.threads.map((t) => t.title || "Percakapan").join(", ")}</p> : null}
                    {confirming === w.path ? (
                      <div className="flex items-center gap-2">
                        <span className="text-kumo-subtle">
                          {w.dirtyFiles > 0 ? `${w.dirtyFiles} berkas yang belum di-commit akan hilang. ` : ""}Branch tetap disimpan.
                          {w.threads.length ? " Thread yang memakainya kembali ke root project." : ""}
                        </span>
                        <Button variant="ghost" size="sm" onClick={() => setConfirming(null)} disabled={removing}>
                          Batal
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => void remove(w)} disabled={removing}>
                          {removing ? "Menghapus…" : "Hapus worktree"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </Dialog>
    </DialogRoot>
  );
}
