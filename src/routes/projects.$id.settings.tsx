import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { loadAllData } from "~/lib/project-queries";
import { Gear, Check } from "@phosphor-icons/react";

export const Route = createFileRoute("/projects/$id/settings")({
  loader: async ({ params }) => {
    const data = await loadAllData();
    const project = ((data.projects as any[]) || []).find((p: any) => p.id === params.id) ?? null;
    return { project };
  },
  component: SettingsPage,
});

const AGENTS = [
  { value: "opencode", label: "OpenCode", command: "opencode" },
  { value: "claude", label: "Claude Code", command: "claude" },
  { value: "codex", label: "Codex", command: "codex" },
];

const FONT_SIZES = [11, 12, 13, 14, 15, 16, 18, 20];
const CURSORS = [
  { value: "bar", label: "Bar" },
  { value: "block", label: "Block" },
  { value: "underline", label: "Underline" },
];

interface TerminalPrefs {
  fontSize: number;
  theme: "dark" | "light";
  cursor: "bar" | "block" | "underline";
}

function loadTerminalPrefs(): TerminalPrefs {
  try {
    const raw = localStorage.getItem("terminalPrefs");
    if (raw) return JSON.parse(raw);
  } catch {}
  return { fontSize: 13, theme: "dark", cursor: "bar" };
}

function saveTerminalPrefs(prefs: TerminalPrefs) {
  localStorage.setItem("terminalPrefs", JSON.stringify(prefs));
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

  const [terminalPrefs, setTerminalPrefs] = useState<TerminalPrefs>(loadTerminalPrefs);

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
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {}
    setSaving(false);
  }, [id, name, company, description, defaultAgent, terminalPrefs]);

  if (!project) {
    return <div className="flex items-center justify-center h-48 text-kumo-subtle text-sm">Project not found</div>;
  }

  return (
    <div className="max-w-lg">
      <div className="mb-5">
        <div className="text-xs text-kumo-subtle mb-1">
          <Link to="/projects/$id" params={{ id }} className="text-kumo-subtle hover:text-kumo-default no-underline">Projects</Link>
          <span className="mx-1.5 text-kumo-subtle">/</span>
          <span className="text-kumo-subtle">{project.name}</span>
          <span className="mx-1.5 text-kumo-subtle">/</span>
          <span className="text-kumo-default font-medium">Settings</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded bg-kumo-elevated p-1"><Gear size={14} className="text-kumo-brand" /></div>
          <h1 className="text-lg text-kumo-default">Settings</h1>
        </div>
      </div>

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
            {AGENTS.map((a) => (
              <button
                key={a.value}
                type="button"
                onClick={(e) => { e.stopPropagation(); setDefaultAgent(a.value); }}
                style={defaultAgent === a.value ? { borderColor: "var(--color-kumo-brand, #60a5fa)", color: "var(--color-kumo-brand, #60a5fa)" } : {}}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border transition-all ${
                  defaultAgent === a.value
                    ? "bg-kumo-brand/20 border-kumo-brand/40 font-medium"
                    : "border-kumo-line/50 bg-kumo-elevated/40 text-kumo-subtle hover:text-kumo-default hover:bg-white/5"
                }`}
              >
                <Check size={10} style={{ visibility: defaultAgent === a.value ? "visible" : "hidden" }} />
                {a.label}
              </button>
            ))}
          </div>
        </Section>

        {/* Terminal */}
        <Section title="Terminal">
          <Field label="Font Size">
            <select value={terminalPrefs.fontSize} onChange={(e) => setTerminalPrefs(p => ({ ...p, fontSize: Number(e.target.value) }))}
              className="bg-kumo-elevated/40 text-sm text-kumo-default rounded-full border border-kumo-line/50 px-3.5 py-1.5 outline-none focus:border-kumo-brand">
              {FONT_SIZES.map((s) => <option key={s} value={s}>{s}px</option>)}
            </select>
          </Field>
          <Field label="Theme">
            <div className="flex gap-2">
              {(["dark", "light"] as const).map((t) => (
                <button key={t} type="button"
                  onClick={(e) => { e.stopPropagation(); setTerminalPrefs(p => ({ ...p, theme: t })); }}
                  style={terminalPrefs.theme === t ? { borderColor: "var(--color-kumo-brand, #60a5fa)", color: "var(--color-kumo-brand, #60a5fa)" } : {}}
                  className={`px-3 py-1.5 text-xs rounded-full border capitalize transition-all ${
                    terminalPrefs.theme === t ? "bg-kumo-brand/20 border-kumo-brand/40 font-medium" : "border-kumo-line/50 bg-kumo-elevated/40 text-kumo-subtle hover:text-kumo-default hover:bg-white/5"
                  }`}
                >{t}</button>
              ))}
            </div>
          </Field>
          <Field label="Cursor">
            <div className="flex gap-2">
              {CURSORS.map((c) => (
                <button key={c.value} type="button"
                  onClick={(e) => { e.stopPropagation(); setTerminalPrefs(p => ({ ...p, cursor: c.value as "bar" | "block" | "underline" })); }}
                  style={terminalPrefs.cursor === c.value ? { borderColor: "var(--color-kumo-brand, #60a5fa)", color: "var(--color-kumo-brand, #60a5fa)" } : {}}
                  className={`px-3 py-1.5 text-xs rounded-full border transition-all ${
                    terminalPrefs.cursor === c.value ? "bg-kumo-brand/20 border-kumo-brand/40 font-medium" : "border-kumo-line/50 bg-kumo-elevated/40 text-kumo-subtle hover:text-kumo-default hover:bg-white/5"
                  }`}
                >{c.label}</button>
              ))}
            </div>
          </Field>
        </Section>

        {/* Save */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-kumo-brand rounded hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
          </button>
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
