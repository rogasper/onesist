import { useCallback, useEffect, useState } from "react";
import { FilterSelect } from "~/components/ui/FilterSelect";
import { addDetectedAgent, DETECTED_AGENT_PRESETS, type DetectedAgent } from "~/lib/agent-quick";

interface CliProvider {
  id: string;
  name: string;
  apiStyle: string;
  cliAgent: string | null;
}

/**
 * Picks the agent that runs a task. When no CLI agent is set up yet, the agents found on this
 * machine are offered as one-click buttons, so there is no form to fill in.
 */
export function AgentPicker({
  value,
  onChange,
  emptyLabel = "Ikut pengaturan proyek",
}: {
  value: string;
  onChange: (providerId: string) => void;
  emptyLabel?: string;
}) {
  const [providers, setProviders] = useState<CliProvider[]>([]);
  const [detected, setDetected] = useState<DetectedAgent[]>([]);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/providers", { cache: "no-store" })
      .then(async (res) => (res.ok ? ((await res.json()) as { providers: CliProvider[] }) : { providers: [] }))
      .then((data) => setProviders(data.providers.filter((p) => p.apiStyle === "cli")))
      .catch(() => setProviders([]));
    fetch("/api/agent/detect", { cache: "no-store" })
      .then(async (res) => (res.ok ? ((await res.json()) as DetectedAgent[]) : []))
      .then((list) => setDetected(list.filter((a) => a.found && DETECTED_AGENT_PRESETS[a.name])))
      .catch(() => setDetected([]));
  }, []);

  useEffect(() => load(), [load]);

  const add = async (agent: DetectedAgent) => {
    setAdding(agent.name);
    setError(null);
    const id = await addDetectedAgent(agent);
    setAdding(null);
    if (!id) {
      setError(`Gagal menambahkan ${DETECTED_AGENT_PRESETS[agent.name].label}.`);
      return;
    }
    load();
    onChange(id);
  };

  // Agents already set up are not offered again.
  const missing = detected.filter((a) => !providers.some((p) => p.cliAgent === DETECTED_AGENT_PRESETS[a.name].preset.replace("cli-", "")));

  return (
    <div className="space-y-2">
      {providers.length > 0 && (
        <FilterSelect
          value={value}
          onChange={onChange}
          options={[{ value: "", label: emptyLabel }, ...providers.map((p) => ({ value: p.id, label: `${p.name}${p.cliAgent ? ` (${p.cliAgent})` : ""}` }))]}
          className="w-full"
          containerClassName="w-full"
        />
      )}
      {missing.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-kumo-subtle">{providers.length === 0 ? "Belum ada agen CLI. Terdeteksi di mesin ini:" : "Tambah agen terdeteksi:"}</span>
          {missing.map((a) => (
            <button
              key={a.name}
              type="button"
              onClick={() => add(a)}
              disabled={adding !== null}
              className="h-7 rounded-full border border-kumo-line/80 bg-kumo-elevated px-3 text-xs font-medium text-kumo-default disabled:opacity-50"
            >
              {adding === a.name ? "Menambahkan…" : `+ Pakai ${DETECTED_AGENT_PRESETS[a.name].label}`}
            </button>
          ))}
        </div>
      )}
      {providers.length === 0 && missing.length === 0 && (
        <p className="text-[11px] text-amber-400">Tidak ada agen CLI yang terdeteksi. Pasang Claude Code atau opencode dulu.</p>
      )}
      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  );
}
