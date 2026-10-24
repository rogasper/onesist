import { useState } from "react";
import { AgentPicker } from "~/components/tasks/AgentPicker";
import { useExecSettings } from "~/lib/use-exec-settings";
import type { TaskMode } from "~/shared/types";

const MODES: { value: TaskMode; label: string; help: string }[] = [
  { value: "execution", label: "Eksekusi oleh agen", help: "Task bisa dijalankan agen dari board." },
  { value: "delivery", label: "Delivery saja", help: "Task hanya dilihat dan dikelola seperti biasa, tanpa tombol eksekusi." },
];

export function TaskExecutionPanel({ projectId }: { projectId: string }) {
  const { settings, loading, error, save } = useExecSettings(projectId);
  const [saved, setSaved] = useState(false);

  if (!settings) {
    return <p className="text-xs text-kumo-subtle">{loading ? "Memuat…" : error ?? "Pengaturan tidak tersedia"}</p>;
  }

  const choose = async (taskMode: TaskMode) => {
    if (taskMode === settings.taskMode) return;
    if (await save({ taskMode })) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Mode task" className="grid gap-2 sm:grid-cols-2">
        {MODES.map((m) => {
          const active = settings.taskMode === m.value;
          return (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => choose(m.value)}
              className={`rounded-xl border p-3 text-left transition-colors ${
                active ? "border-kumo-brand bg-kumo-brand/10" : "border-kumo-line/50 bg-kumo-base hover:border-kumo-brand/40"
              }`}
            >
              <span className="block text-sm font-medium text-kumo-default">{m.label}</span>
              <span className="mt-1 block text-xs text-kumo-subtle">{m.help}</span>
            </button>
          );
        })}
      </div>
      {settings.taskMode === "execution" && (
        <div className="space-y-2 rounded-xl border border-kumo-line/50 p-3">
          <p className="text-sm font-medium text-kumo-default">Agen eksekusi default</p>
          <p className="text-[11px] text-kumo-subtle">Dipakai semua task di proyek ini, kecuali task punya agen sendiri.</p>
          <AgentPicker value={settings.execProviderId ?? ""} onChange={(id) => save({ execProviderId: id || null })} />
          <input
            key={settings.execModel ?? "none"}
            defaultValue={settings.execModel ?? ""}
            onBlur={(e) => {
              const v = e.target.value.trim() || null;
              if (v !== (settings.execModel ?? null)) save({ execModel: v });
            }}
            placeholder="Model default (kosong = default agen)"
            className="h-8 w-full rounded-full border border-kumo-line/80 bg-kumo-elevated px-3 text-xs text-kumo-default placeholder:text-kumo-subtle"
          />
        </div>
      )}
      <div className="text-xs">
        {saved && <span className="text-kumo-brand">Tersimpan</span>}
        {error && <span className="text-red-400">{error}</span>}
      </div>
    </div>
  );
}
