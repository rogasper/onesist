/**
 * Global Settings → Agent CLI. Read-only report of which agent CLIs are
 * installed on this machine. Detection is per-launch server state, so a
 * refresh button re-runs it without an app restart.
 *
 * The default agent stays a per-project field (projects.defaultAgent) and is
 * still chosen on the project settings page — nothing here writes.
 */
import { useCallback, useEffect, useState } from "react";
import { ArrowsClockwise, Check, WarningCircle } from "@phosphor-icons/react";
import { agentLogo } from "~/lib/agent-command";
import { AppButton } from "~/components/ui/AppButton";
import { InlineAlert } from "~/components/ui/InlineAlert";

interface DetectedAgent {
  name: string;
  command: string;
  found: boolean;
  version: string | null;
  path: string | null;
}

const AGENTS = [
  { value: "opencode", label: "OpenCode", command: "opencode" },
  { value: "claude", label: "Claude Code", command: "claude" },
  { value: "codex", label: "Codex", command: "codex" },
  { value: "antigravity", label: "Antigravity", command: "agy" },
  { value: "pi", label: "Pi", command: "pi" },
];

export function AgentCliPanel() {
  const [agents, setAgents] = useState<DetectedAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    fetch("/api/agent/detect", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((data: DetectedAgent[]) => {
        setAgents(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-kumo-subtle">
          CLI agent yang terdeteksi di mesin ini. Panel ini hanya laporan — default agent per project tetap dipilih di halaman Settings project.
        </p>
        <AppButton
          variant="chip"
          size="sm"
          onClick={load}
          disabled={loading}
          title="Periksa ulang"
          className="px-3 shrink-0"
        >
          <span className="flex items-center gap-1.5">
            <ArrowsClockwise size={12} className={loading ? "animate-spin" : ""} />
            Segarkan
          </span>
        </AppButton>
      </div>

      {error ? (
        <InlineAlert>Gagal membaca daftar agent.</InlineAlert>
      ) : loading ? (
        <p className="text-xs text-kumo-subtle italic">Memeriksa CLI agent…</p>
      ) : (
        <div className="space-y-1.5">
          {AGENTS.map((a) => {
            const detected = agents.find(
              (d) => d.command === a.command || d.name.toLowerCase() === a.value.toLowerCase(),
            );
            const isFound = detected ? detected.found : false;
            const logo = agentLogo(a.command);
            return (
              <div
                key={a.value}
                className="flex items-center gap-3 rounded-xl px-3 py-2 ring ring-kumo-line/60"
              >
                {logo ? (
                  <img src={logo} alt="" className={`w-4 h-4 rounded-sm object-contain shrink-0 ${!isFound ? "opacity-40 grayscale" : ""}`} />
                ) : null}
                <span className="text-sm font-medium text-kumo-default w-28 shrink-0">{a.label}</span>
                {isFound ? (
                  <span className="flex items-center gap-1 text-[11px] text-green-400 shrink-0">
                    <Check size={12} weight="bold" /> terpasang
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] text-kumo-subtle shrink-0">
                    <WarningCircle size={12} /> tidak ditemukan
                  </span>
                )}
                <span className="text-xs text-kumo-subtle font-mono shrink-0">{detected?.version ?? "—"}</span>
                <span
                  className="text-xs text-kumo-subtle font-mono truncate flex-1 text-right"
                  title={detected?.path ?? undefined}
                >
                  {detected?.path ?? ""}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
