import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { loadProjectRouteData } from "~/lib/project-queries";
import { Gear, Check, WarningCircle } from "@phosphor-icons/react";
import { AppButton } from "~/components/ui/AppButton";
import { PageHeader } from "~/components/ui/PageHeader";
import { FilterSelect } from "~/components/ui/FilterSelect";
import { ProjectNotFound } from "~/components/ui/ProjectNotFound";
import { agentLogo } from "~/lib/agent-command";
import { loadTerminalPrefs, saveTerminalPrefs, type TerminalPrefs } from "~/lib/terminal-prefs";

export const Route = createFileRoute("/projects/$id/settings")({
  loader: async ({ params }) => loadProjectRouteData(params.id),
  component: SettingsPage,
});

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

function SettingsPage() {
  const { id } = Route.useParams();
  const { project } = Route.useLoaderData() as { project: any };

  const [name, setName] = useState(project?.name ?? "");
  const [company, setCompany] = useState(project?.company ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [defaultAgent, setDefaultAgent] = useState(project?.defaultAgent ?? "opencode");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [detectedAgents, setDetectedAgents] = useState<DetectedAgent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(true);

  const [terminalPrefs, setTerminalPrefs] = useState<TerminalPrefs>(loadTerminalPrefs);

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

  return (
    <div className="max-w-lg">
      <PageHeader
        icon={<Gear size={14} className="text-kumo-brand" />}
        title="Settings"
        help="settings"
        className="mb-5 shrink-0"
      />

      <div className="space-y-5">
        {/* Project */}
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

        {/* Agent */}
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

        {/* Terminal */}
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

        {/* Save */}
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
