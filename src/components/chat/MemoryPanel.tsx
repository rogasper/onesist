import { useEffect, useState } from "react";
import { Brain, Check, PencilSimple, Trash } from "@phosphor-icons/react";
import { useChatMemory } from "~/lib/use-chat";

/**
 * Memory panel (FR-H5): view, add, edit, delete.
 *
 * Two scopes, and the distinction is the point: `project` notes live in
 * `.agents/ONESIST.md` inside the workspace (they travel with the repo, so a
 * team shares them), while `global` notes are the person's own preferences and
 * apply to every project. Entries are shown with their timestamp because memory
 * is append-only history — the newest note is usually the one that matters, and
 * the prompt budget drops the oldest first (FR-H3).
 */
export function MemoryPanel({ projectId }: { projectId: string }) {
  const { memory, loading, add, remove, replace } = useChatMemory(projectId);
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"project" | "global">("project");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [fileDraft, setFileDraft] = useState("");

  const file = memory ? memory[scope] : null;
  const count = file?.entries.length ?? 0;

  useEffect(() => {
    if (editing && file) setFileDraft(file.content);
    // Switching scope while editing would edit the wrong file.
    if (editing) setEditing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  async function submit() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setNote(null);
    const res = await add(scope, text);
    setBusy(false);
    if (!res.ok) {
      setNote(res.error);
      return;
    }
    setDraft("");
    setNote("Tersimpan. Turn berikutnya sudah memakainya.");
  }

  return (
    <div className="border-b border-kumo-line shrink-0">
      <div className="mx-auto w-full max-w-3xl px-6">
        <div className="flex items-center gap-2 py-2">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 text-sm text-kumo-default hover:text-kumo-brand"
            title="Catatan yang diingat agent"
          >
            <span className={`text-kumo-subtle transition-transform ${open ? "rotate-90" : ""}`}>›</span>
            <Brain size={13} className="text-kumo-subtle" />
            Memori
            <span className="text-kumo-subtle">
              {count} catatan {scope === "project" ? "project" : "global"}
            </span>
          </button>
          {open ? (
            <div className="ml-auto flex rounded-lg ring ring-kumo-line p-0.5">
              {([
                { value: "project", label: "Project" },
                { value: "global", label: "Global" },
              ] as const).map((o) => (
                <button
                  key={o.value}
                  onClick={() => setScope(o.value)}
                  className={`rounded-md px-2 py-0.5 text-xs ${
                    scope === o.value ? "bg-kumo-tint text-kumo-default" : "text-kumo-subtle hover:bg-kumo-elevated"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {open ? (
        <div className="mx-auto w-full max-w-3xl px-6 pb-3 max-h-72 overflow-y-auto grid gap-1.5">
          {loading && !memory ? <p className="text-sm text-kumo-subtle">Memuat…</p> : null}

          {!loading && !count ? (
            <p className="text-sm text-kumo-subtle">
              Belum ada catatan. Yang ditulis di sini ikut ke system prompt setiap turn berikutnya.
            </p>
          ) : null}

          {file?.entries.map((entry, i) => (
            <div key={`${entry.at}-${i}`} className="flex items-start gap-2 rounded-lg ring ring-kumo-line px-2.5 py-1.5">
              <span className="grid gap-0.5 min-w-0 flex-1">
                <span className="text-sm text-kumo-default whitespace-pre-wrap">{entry.text}</span>
                {entry.at ? <span className="text-xs text-kumo-subtle">{entry.at}</span> : null}
              </span>
              <button
                onClick={() => void remove(scope, i)}
                title="Hapus catatan ini"
                className="shrink-0 rounded p-1 text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default"
              >
                <Trash size={12} />
              </button>
            </div>
          ))}

          {editing ? (
            <div className="grid gap-1.5">
              <textarea
                value={fileDraft}
                onChange={(e) => setFileDraft(e.target.value)}
                rows={8}
                className="w-full resize-y rounded-lg px-2.5 py-2 bg-kumo-elevated ring ring-kumo-line text-[0.8125rem] leading-snug font-mono text-kumo-default focus:outline-none focus:ring-kumo-brand"
                placeholder={"- 2026-09-16 14:03 — catatan\n  lanjutan baris"}
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    const res = await replace(scope, fileDraft);
                    setNote(res.ok ? "Berkas disimpan." : res.error);
                    if (res.ok) setEditing(false);
                  }}
                  className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-sm text-kumo-brand hover:bg-kumo-elevated"
                >
                  <Check size={12} /> Simpan berkas
                </button>
                <button onClick={() => setEditing(false)} className="rounded-lg px-2.5 py-1 text-sm text-kumo-subtle hover:bg-kumo-elevated">
                  Batal
                </button>
                <span className="text-xs text-kumo-subtle">Format satu baris per catatan, awali dengan “- ”.</span>
              </div>
            </div>
          ) : (
            <div className="grid gap-1.5">
              <div className="flex items-start gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={2}
                  placeholder={scope === "project" ? "Catatan untuk project ini…" : "Preferensi Anda di semua project…"}
                  className="flex-1 min-w-0 resize-none rounded-lg px-2.5 py-2 bg-kumo-elevated ring ring-kumo-line text-sm text-kumo-default focus:outline-none focus:ring-kumo-brand"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void submit();
                    }
                  }}
                />
                <button
                  onClick={submit}
                  disabled={!draft.trim() || busy}
                  className="shrink-0 rounded-lg px-2.5 py-2 text-sm text-kumo-brand hover:bg-kumo-elevated disabled:opacity-40"
                >
                  Ingat
                </button>
                <button
                  onClick={() => setEditing(true)}
                  title={`Edit berkas ${file?.path ?? ""}`}
                  className="shrink-0 rounded-lg p-2 text-kumo-subtle hover:bg-kumo-elevated"
                >
                  <PencilSimple size={13} />
                </button>
              </div>
              {note ? <p className="text-xs text-kumo-subtle">{note}</p> : null}
              <p className="text-xs text-kumo-subtle">
                {scope === "project" ? (
                  <>
                    Tersimpan di <span className="font-mono">.agents/ONESIST.md</span> — ikut ter-commit bersama project.
                  </>
                ) : (
                  <>
                    Tersimpan di <span className="font-mono">memory.md</span> di folder data aplikasi — berlaku untuk semua project di mesin ini.
                  </>
                )}
              </p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
