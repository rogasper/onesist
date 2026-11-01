import { BrowserSection } from "~/components/settings/BrowserSection";
import { IndexPanel } from "~/components/settings/IndexPanel";
import { McpPanel } from "~/components/settings/McpPanel";
import { McpServersPanel } from "~/components/settings/McpServersPanel";
import { SubagentsPanel } from "~/components/settings/SubagentsPanel";
import { TaskExecutionPanel } from "~/components/settings/TaskExecutionPanel";
import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { loadProjectRouteData } from "~/lib/project-queries";
import { Gear, Check, WarningCircle, Key, Plus } from "@phosphor-icons/react";
import { AppButton } from "~/components/ui/AppButton";
import { PageHeader } from "~/components/ui/PageHeader";
import { FilterSelect } from "~/components/ui/FilterSelect";
import { ProviderSettings } from "~/components/providers/ProviderSettings";
import { useProviders } from "~/lib/use-providers";
import { ProjectNotFound } from "~/components/ui/ProjectNotFound";
import { agentLogo } from "~/lib/agent-command";
import { loadTerminalPrefs, saveTerminalPrefs, type TerminalPrefs } from "~/lib/terminal-prefs";

export const Route = createFileRoute("/projects/$id/settings")({
  loader: async ({ params }) => loadProjectRouteData(params.id),
  component: SettingsPageRoute,
});

function SettingsPageRoute() {
  const { id } = Route.useParams();
  return <SettingsPage key={id} />;
}
const AGENTS = [
  { value: "opencode", label: "OpenCode", command: "opencode" },
  { value: "claude", label: "Claude Code", command: "claude" },
  { value: "codex", label: "Codex", command: "codex" },
  { value: "antigravity", label: "Antigravity", command: "agy" },
  { value: "pi", label: "Pi", command: "pi" },
];

const FONT_SIZES = [11, 12, 13, 14, 15, 16, 18, 20];
const CURSORS = [
  { value: "bar", label: "Bar" },
  { value: "block", label: "Block" },
  { value: "underline", label: "Underline" },
];

interface DetectedAgent {
  name: string;
  command: string;
  found: boolean;
  version: string | null;
  path: string | null;
}

type SettingsTab = "umum" | "byok" | "mcp" | "subagent" | "task" | "terminal";

function SettingsPage() {
  const { id } = Route.useParams();
  const { project } = Route.useLoaderData() as { project: any };

  const [activeTab, setActiveTab] = useState<SettingsTab>("umum");

  const [name, setName] = useState(project?.name ?? "");
  const [company, setCompany] = useState(project?.company ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [defaultAgent, setDefaultAgent] = useState(project?.defaultAgent ?? "opencode");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [detectedAgents, setDetectedAgents] = useState<DetectedAgent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);

  const [terminalPrefs, setTerminalPrefs] = useState<TerminalPrefs>(loadTerminalPrefs);
  const [providersOpen, setProvidersOpen] = useState(false);
  const { providers, loading: providersLoading, refresh: refreshProviders, updateProvider } = useProviders();

  useEffect(() => {
    setAgentsLoading(true);
    fetch("/api/agent/detect", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: DetectedAgent[]) => {
        setDetectedAgents(Array.isArray(data) ? data : []);
        setAgentsLoading(false);
      })
      .catch(() => setAgentsLoading(false));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, company, description, defaultAgent }),
      });
      if (res.ok) {
        saveTerminalPrefs(terminalPrefs);
        setSaved(true);
        window.dispatchEvent(new Event("project-updated"));
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {}
    setSaving(false);
  }, [id, name, company, description, defaultAgent, terminalPrefs]);

  if (!project) {
    return <ProjectNotFound />;
  }

  const TABS: { id: SettingsTab; label: string }[] = [
    { id: "umum", label: "Umum & Agent" },
    { id: "byok", label: "Model & BYOK" },
    { id: "mcp", label: "MCP" },
    { id: "subagent", label: "Subagent" },
    { id: "task", label: "Task" },
    { id: "terminal", label: "Terminal & Index" },
  ];

  return (
    <div className="max-w-2xl">
      <PageHeader
        icon={<Gear size={14} className="text-kumo-brand" />}
        title="Settings"
        help="settings"
        className="mb-4 shrink-0"
      />

      <div className="flex items-center gap-1.5 mb-5 border-b border-kumo-line pb-3">
        {TABS.map((t) => (
          <AppButton
            key={t.id}
            variant="chip"
            size="sm"
            active={activeTab === t.id}
            onClick={() => setActiveTab(t.id)}
            className="px-3"
          >
            {t.label}
          </AppButton>
        ))}
      </div>

      {activeTab === "umum" && (
        <div className="space-y-5">
          <Section title="Project">
            <Field label="Name">
              <input value={name} onChange={(e) => setName(e.target.value)}
                className="w-full bg-kumo-elevated/40 text-sm text-kumo-default rounded-full border border-kumo-line/50 px-3.5 py-1.5 outline-none focus:border-kumo-brand" />
            </Field>
            <Field label="Company">
              <input value={company} onChange={(e) => setCompany(e.target.value)}
                className="w-full bg-kumo-elevated/40 text-sm text-kumo-default rounded-full border border-kumo-line/50 px-3.5 py-1.5 outline-none focus:border-kumo-brand" />
            </Field>
            <Field label="Description">
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
                className="w-full bg-kumo-elevated/40 text-sm text-kumo-default rounded-xl border border-kumo-line/50 px-3.5 py-2 outline-none focus:border-kumo-brand resize-none" />
            </Field>
            <Field label="Root Path">
              <div className="text-xs text-kumo-subtle py-1.5 px-3 font-mono truncate bg-kumo-elevated/40 rounded-full border border-kumo-line/30">{project.rootPath || "(none)"}</div>
            </Field>
          </Section>

          <Section title="Default Agent">
            <div className="flex gap-2 flex-wrap">
              {AGENTS.map((a) => {
                const logo = agentLogo(a.value);
                const detected = detectedAgents.find(
                  (d) => d.command === a.command || d.name.toLowerCase() === a.value.toLowerCase()
                );
                const isFound = detected ? detected.found : false;
                const isSelected = defaultAgent === a.value;

                return (
                  <AppButton
                    key={a.value}
                    variant="chip"
                    size="sm"
                    active={isSelected}
                    disabled={!isFound}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isFound) setDefaultAgent(a.value);
                    }}
                    className={`px-3 transition-opacity ${!isFound ? "opacity-40 cursor-not-allowed grayscale" : ""}`}
                    title={!isFound ? `${a.label} is not installed on this machine` : detected?.version ? `${a.label} (${detected.version})` : a.label}
                  >
                    <span className="flex items-center gap-1.5">
                      {logo && <img src={logo} alt="" className={`w-4 h-4 rounded-sm object-contain ${!isFound ? "opacity-60" : ""}`} />}
                      {a.label}
                      {isSelected && <Check size={10} className="text-kumo-brand" weight="bold" />}
                      {!isFound && <span className="text-[10px] text-kumo-subtle">(not installed)</span>}
                    </span>
                  </AppButton>
                );
              })}
            </div>
            {agentsLoading ? (
              <p className="text-[11px] text-kumo-subtle italic mt-2">Checking installed agent CLIs…</p>
            ) : (
              <div className="mt-1 space-y-1">
                <p className="text-[11px] text-kumo-subtle">
                  Only installed CLI agents can be selected.
                </p>
                {(() => {
                  const currentAgentInfo = detectedAgents.find(
                    (d) => d.command === defaultAgent || d.name.toLowerCase() === defaultAgent.toLowerCase()
                  );
                  if (currentAgentInfo && !currentAgentInfo.found) {
                    return (
                      <div className="flex items-center gap-1.5 text-xs text-amber-400 mt-1">
                        <WarningCircle size={14} className="shrink-0" />
                        <span>
                          The current default agent (<b>{defaultAgent}</b>) is not detected on this machine.
                        </span>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            )}
          </Section>

          <Section title="BYOK Model Provider">
            <div className="space-y-2">
              <p className="text-[11px] text-kumo-subtle">
                Provider LLM kustom (OpenAI, Anthropic, Ollama, Zen, dsb.) yang digunakan oleh percakapan dan agen.
              </p>
              {providersLoading ? (
                <p className="text-xs text-kumo-subtle italic">Memuat provider…</p>
              ) : providers.length === 0 ? (
                <div className="p-3 rounded-xl border border-dashed border-kumo-line bg-kumo-elevated/20 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-kumo-subtle">
                    <Key size={14} className="text-amber-400" />
                    <span>Belum ada provider BYOK yang terdaftar</span>
                  </div>
                  <AppButton variant="secondary" size="sm" onClick={() => setProvidersOpen(true)}>
                    + Tambah Provider
                  </AppButton>
                </div>
              ) : (
                <Field label="Default Provider">
                  <div className="flex items-center gap-2">
                    <select
                      value={providers.find((p) => p.isDefault)?.id ?? providers[0]?.id ?? ""}
                      onChange={(e) => {
                        const chosen = providers.find((p) => p.id === e.target.value);
                        if (chosen) void updateProvider(chosen.id, { isDefault: true });
                      }}
                      className="flex-1 bg-kumo-elevated/40 text-sm text-kumo-default rounded-full border border-kumo-line/50 px-3.5 py-1.5 outline-none focus:border-kumo-brand"
                    >
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.presetLabel || p.preset}){p.model ? ` — ${p.model}` : ""}{p.isDefault ? " [Default]" : ""}
                        </option>
                      ))}
                    </select>
                    <AppButton variant="secondary" size="sm" onClick={() => setActiveTab("byok")}>
                      Kelola
                    </AppButton>
                  </div>
                </Field>
              )}
            </div>
          </Section>

          <div className="flex items-center gap-3">
            <AppButton
              variant="primary"
              size="base"
              onClick={handleSave}
              disabled={saving}
              className="rounded px-4"
            >
              {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
            </AppButton>
            {saved && <span className="text-xs text-kumo-brand">Settings saved</span>}
          </div>
        </div>
      )}
      {activeTab === "byok" && (
        <div className="space-y-5">
          <Section title="Daftar Model & Provider (BYOK)">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-kumo-subtle">
                Konfigurasi kunci API dan model LLM kustom (Bring Your Own Key). Provider bertanda Default akan dipilih otomatis pada percakapan chat baru.
              </p>
              <AppButton variant="primary" size="sm" onClick={() => setProvidersOpen(true)} className="shrink-0 gap-1.5">
                <Plus size={12} weight="bold" />
                Tambah Provider
              </AppButton>
            </div>

            {providersLoading ? (
              <p className="text-xs text-kumo-subtle italic py-4">Memuat provider…</p>
            ) : providers.length === 0 ? (
              <div className="py-8 text-center border border-dashed border-kumo-line rounded-2xl bg-kumo-elevated/10">
                <Key size={24} className="mx-auto text-kumo-subtle mb-2" />
                <p className="text-xs font-medium text-kumo-default">Belum ada provider yang dikonfigurasi</p>
                <p className="text-[11px] text-kumo-subtle mt-1 mb-4">Tambahkan OpenAI, Anthropic, Ollama, atau endpoint OpenAI-compatible lainnya.</p>
                <AppButton variant="primary" size="sm" onClick={() => setProvidersOpen(true)}>
                  + Tambah Provider Pertama
                </AppButton>
              </div>
            ) : (
              <div className="grid gap-2.5">
                {providers.map((p) => (
                  <div
                    key={p.id}
                    className="p-3.5 rounded-xl border border-kumo-line/60 bg-kumo-elevated/30 flex items-center justify-between gap-3 hover:border-kumo-line transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-kumo-default truncate">{p.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-kumo-elevated text-kumo-subtle border border-kumo-line/50">
                          {p.presetLabel || p.preset}
                        </span>
                        {p.isDefault && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-kumo-brand/15 text-kumo-brand font-medium">
                            Default
                          </span>
                        )}
                        {p.lastTestOk === true ? (
                          <span className="text-[10px] text-green-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                            Terhubung {p.lastTestLatencyMs ? `(${p.lastTestLatencyMs}ms)` : ""}
                          </span>
                        ) : p.lastTestOk === false ? (
                          <span className="text-[10px] text-red-400 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
                            Gagal
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-kumo-subtle mt-1 flex items-center gap-3 font-mono">
                        {p.model && <span>Model: {p.model}</span>}
                        {p.endpoint && <span className="truncate max-w-[260px] opacity-75">{p.endpoint}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!p.isDefault && (
                        <AppButton
                          variant="secondary"
                          size="sm"
                          onClick={() => void updateProvider(p.id, { isDefault: true })}
                          title="Jadikan provider default untuk percakapan baru"
                        >
                          Set Default
                        </AppButton>
                      )}
                      <AppButton
                        variant="secondary"
                        size="sm"
                        onClick={() => setProvidersOpen(true)}
                      >
                        Konfigurasi
                      </AppButton>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      )}

      {activeTab === "mcp" && (
        <div className="space-y-5">
          <Section title="MCP Servers (Eksternal)">
            <McpServersPanel />
          </Section>
          <Section title="Onesist MCP Endpoint (untuk Agent luar)">
            <McpPanel projectId={id} />
          </Section>
        </div>
      )}

      {activeTab === "subagent" && (
        <div className="space-y-5">
          <Section title="Subagent">
            <SubagentsPanel projectId={id} />
          </Section>
        </div>
      )}

      {activeTab === "task" && (
        <div className="space-y-5">
          <Section title="Mode task">
            <TaskExecutionPanel projectId={id} />
          </Section>
        </div>
      )}

      {activeTab === "terminal" && (
        <div className="space-y-5">
          <Section title="Index">
            <IndexPanel projectId={id} />
          </Section>

          <BrowserSection />

          <Section title="Terminal">
            <Field label="Font Size">
              <FilterSelect
                value={String(terminalPrefs.fontSize)}
                onChange={(val) => setTerminalPrefs((p) => ({ ...p, fontSize: Number(val) }))}
              >
                {FONT_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}px
                  </option>
                ))}
              </FilterSelect>
            </Field>
            <Field label="Theme">
              <div className="flex gap-2">
                {(["dark", "light"] as const).map((t) => (
                  <AppButton
                    key={t}
                    variant="chip"
                    size="sm"
                    active={terminalPrefs.theme === t}
                    onClick={(e) => { e.stopPropagation(); setTerminalPrefs(p => ({ ...p, theme: t })); }}
                    className="px-3 capitalize"
                  >{t}</AppButton>
                ))}
              </div>
            </Field>
            <Field label="Cursor">
              <div className="flex gap-2">
                {CURSORS.map((c) => (
                  <AppButton
                    key={c.value}
                    variant="chip"
                    size="sm"
                    active={terminalPrefs.cursor === c.value}
                    onClick={(e) => { e.stopPropagation(); setTerminalPrefs(p => ({ ...p, cursor: c.value as "bar" | "block" | "underline" })); }}
                    className="px-3"
                  >{c.label}</AppButton>
                ))}
              </div>
            </Field>
          </Section>

          <div className="flex items-center gap-3">
            <AppButton
              variant="primary"
              size="base"
              onClick={handleSave}
              disabled={saving}
              className="rounded px-4"
            >
              {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
            </AppButton>
            {saved && <span className="text-xs text-kumo-brand">Settings saved</span>}
          </div>
        </div>
      )}
      <ProviderSettings
        variant="modal"
        open={providersOpen}
        onClose={() => { setProvidersOpen(false); void refreshProviders(); }}
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass-panel rounded-2xl p-4 sm:p-5">
      <h2 className="text-xs font-medium text-kumo-subtle uppercase tracking-wider mb-3">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <label className="text-xs text-kumo-subtle w-20 shrink-0 pt-1.5">{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  );
}
