import { useCallback, useEffect, useState } from "react";
import type { SubagentView, SubagentDraft } from "~/lib/use-subagents";

/**
 * Subagent settings (FR-G2, FR-G5, FR-G7) for the project Settings tab.
 *
 * Two kinds of definition are shown in one list because to the user they are one
 * thing, but only the ones that live in the database can be edited here: a
 * project's own subagents are markdown files inside its workspace (FR-G1), which
 * travel with the repo and are edited like any other project file. The list says
 * which is which rather than pretending everything is editable.
 */
export function SubagentsPanel({ projectId }: { projectId: string }) {
  const state = useSubagentState(projectId);
  const [editing, setEditing] = useState<SubagentDraft | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const emptyDraft = (): SubagentDraft => ({ id: null, name: "", description: "", tools: ["read_file", "grep"], instructions: "", maxSteps: 12 });

  async function save() {
    if (!editing) return;
    setBusy(true);
    setNote(null);
    const res = await state.save(editing);
    setBusy(false);
    if (!res.ok) {
      setNote(res.error);
      return;
    }
    setEditing(null);
    setNote("Tersimpan.");
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-start gap-3">
        <p className="text-sm text-kumo-subtle flex-1">
          Subagent berjalan di konteks terpisah dan <strong className="text-kumo-default">hanya bisa membaca</strong> — tidak menulis, tidak
          menjalankan shell, dan tidak bisa bertanya ke user. Karena itu ia berguna untuk pekerjaan yang butuh membaca banyak berkas: yang
          kembali ke percakapan hanya ringkasannya.
        </p>
        <button
          onClick={() => {
            setNote(null);
            setEditing(emptyDraft());
          }}
          className="shrink-0 rounded-lg px-2.5 py-1.5 text-sm ring ring-kumo-line hover:bg-kumo-elevated text-kumo-default"
        >
          Tambah subagent
        </button>
      </div>

      <div className="grid gap-1.5">
        {state.loading && !state.subagents.length ? <p className="text-sm text-kumo-subtle">Memuat…</p> : null}
        {state.subagents.map((s) => (
          <div key={`${s.source}:${s.name}`} className="flex items-start gap-3 rounded-xl ring ring-kumo-line px-3 py-2">
            <span className="grid gap-0.5 min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="text-sm font-medium text-kumo-default font-mono">{s.name}</span>
                <span className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ring ring-kumo-line text-kumo-subtle">
                  {s.source === "project" ? "project" : s.source === "app" ? "dibuat di sini" : "bawaan"}
                </span>
                <span className="text-xs text-kumo-subtle">{s.maxSteps} langkah maks</span>
              </span>
              <span className="text-sm text-kumo-subtle">{s.description}</span>
              <span className="text-xs font-mono text-kumo-subtle">{s.tools.join(", ")}</span>
            </span>
            {s.id ? (
              <span className="shrink-0 flex items-center gap-1">
                <button
                  onClick={() =>
                    setEditing({ id: s.id, name: s.name, description: s.description, tools: s.tools, instructions: s.instructions ?? "", maxSteps: s.maxSteps })
                  }
                  className="rounded px-2 py-1 text-xs text-kumo-brand hover:bg-kumo-elevated"
                >
                  Ubah
                </button>
                <button
                  onClick={async () => {
                    const res = await state.remove(s.id!);
                    if (!res.ok) setNote(res.error);
                  }}
                  className="rounded px-2 py-1 text-xs text-kumo-subtle hover:bg-kumo-elevated hover:text-red-400"
                >
                  Hapus
                </button>
              </span>
            ) : (
              <span className="shrink-0 text-xs text-kumo-subtle">{s.source === "project" ? "berkas di .agents/agents/" : "bawaan aplikasi"}</span>
            )}
          </div>
        ))}
      </div>

      {editing ? (
        <div className="grid gap-2 rounded-xl ring ring-kumo-line p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-sm text-kumo-default">Nama</span>
              <input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="pencari-kontrak"
                className="rounded-lg px-2.5 py-1.5 bg-kumo-elevated ring ring-kumo-line text-sm font-mono text-kumo-default focus:outline-none focus:ring-kumo-brand"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-sm text-kumo-default">Batas langkah</span>
              <input
                type="number"
                min={1}
                max={30}
                value={editing.maxSteps ?? 12}
                onChange={(e) => setEditing({ ...editing, maxSteps: Number(e.target.value) })}
                className="rounded-lg px-2.5 py-1.5 bg-kumo-elevated ring ring-kumo-line text-sm text-kumo-default focus:outline-none focus:ring-kumo-brand"
              />
            </label>
          </div>
          <label className="grid gap-1">
            <span className="text-sm text-kumo-default">Kapan dipakai</span>
            <input
              value={editing.description}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              placeholder="Cari endpoint di semua spec dan kembalikan daftarnya…"
              className="rounded-lg px-2.5 py-1.5 bg-kumo-elevated ring ring-kumo-line text-sm text-kumo-default focus:outline-none focus:ring-kumo-brand"
            />
            <span className="text-xs text-kumo-subtle">Dibaca agent utama untuk memutuskan kapan mendelegasikan. Jelaskan kapan, bukan hanya apa.</span>
          </label>
          <div className="grid gap-1">
            <span className="text-sm text-kumo-default">Tool (hanya baca)</span>
            <div className="flex flex-wrap gap-1.5">
              {state.allowedTools.map((t) => {
                const on = editing.tools.includes(t);
                return (
                  <button
                    key={t}
                    onClick={() => setEditing({ ...editing, tools: on ? editing.tools.filter((x) => x !== t) : [...editing.tools, t] })}
                    className={`rounded-lg px-2 py-1 text-xs font-mono ring ${on ? "ring-kumo-brand text-kumo-brand" : "ring-kumo-line text-kumo-subtle hover:bg-kumo-elevated"}`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
            <span className="text-xs text-kumo-subtle">
              Tool yang mengubah state tidak tersedia di sini — subagent tidak boleh menulis, karena AI SDK tidak mengizinkan kartu persetujuan di dalamnya.
            </span>
          </div>
          <label className="grid gap-1">
            <span className="text-sm text-kumo-default">Instruksi</span>
            <textarea
              value={editing.instructions}
              onChange={(e) => setEditing({ ...editing, instructions: e.target.value })}
              rows={6}
              placeholder="Kamu adalah… Jawab dengan… Jangan…"
              className="rounded-lg px-2.5 py-2 bg-kumo-elevated ring ring-kumo-line text-sm text-kumo-default focus:outline-none focus:ring-kumo-brand"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={busy || !editing.name.trim() || !editing.description.trim() || !editing.instructions.trim()}
              className="rounded-lg px-3 py-1.5 text-sm text-kumo-brand ring ring-kumo-line hover:bg-kumo-elevated disabled:opacity-40"
            >
              Simpan
            </button>
            <button onClick={() => setEditing(null)} className="rounded-lg px-3 py-1.5 text-sm text-kumo-subtle hover:bg-kumo-elevated">
              Batal
            </button>
            {note ? <span className="text-sm text-kumo-subtle">{note}</span> : null}
          </div>
        </div>
      ) : note ? (
        <p className="text-sm text-kumo-subtle">{note}</p>
      ) : null}

      {state.rejected.length ? (
        <div className="grid gap-1 rounded-xl ring ring-amber-400/40 bg-amber-400/10 px-3 py-2">
          {state.rejected.map((r) => (
            <p key={`${r.source}:${r.name}`} className="text-sm text-kumo-default">
              <span className="font-mono">{r.name}</span> <span className="text-kumo-subtle">({r.source})</span> ditolak: {r.reason}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Small local state machine: load, save, remove. Kept out of the component so
 *  the render stays readable. */
function useSubagentState(projectId: string) {
  const [subagents, setSubagents] = useState<SubagentView[]>([]);
  const [rejected, setRejected] = useState<{ name: string; source: string; reason: string }[]>([]);
  const [allowedTools, setAllowedTools] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/chat/subagents?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setSubagents((data.subagents ?? []) as SubagentView[]);
        setRejected((data.rejected ?? []) as { name: string; source: string; reason: string }[]);
        setAllowedTools((data.allowedTools ?? []) as string[]);
      }
    } catch {
      /* the list is configuration, not the agent: failing to load must not throw */
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(
    async (draft: SubagentDraft) => {
      const res = await fetch(draft.id ? `/api/chat/subagents/${draft.id}` : "/api/chat/subagents", {
        method: draft.id ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
        cache: "no-store",
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) return { ok: false as const, error: body?.error ?? `HTTP ${res.status}` };
      await refresh();
      return { ok: true as const };
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/chat/subagents/${id}`, { method: "DELETE", cache: "no-store" });
      if (!res.ok) return { ok: false as const, error: `HTTP ${res.status}` };
      await refresh();
      return { ok: true as const };
    },
    [refresh],
  );

  return { subagents, rejected, allowedTools, loading, save, remove };
}
